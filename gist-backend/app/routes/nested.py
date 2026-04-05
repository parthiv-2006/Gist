# app/routes/nested.py
"""
POST /api/v1/nested-gist — Progressive disclosure / infinite drilling.

Accepts a single term + parent context, returns a concise definition (2-3 sentences).
Used when users double-click a word in an explanation to understand it better.
"""
import asyncio
import logging
import os
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from google import genai
from pydantic import BaseModel, field_validator

from app.services.gemini import GEMINI_MODEL

logger = logging.getLogger(__name__)

router = APIRouter()

_MAX_TERM_LEN = 100        # single word/phrase
_MAX_CONTEXT_LEN = 200     # what context was this term used in
_MOCK_LLM: bool = os.environ.get("MOCK_LLM", "").lower() in ("1", "true", "yes")

_PROMPT_TEMPLATE = (
    "You are a concise explainer. A user encountered this term in a context and wants "
    "a brief definition to understand it better.\n\n"
    "<context>{context}</context>\n"
    "<term>{term}</term>\n\n"
    "Provide a clear, simple definition of the term in 1-2 sentences max (25 words or fewer). "
    "Just the definition, nothing else."
)

_MOCK_DEFINITION = "A fundamental concept in computing that handles asynchronous operations."


class NestedGistRequest(BaseModel):
    term: str
    parent_context: Optional[str] = "An explanation"

    @field_validator("term")
    @classmethod
    def validate_term(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("EMPTY_TERM")
        if len(v) > _MAX_TERM_LEN:
            raise ValueError("TERM_TOO_LONG")
        return v


async def _get_nested_definition(term: str, parent_context: str) -> str:
    """Call Gemini to get a concise definition of the term."""
    if _MOCK_LLM:
        return _MOCK_DEFINITION

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")

    client = genai.Client(api_key=api_key)
    prompt = _PROMPT_TEMPLATE.format(
        context=(parent_context or "An explanation")[:_MAX_CONTEXT_LEN],
        term=term,
    )

    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None,
        lambda: client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        ),
    )

    raw = result.text or ""
    return raw.strip()


@router.post("/api/v1/nested-gist")
async def nested_gist(request: Request):
    """
    Accept a term and return a concise definition for progressive disclosure.

    Body:     { "term": "...", "parent_context": "..." }
    Response: { "definition": "..." }
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid JSON body.", "code": "INVALID_BODY"},
        )

    try:
        payload = NestedGistRequest(**body)
    except Exception as exc:
        msg = str(exc)
        if "EMPTY_TERM" in msg:
            return JSONResponse(
                status_code=400,
                content={"error": "term is required.", "code": "EMPTY_TERM"},
            )
        if "TERM_TOO_LONG" in msg:
            return JSONResponse(
                status_code=400,
                content={
                    "error": f"term exceeds {_MAX_TERM_LEN} characters.",
                    "code": "TERM_TOO_LONG",
                },
            )
        return JSONResponse(
            status_code=400,
            content={"error": "Validation error.", "code": "VALIDATION_ERROR"},
        )

    try:
        definition = await _get_nested_definition(payload.term, payload.parent_context or "An explanation")
    except RuntimeError as exc:
        logger.warning("Nested gist LLM error: %s", exc)
        return JSONResponse(
            status_code=503,
            content={"error": str(exc), "code": "LLM_UNAVAILABLE"},
        )
    except Exception as exc:
        logger.error("Nested gist unexpected error: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=503,
            content={"error": "Unexpected error generating definition.", "code": "LLM_UNAVAILABLE"},
        )

    return {"definition": definition}
