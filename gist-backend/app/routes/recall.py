# app/routes/recall.py
"""
POST   /library/{id}/recall   — auto-generate a recall card via Gemini
PUT    /library/{id}/recall   — save a user-edited custom recall card
DELETE /library/{id}/recall   — remove the recall card from a gist
"""
import logging
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.db import get_db
from app.services.gemini import generate_recall_card

logger = logging.getLogger(__name__)
router = APIRouter()


class RecallCardBody(BaseModel):
    front: str = Field(min_length=1, max_length=500)
    back: str = Field(min_length=1, max_length=2000)


def _oid(gist_id: str) -> ObjectId:
    try:
        return ObjectId(gist_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid gist id.")


@router.post("/library/{gist_id}/recall")
async def auto_generate_recall(gist_id: str, request: Request):
    """Auto-generate a recall card for a gist using Gemini."""
    db = get_db()
    if db is None:
        return JSONResponse(
            status_code=503,
            content={"error": "Library unavailable.", "code": "DB_UNAVAILABLE"},
        )

    oid = _oid(gist_id)
    doc = await db["gists"].find_one({"_id": oid}, {"original_text": 1, "explanation": 1})
    if doc is None:
        raise HTTPException(status_code=404, detail="Gist not found.")

    user_api_key = request.headers.get("X-Gemini-Api-Key") or None
    try:
        card = await generate_recall_card(
            original_text=doc.get("original_text", ""),
            explanation=doc.get("explanation", ""),
            api_key=user_api_key,
        )
    except Exception as exc:
        logger.warning("Recall card generation failed for %s: %s", gist_id, exc)
        return JSONResponse(
            status_code=503,
            content={"error": f"Could not generate recall card: {exc}", "code": "LLM_ERROR"},
        )

    recall_doc = {
        **card,
        "is_custom": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db["gists"].update_one({"_id": oid}, {"$set": {"recall_card": recall_doc}})
    return {"recall_card": recall_doc}


@router.put("/library/{gist_id}/recall")
async def save_custom_recall(gist_id: str, body: RecallCardBody):
    """Save a user-edited recall card."""
    db = get_db()
    if db is None:
        return JSONResponse(
            status_code=503,
            content={"error": "Library unavailable.", "code": "DB_UNAVAILABLE"},
        )

    oid = _oid(gist_id)
    if not await db["gists"].find_one({"_id": oid}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Gist not found.")

    recall_doc = {
        "front": body.front,
        "back": body.back,
        "is_custom": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db["gists"].update_one({"_id": oid}, {"$set": {"recall_card": recall_doc}})
    return {"recall_card": recall_doc}


@router.delete("/library/{gist_id}/recall")
async def delete_recall(gist_id: str):
    """Remove the recall card from a gist."""
    db = get_db()
    if db is None:
        return JSONResponse(
            status_code=503,
            content={"error": "Library unavailable.", "code": "DB_UNAVAILABLE"},
        )

    oid = _oid(gist_id)
    result = await db["gists"].update_one({"_id": oid}, {"$unset": {"recall_card": ""}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Gist not found.")
    return {"success": True}
