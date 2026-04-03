# app/routes/library.py
"""
GET /library — returns the user's saved gist history, newest first.
"""
import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.db import get_db

logger = logging.getLogger(__name__)

router = APIRouter()


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
