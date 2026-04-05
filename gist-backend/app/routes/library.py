# app/routes/library.py
"""
GET  /library       — returns the user's saved gist history, newest first.
POST /library/save  — manually save a single gist.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter
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
        category = categorize_text(body.original_text)
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
            # Exclude the internal ObjectId; serialize created_at as ISO string below.
            {"_id": 0, "original_text": 1, "explanation": 1, "mode": 1, "url": 1, "category": 1, "created_at": 1},
        ).sort("created_at", -1).limit(100)

        raw_items = await cursor.to_list(length=100)
    except Exception as exc:
        logger.error("Library query failed: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=503,
            content={"error": "Library unavailable — database query failed.", "code": "DB_ERROR"},
        )

    # Convert datetime objects to ISO-8601 strings for JSON serialization.
    items = []
    for doc in raw_items:
        if "created_at" in doc and hasattr(doc["created_at"], "isoformat"):
            doc["created_at"] = doc["created_at"].isoformat()
        items.append(doc)

    return {"items": items}
