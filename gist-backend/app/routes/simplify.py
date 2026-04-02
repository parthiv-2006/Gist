# app/routes/simplify.py
import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import ValidationError

from app.models.schemas import SimplifyRequest
from app.services.gemini import stream_explanation
from app.services.categorize import categorize_text
from app.db import get_db

logger = logging.getLogger(__name__)

router = APIRouter()


async def _save_gist(
    original_text: str,
    explanation: str,
    mode: str,
    url: str,
) -> None:
    """
    Persist a completed gist to MongoDB.  Runs as a fire-and-forget task
    so it never delays the streaming response.  Failures are logged only.
    """
    db = get_db()
    if db is None:
        return
    try:
        category = categorize_text(original_text)
        doc = {
            "original_text": original_text,
            "explanation": explanation,
            "mode": mode,
            "url": url,
            "category": category,
            "created_at": datetime.now(timezone.utc),
        }
        await db["gists"].insert_one(doc)
    except Exception as exc:
        logger.warning("Failed to save gist to MongoDB: %s", exc)


@router.post("/api/v1/simplify")
async def simplify(request: Request):
    # 1. Parse and validate the request body
    try:
        body = await request.json()
        payload = SimplifyRequest(**body)
    except ValidationError as e:
        first_error_msg = e.errors()[0]["msg"]

        if "EMPTY_TEXT" in first_error_msg:
            return JSONResponse(
                status_code=400,
                content={
                    "error": "The request must contain either selected_text or image_data.",
                    "code": "EMPTY_TEXT",
                },
            )
        if "TEXT_TOO_LONG" in first_error_msg:
            return JSONResponse(
                status_code=400,
                content={
                    "error": "selected_text exceeds 2000 characters.",
                    "code": "TEXT_TOO_LONG",
                },
            )
        if "HISTORY_TOO_LONG" in first_error_msg:
            return JSONResponse(
                status_code=400,
                content={
                    "error": "Conversation history exceeds the maximum allowed size.",
                    "code": "HISTORY_TOO_LONG",
                },
            )
        return JSONResponse(
            status_code=400,
            content={"error": str(e), "code": "VALIDATION_ERROR"},
        )
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid request body.", "code": "VALIDATION_ERROR"},
        )

    # 2. Attempt to fetch the first chunk to catch RuntimeError before we
    #    commit to a StreamingResponse — lets us still return a proper 503.
    first_chunk: str | None = None
    try:
        gen = stream_explanation(
            payload.selected_text,
            payload.page_context,
            payload.complexity_level,
            [m.model_dump() for m in payload.messages] if payload.messages else None,
            payload.image_data,
            payload.image_mime_type
        )
        async for chunk in gen:
            first_chunk = chunk
            break
    except RuntimeError as e:
        return JSONResponse(
            status_code=503,
            content={
                "error": f"The LLM service is temporarily unavailable. Detail: {e}",
                "code": "LLM_UNAVAILABLE",
            },
        )

    # 3. Define the SSE generator — yields the first chunk, then continues
    #    the same generator. Buffers chunks to persist the full explanation.
    async def event_generator():
        collected: list[str] = []

        if first_chunk:
            collected.append(first_chunk)
            yield f"data: {json.dumps({'chunk': first_chunk})}\n\n"

        async for chunk in gen:
            collected.append(chunk)
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"

        yield "data: [DONE]\n\n"

        # Fire-and-forget: save to MongoDB after the stream completes.
        # Only save for first-turn requests (not follow-up chat turns).
        if payload.selected_text and not payload.messages:
            full_explanation = "".join(collected)
            asyncio.create_task(
                _save_gist(
                    original_text=payload.selected_text,
                    explanation=full_explanation,
                    mode=payload.complexity_level,
                    url=payload.page_context,
                )
            )

    # 4. Return as a streaming response
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Prevents Nginx from buffering on Render
        },
    )
