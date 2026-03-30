# app/routes/simplify.py
import json
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import ValidationError

from app.models.schemas import SimplifyRequest
from app.services.gemini import stream_explanation

router = APIRouter()


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
                    "error": "selected_text is empty or whitespace-only.",
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
        return JSONResponse(
            status_code=400,
            content={"error": str(e), "code": "VALIDATION_ERROR"},
        )
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid request body.", "code": "VALIDATION_ERROR"},
        )

    # 2. Check for Gemini errors upfront by attempting to call the service.
    #    We collect the first chunk to catch any RuntimeError before we commit
    #    to a StreamingResponse — if the service raises, we can still return a
    #    proper 503 JSON response.
    first_chunk: str | None = None
    remaining_chunks: list[str] = []
    try:
        gen = stream_explanation(payload.selected_text, payload.page_context)
        async for chunk in gen:
            first_chunk = chunk
            break
        # If we successfully got the first chunk, buffer the rest
        async for chunk in gen:
            remaining_chunks.append(chunk)
    except RuntimeError:
        return JSONResponse(
            status_code=503,
            content={
                "error": "The LLM service is temporarily unavailable.",
                "code": "LLM_UNAVAILABLE",
            },
        )

    # 3. Define the SSE generator (using pre-fetched chunks + stream)
    async def event_generator():
        # Yield the first chunk we already fetched
        if first_chunk:
            data = json.dumps({"chunk": first_chunk})
            yield f"data: {data}\n\n"

        # Yield any additional chunks already buffered
        for chunk in remaining_chunks:
            data = json.dumps({"chunk": chunk})
            yield f"data: {data}\n\n"

        # Signal completion
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
