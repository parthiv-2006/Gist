# app/routes/simplify.py
import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import ValidationError

from app.limiter import limiter
from app.models.schemas import SimplifyRequest
from app.services.gemini import stream_explanation, classify_gemini_error

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/v1/simplify")
@limiter.limit("30/minute")
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
            content={"error": "Invalid request parameters.", "code": "VALIDATION_ERROR"},
        )
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid request body.", "code": "VALIDATION_ERROR"},
        )

    # 2. Attempt to fetch the first chunk to catch RuntimeError before we
    #    commit to a StreamingResponse — lets us still return a proper 503.
    first_chunk: str | None = None
    user_api_key = request.headers.get("X-Gemini-Api-Key") or None
    try:
        gen = stream_explanation(
            payload.selected_text,
            payload.page_context,
            payload.complexity_level,
            [m.model_dump() for m in payload.messages] if payload.messages else None,
            payload.image_data,
            payload.image_mime_type,
            user_api_key,
        )
        async for chunk in gen:
            first_chunk = chunk
            break
    except RuntimeError as e:
        http_status, code, msg = classify_gemini_error(e)
        from app.services.gemini import _resolve_api_key
        try:
            actual_key = _resolve_api_key(user_api_key)
        except Exception:
            actual_key = "None"
        debug_msg = f"{msg} [Debug Key: '{actual_key}']"
        return JSONResponse(status_code=http_status, content={"error": debug_msg, "code": code})

    # 3. Define the SSE generator — yields the first chunk, then continues the same generator.
    async def event_generator():
        if first_chunk:
            yield f"data: {json.dumps({'chunk': first_chunk})}\n\n"

        async for chunk in gen:
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"

        yield "data: [DONE]\n\n"

    # 4. Return as a streaming response
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Prevents Nginx from buffering on Render
        },
    )
