# app/routes/library.py
"""
GET    /library          — returns the user's saved gist history, newest first.
POST   /library/save     — manually save a single gist.
DELETE /library/{id}     — delete a single gist by its MongoDB ObjectId string.
"""
import logging
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.limiter import limiter

from app.db import get_db
from app.services.gemini import embed_text, generate_tags
from app.services.categorize import categorize_text

logger = logging.getLogger(__name__)

router = APIRouter()


class SaveGistRequest(BaseModel):
    original_text: str = Field(max_length=10_000)
    explanation: str = Field(max_length=10_000)
    mode: str = Field(max_length=50)
    url: str = Field(max_length=2048)
    gist_type: str = "text"
    image_data: str | None = Field(default=None, max_length=2_000_000)


@router.post("/library/save")
@limiter.limit("10/minute")
async def save_gist(request: Request, body: SaveGistRequest):
    """Manually save a gist to MongoDB."""
    db = get_db()
    if db is None:
        return JSONResponse(
            status_code=503,
            content={"error": "Library unavailable — database not connected.", "code": "DB_UNAVAILABLE"},
        )

    user_api_key = request.headers.get("X-Gemini-Api-Key") or None
    try:
        # Combine selected text + explanation for better keyword coverage
        category = categorize_text(f"{body.original_text}\n{body.explanation}")

        # Run embedding and tag generation concurrently
        import asyncio as _asyncio
        embedding_task = _asyncio.create_task(
            embed_text(f"{body.original_text} {body.explanation}", user_api_key)
        )
        tags_task = _asyncio.create_task(
            generate_tags(body.original_text, body.explanation, user_api_key)
        )

        embedding = None
        try:
            embedding = await embedding_task
        except Exception as exc:
            logger.warning("Embedding generation failed — saving without embedding: %s", exc)

        tags: list[str] = []
        try:
            tags = await tags_task
        except Exception as exc:
            logger.warning("Tag generation failed — saving without tags: %s", exc)

        doc = {
            "original_text": body.original_text,
            "explanation": body.explanation,
            "mode": body.mode,
            "url": body.url,
            "category": category,
            "tags": tags,
            "gist_type": body.gist_type,
            "created_at": datetime.now(timezone.utc),
        }
        if embedding is not None:
            doc["embedding"] = embedding
        if body.image_data is not None:
            doc["image_data"] = body.image_data

        await db["gists"].insert_one(doc)
        return {"success": True}
    except Exception as exc:
        logger.error("Failed to save gist: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to save gist.", "code": "SAVE_ERROR"},
        )


@router.get("/library")
async def get_library():
    """
    Return up to 100 most-recently saved gists.
    Returns 503 when MongoDB is not configured or unreachable.
    """
    db = get_db()
    if db is None:
        return JSONResponse(
            status_code=503,
            content={"error": "Library unavailable — database not connected.", "code": "DB_UNAVAILABLE"},
        )

    try:
        cursor = db["gists"].find(
            {},
            {"_id": 1, "original_text": 1, "explanation": 1, "mode": 1, "url": 1, "category": 1, "tags": 1, "gist_type": 1, "image_data": 1, "created_at": 1},
        ).sort("created_at", -1).limit(100)

        raw_items = await cursor.to_list(length=100)
    except Exception as exc:
        logger.error("Library query failed: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=503,
            content={"error": "Library unavailable — database query failed.", "code": "DB_ERROR"},
        )

    # Convert datetime objects to ISO-8601 strings; expose _id as string "id".
    items = []
    for doc in raw_items:
        if "created_at" in doc and hasattr(doc["created_at"], "isoformat"):
            doc["created_at"] = doc["created_at"].isoformat()
        doc["id"] = str(doc.pop("_id"))
        # Ensure tags is always a list (older docs without the field get [])
        doc.setdefault("tags", [])
        doc.setdefault("gist_type", "text")
        items.append(doc)

    return {"items": items}


@router.get("/library/tags")
async def get_library_tags():
    """
    Return the top 20 tags across all gists, sorted by frequency descending.
    Each entry: {"tag": str, "count": int}
    """
    db = get_db()
    if db is None:
        return JSONResponse(
            status_code=503,
            content={"error": "Library unavailable — database not connected.", "code": "DB_UNAVAILABLE"},
        )

    try:
        pipeline = [
            {"$unwind": "$tags"},
            {"$group": {"_id": "$tags", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 20},
            {"$project": {"_id": 0, "tag": "$_id", "count": 1}},
        ]
        cursor = db["gists"].aggregate(pipeline)
        raw = await cursor.to_list(length=20)
        return {"tags": raw}
    except Exception as exc:
        logger.error("Tag aggregation failed: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=503,
            content={"error": "Failed to retrieve tags.", "code": "DB_ERROR"},
        )


@router.post("/library/backfill")
async def backfill_embeddings_and_categories(request: Request):
    """
    Retroactively generate embeddings and fix categories for gists saved without them.
    Safe to call multiple times — only processes documents missing the embedding field.
    Accepts X-Gemini-Api-Key header to use the caller's API key.
    """
    db = get_db()
    if db is None:
        return JSONResponse(
            status_code=503,
            content={"error": "Library unavailable — database not connected.", "code": "DB_UNAVAILABLE"},
        )

    user_api_key = request.headers.get("X-Gemini-Api-Key") or None

    cursor = db["gists"].find(
        {"embedding": {"$exists": False}},
        {"_id": 1, "original_text": 1, "explanation": 1},
    )
    docs = await cursor.to_list(length=500)

    if not docs:
        return {"backfilled": 0, "message": "All gists already have embeddings."}

    success = 0
    failed = 0
    first_error: str | None = None
    for doc in docs:
        try:
            combined = f"{doc.get('original_text', '')} {doc.get('explanation', '')}"
            embedding = await embed_text(combined, user_api_key)
            category = categorize_text(combined)
            await db["gists"].update_one(
                {"_id": doc["_id"]},
                {"$set": {"embedding": embedding, "category": category}},
            )
            success += 1
        except Exception as exc:
            logger.warning("Backfill failed for %s: %s", doc["_id"], exc)
            if first_error is None:
                first_error = str(exc)
            failed += 1

    return {"backfilled": success, "failed": failed, "total": len(docs), "first_error": first_error}


@router.delete("/library/{gist_id}")
async def delete_gist(gist_id: str):
    """Delete a single gist by its MongoDB ObjectId string."""
    db = get_db()
    if db is None:
        return JSONResponse(
            status_code=503,
            content={"error": "Library unavailable — database not connected.", "code": "DB_UNAVAILABLE"},
        )

    try:
        oid = ObjectId(gist_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid gist id.")

    try:
        result = await db["gists"].delete_one({"_id": oid})
    except Exception as exc:
        logger.error("Failed to delete gist %s: %s", gist_id, exc, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to delete gist.", "code": "DELETE_ERROR"},
        )

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Gist not found.")

    return {"success": True}
