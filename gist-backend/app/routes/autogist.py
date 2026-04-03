# app/routes/autogist.py
"""
POST /autogist — Ambient viewport summarizer.

Accepts a short text chunk currently visible on the user's screen and returns
exactly 3 ultra-concise key takeaways as a JSON array.
"""
import asyncio
import json
import logging
import os
import re
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from google import genai
from pydantic import BaseModel, field_validator

from app.services.gemini import GEMINI_MODEL

logger = logging.getLogger(__name__)

router = APIRouter()

_MAX_CHUNK = 1500  # characters — same cap enforced on the client side

_PROMPT_TEMPLATE = (
    "You are an ambient reading assistant. "
    "The user is currently reading the text below on their screen. "
    "Extract exactly 3 ultra-concise key takeaways (each maximum 15 words). "
    "Return ONLY a valid JSON array of exactly 3 strings, nothing else. "
    "Example: [\"First point.\", \"Second point.\", \"Third point.\"]\n\n"
    "Text:\n{text}"
)

# Matches an optional ```json ... ``` fence around the array
_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```")
# Fallback: grab first [...] array found in the response
_JSON_ARRAY_RE = re.compile(r"\[[\s\S]*?\]")


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


def _extract_json_array(raw: str) -> list[str]:
    """
    Extract a JSON array from the model response, tolerating markdown fences
    and other surrounding text that models sometimes emit.
    """
    text = raw.strip()

    # 1. Try to parse as-is (model returned clean JSON)
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [str(t) for t in parsed[:3]]
    except json.JSONDecodeError:
        pass

    # 2. Strip ```json ... ``` fences
    fence_match = _JSON_FENCE_RE.search(text)
    if fence_match:
        try:
            parsed = json.loads(fence_match.group(1))
            if isinstance(parsed, list):
                return [str(t) for t in parsed[:3]]
        except json.JSONDecodeError:
            pass

    # 3. Grab first [...] substring
    array_match = _JSON_ARRAY_RE.search(text)
    if array_match:
        try:
            parsed = json.loads(array_match.group(0))
            if isinstance(parsed, list):
                return [str(t) for t in parsed[:3]]
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not extract JSON array from model response: {text[:200]!r}")


async def _generate_takeaways(text: str) -> list[str]:
    """
    Call Gemini and return a list of 3 takeaway strings.
    Uses run_in_executor so the synchronous SDK call doesn't block the event loop.
    Parses JSON robustly — tolerates markdown fences and surrounding text.
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
        ),
    )

    raw = result.text or ""
    return _extract_json_array(raw)


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
    except Exception as exc:
        logger.error("AutoGist unexpected error: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=503,
            content={"error": "Unexpected error generating takeaways.", "code": "LLM_UNAVAILABLE"},
        )

    return {"takeaways": takeaways[:3]}
