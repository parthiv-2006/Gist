# app/routes/scan.py
"""
POST /api/v1/scan-terms — Gist Lens proactive term scanner.

Accepts a block of page text and returns up to 5 difficult technical terms
with plain-English definitions for the Gist Lens highlighting feature.
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

_MAX_TEXT = 2500  # characters per chunk

_PROMPT_TEMPLATE = (
    "You are a reading assistant that identifies difficult technical terms for a general audience.\n"
    "The user is reading a page titled: <page_context>{page_context}</page_context>\n\n"
    "From the text below, identify up to 5 complex technical terms, acronyms, or domain-specific "
    "jargon that a curious but non-expert reader might not know.\n"
    "Rules:\n"
    "- Only include genuinely technical or domain-specific terms.\n"
    "- Do NOT include common English words, proper nouns (names of people/companies), or obvious phrases.\n"
    "- Each definition must be exactly 1 sentence (under 25 words).\n"
    "- Return ONLY a valid JSON object with this exact structure, nothing else:\n"
    '  {{"terms": [{{"term": "...", "definition": "..."}}]}}\n'
    "- If no qualifying terms exist, return: {{\"terms\": []}}\n\n"
    "<text>{text}</text>"
)

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```")
_JSON_OBJ_RE = re.compile(r"\{[\s\S]*\}")

_MOCK_LLM: bool = os.environ.get("MOCK_LLM", "").lower() in ("1", "true", "yes")
_MOCK_TERMS = [
    {
        "term": "Jargon",
        "definition": "Specialized terminology used within a particular field that may be unclear to outsiders.",
    },
    {
        "term": "Heuristic",
        "definition": "A practical problem-solving approach that is efficient but not guaranteed to be optimal.",
    },
]


class ScanTermsRequest(BaseModel):
    text_content: str
    page_context: Optional[str] = "Unknown page"

    @field_validator("text_content")
    @classmethod
    def validate_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("EMPTY_TEXT")
        if len(v) > _MAX_TEXT:
            raise ValueError("TEXT_TOO_LONG")
        return v


def _extract_terms(raw: str) -> list[dict]:
    """Parse model JSON response, tolerating markdown fences and surrounding text."""
    text = raw.strip()

    def _parse(s: str) -> list[dict]:
        parsed = json.loads(s)
        if isinstance(parsed, dict) and "terms" in parsed:
            return [
                {"term": str(t["term"]), "definition": str(t["definition"])}
                for t in parsed["terms"]
                if isinstance(t, dict) and "term" in t and "definition" in t
            ][:5]
        return []

    # 1. Direct parse
    try:
        return _parse(text)
    except (json.JSONDecodeError, KeyError):
        pass

    # 2. Strip ``` fences
    fence_match = _JSON_FENCE_RE.search(text)
    if fence_match:
        try:
            return _parse(fence_match.group(1))
        except (json.JSONDecodeError, KeyError):
            pass

    # 3. Find first {...} block
    obj_match = _JSON_OBJ_RE.search(text)
    if obj_match:
        try:
            return _parse(obj_match.group(0))
        except (json.JSONDecodeError, KeyError):
            pass

    raise ValueError(f"Could not extract terms from model response: {text[:200]!r}")


async def _scan_terms(text: str, page_context: str) -> list[dict]:
    """Call Gemini and return a list of term/definition dicts."""
    if _MOCK_LLM:
        return _MOCK_TERMS

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")

    client = genai.Client(api_key=api_key)
    prompt = _PROMPT_TEMPLATE.format(
        page_context=(page_context or "Unknown page")[:200],
        text=text,
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
    return _extract_terms(raw)


@router.post("/api/v1/scan-terms")
async def scan_terms(request: Request):
    """
    Accept a text chunk and return up to 5 difficult terms with definitions.

    Body:     { "text_content": "...", "page_context": "..." }
    Response: { "terms": [{ "term": "...", "definition": "..." }] }
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid JSON body.", "code": "INVALID_BODY"},
        )

    try:
        payload = ScanTermsRequest(**body)
    except Exception as exc:
        msg = str(exc)
        if "EMPTY_TEXT" in msg:
            return JSONResponse(
                status_code=400,
                content={"error": "text_content is required.", "code": "EMPTY_TEXT"},
            )
        if "TEXT_TOO_LONG" in msg:
            return JSONResponse(
                status_code=400,
                content={
                    "error": f"text_content exceeds {_MAX_TEXT} characters.",
                    "code": "TEXT_TOO_LONG",
                },
            )
        return JSONResponse(
            status_code=400,
            content={"error": "Validation error.", "code": "VALIDATION_ERROR"},
        )

    try:
        terms = await _scan_terms(
            payload.text_content, payload.page_context or "Unknown page"
        )
    except RuntimeError as exc:
        logger.warning("Scan terms LLM error: %s", exc)
        return JSONResponse(
            status_code=503,
            content={"error": str(exc), "code": "LLM_UNAVAILABLE"},
        )
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("Scan terms parse error: %s", exc)
        return JSONResponse(
            status_code=503,
            content={"error": "Model returned unexpected format.", "code": "PARSE_ERROR"},
        )
    except Exception as exc:
        logger.error("Scan terms unexpected error: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=503,
            content={"error": "Unexpected error scanning terms.", "code": "LLM_UNAVAILABLE"},
        )

    return {"terms": terms}
