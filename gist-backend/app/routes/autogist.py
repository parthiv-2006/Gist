# app/routes/autogist.py
"""
POST /autogist — Ambient viewport summarizer.

Accepts a short text chunk currently visible on the user's screen and returns
exactly 3 ultra-concise key takeaways as a JSON array.  Uses JSON-mode output
from Gemini so the response is always machine-readable.
"""
import asyncio
import json
import logging
import os
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel, field_validator

from app.services.gemini import GEMINI_MODEL

logger = logging.getLogger(__name__)

router = APIRouter()

_MAX_CHUNK = 1500  # characters — same cap enforced on the client side

_PROMPT_TEMPLATE = (
    "You are an ambient reading assistant. "
    "The user is currently reading the text below on their screen. "
    "Extract exactly 3 ultra-concise key takeaways (each maximum 15 words). "
    "Return ONLY a valid JSON array of exactly 3 strings, nothing else.\n\n"
    "Text:\n{text}"
)


class AutoGistRequest(BaseModel):
    text_chunk: str
    url: Optional[str] = ""

    @field_validator("text_chunk")
    @classmethod
    def validate_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("EMPTY_TEXT: text_chunk must not be empty")
        if len(v) > _MAX_CHUNK:
            raise ValueError(f"TEXT_TOO_LONG: text_chunk exceeds {_MAX_CHUNK} characters")
        return v


async def _generate_takeaways(text: str) -> list[str]:
    """
    Call Gemini with JSON-mode output and return a list of 3 takeaway strings.
    Runs the synchronous SDK call in a thread executor.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")

    client = genai.Client(api_key=api_key)
    prompt = _PROMPT_TEMPLATE.format(text=text)

    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None,
        lambda: client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        ),
    )

    raw = (result.text or "").strip()
    parsed = json.loads(raw)
    if not isinstance(parsed, list):
        raise ValueError("Unexpected response: not a JSON array")
    return [str(t) for t in parsed[:3]]


@router.post("/autogist")
async def autogist(request: Request):
    """
    Accepts a viewport text chunk and returns 3 key takeaways.

    Body:  { "text_chunk": "...", "url": "..." }
    Response: { "takeaways": ["...", "...", "..."] }
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid JSON body.", "code": "INVALID_BODY"},
        )

    try:
        payload = AutoGistRequest(**body)
    except Exception as exc:
        msg = str(exc)
        if "EMPTY_TEXT" in msg:
            return JSONResponse(
                status_code=400,
                content={"error": "text_chunk is required.", "code": "EMPTY_TEXT"},
            )
        if "TEXT_TOO_LONG" in msg:
            return JSONResponse(
                status_code=400,
                content={
                    "error": f"text_chunk exceeds {_MAX_CHUNK} characters.",
                    "code": "TEXT_TOO_LONG",
                },
            )
        return JSONResponse(
            status_code=400,
            content={"error": "Validation error.", "code": "VALIDATION_ERROR"},
        )

    try:
        takeaways = await _generate_takeaways(payload.text_chunk)
    except RuntimeError as exc:
        logger.warning("AutoGist LLM error: %s", exc)
        return JSONResponse(
            status_code=503,
            content={"error": str(exc), "code": "LLM_UNAVAILABLE"},
        )
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("AutoGist parse error: %s", exc)
        return JSONResponse(
            status_code=503,
            content={"error": "Model returned unexpected format.", "code": "PARSE_ERROR"},
        )

    return {"takeaways": takeaways[:3]}
