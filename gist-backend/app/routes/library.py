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
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.db import get_db
from app.services.gemini import embed_text
from app.services.categorize import categorize_text

logger = logging.getLogger(__name__)

router = APIRouter()


class SaveGistRequest(BaseModel):
    original_text: str
    explanation: str
    mode: str
    url: str


@router.post("/library/save")
async def save_gist(body: SaveGistRequest):
    """Manually save a gist to MongoDB."""
    db = get_db()
    if db is None:
        return JSONResponse(
            status_code=503,
            content={"error": "Library unavailable — database not connected.", "code": "DB_UNAVAILABLE"},
        )

    try:
        # Combine selected text + explanation for better keyword coverage
        category = categorize_text(f"{body.original_text}\n{body.explanation}")
        embedding = None
        try:
            embedding = await embed_text(f"{body.original_text} {body.explanation}")
        except Exception as exc:
            logger.warning("Embedding generation failed — saving without embedding: %s", exc)

        doc = {
            "original_text": body.original_text,
            "explanation": body.explanation,
            "mode": body.mode,
            "url": body.url,
            "category": category,
            "created_at": datetime.now(timezone.utc),
        }
        if embedding is not None:
            doc["embedding"] = embedding

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
            {"_id": 1, "original_text": 1, "explanation": 1, "mode": 1, "url": 1, "category": 1, "created_at": 1},
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
        items.append(doc)

    return {"items": items}


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
