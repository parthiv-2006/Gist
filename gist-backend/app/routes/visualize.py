"""
app/routes/visualize.py
POST /api/v1/visualize — Generate a Mermaid diagram SVG from text.

Flow:
  1. Validate the request body.
  2. Call Gemini to generate Mermaid syntax, then extract + sanitize it.
  3. Fetch the rendered SVG from mermaid.ink (one retry with sanitized source on failure).
  4. Return { "svg": "<svg>...", "mermaid_source": "..." }.
     If mermaid.ink is unavailable, svg is null and the extension falls back
     to displaying the raw Mermaid code block.
"""
import asyncio
import base64
import logging
import os
import re
from typing import Optional

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from google import genai
from pydantic import BaseModel, field_validator

from app.limiter import limiter
from app.services.gemini import GEMINI_MODEL, _resolve_api_key

logger = logging.getLogger(__name__)

router = APIRouter()

_MAX_TEXT = 3000
_MERMAID_INK_URL = "https://mermaid.ink/svg/{encoded}"

# Mermaid diagram type keywords — used to locate the first valid diagram line
_MERMAID_STARTS = (
    "graph ", "flowchart ", "sequencediagram", "classdiagram",
    "statediagram", "erdiagram", "gantt", "pie ", "mindmap",
    "timeline", "gitgraph", "quadrantchart", "xychart-beta",
)

_PROMPT_TEMPLATE = (
    "Create a concept map or flow diagram in Mermaid.js syntax for the text below.\n"
    "Rules (MUST follow):\n"
    "  - Use 'flowchart TD' or 'graph TD'. Max 10 nodes.\n"
    "  - Node labels must use ROUND brackets only: A(label), NOT A[label] or A[\"label\"].\n"
    "  - No double-quote characters anywhere in the output.\n"
    "  - No markdown fences, no backticks, no explanations, no prose.\n"
    "  - Output ONLY the raw Mermaid code, starting with 'flowchart TD' or 'graph TD'.\n\n"
    "Text:\n{text}"
)

_MOCK_MERMAID = (
    "flowchart TD\n"
    "    A(Concept) --> B(Key Idea 1)\n"
    "    A --> C(Key Idea 2)\n"
    "    B --> D(Detail A)\n"
    "    C --> E(Detail B)\n"
    "    D --> F(Outcome)\n"
    "    E --> F"
)

_MOCK_LLM: bool = os.environ.get("MOCK_LLM", "").lower() in ("1", "true", "yes")


class VisualizeRequest(BaseModel):
    text: str
    page_context: Optional[str] = "Unknown page"

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("EMPTY_TEXT: text must not be empty")
        return v[:_MAX_TEXT]


# ─── Mermaid source processing ────────────────────────────────────────────────

def _extract_mermaid(raw: str) -> str:
    """
    Pull the Mermaid diagram code out of whatever Gemini returned.
    Handles: ```mermaid fences, ``` fences, leading prose, or plain output.
    """
    raw = raw.strip()

    # 1. Explicit ```mermaid ... ``` fence
    m = re.search(r"```(?:mermaid)?\s*\n([\s\S]*?)\n\s*```", raw, re.IGNORECASE)
    if m:
        return m.group(1).strip()

    # 2. Generic ``` ... ``` fence — accept if it starts with a Mermaid keyword
    m = re.search(r"```\s*\n([\s\S]*?)\n\s*```", raw)
    if m:
        candidate = m.group(1).strip()
        if any(candidate.lower().startswith(k) for k in _MERMAID_STARTS):
            return candidate

    # 3. Find the first line that begins with a known Mermaid directive
    for i, line in enumerate(raw.splitlines()):
        if any(line.strip().lower().startswith(k) for k in _MERMAID_STARTS):
            return "\n".join(raw.splitlines()[i:]).strip()

    # 4. Fallback — return as-is and let sanitisation + mermaid.ink decide
    return raw


def _sanitize_mermaid(src: str) -> str:
    """
    Fix the two most common issues in Gemini-generated Mermaid:
      1. Square-bracket labels with double quotes: A["label"] → A(label)
      2. Any remaining bare double quotes (break mermaid.ink parser).
    """
    # A["text"] or A['text'] → A(text)
    src = re.sub(r'\["([^"]*?)"\]', r'(\1)', src)
    src = re.sub(r"\['([^']*?)'\]", r'(\1)', src)
    # ("text") → (text)  — normalise round-bracket quoted labels too
    src = re.sub(r'\("([^"]*?)"\)', r'(\1)', src)
    # Strip any remaining double quotes
    src = src.replace('"', '')
    return src


def _encode_for_ink(mermaid_src: str) -> str:
    """Standard base64 encode for mermaid.ink — padding kept, no URL-safe substitution."""
    return base64.b64encode(mermaid_src.encode("utf-8")).decode("ascii")


# ─── External render call ──────────────────────────────────────────────────────

async def _fetch_svg(mermaid_src: str) -> str:
    """Fetch the rendered SVG from mermaid.ink; raises on any HTTP/network error."""
    encoded = _encode_for_ink(mermaid_src)
    url = _MERMAID_INK_URL.format(encoded=encoded)
    logger.debug("mermaid.ink GET %s", url[:120])
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.text


async def _render_with_fallback(mermaid_src: str) -> str | None:
    """
    Attempt to render mermaid_src via mermaid.ink.
    If that fails, sanitise and try once more.
    Returns the SVG string, or None if both attempts fail.
    """
    # Attempt 1: use source as-is
    try:
        return await _fetch_svg(mermaid_src)
    except Exception as exc:
        logger.warning("mermaid.ink attempt 1 failed (%s): %s", type(exc).__name__, exc)

    # Attempt 2: sanitise (remove quotes, fix square brackets) and retry
    sanitized = _sanitize_mermaid(mermaid_src)
    if sanitized == mermaid_src:
        logger.warning("mermaid.ink: no change after sanitisation — skipping retry")
        return None
    try:
        return await _fetch_svg(sanitized)
    except Exception as exc:
        logger.warning("mermaid.ink attempt 2 failed (%s): %s", type(exc).__name__, exc)
        return None


# ─── LLM call ─────────────────────────────────────────────────────────────────

async def _generate_mermaid(text: str, api_key: str | None = None) -> str:
    """Ask Gemini to produce Mermaid syntax, then extract + sanitise the result."""
    if _MOCK_LLM:
        return _MOCK_MERMAID

    client = genai.Client(api_key=_resolve_api_key(api_key))
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
    extracted = _extract_mermaid(raw)
    return _sanitize_mermaid(extracted)


# ─── Route ────────────────────────────────────────────────────────────────────

@router.post("/api/v1/visualize")
@limiter.limit("20/minute")
async def visualize(request: Request, body: VisualizeRequest):
    """
    Generate a Mermaid.js diagram from an explanation and return the SVG.

    Body:    { "text": "...", "page_context": "..." }
    Returns: { "svg": "<svg>..." | null, "mermaid_source": "flowchart TD ..." }

    svg is null when mermaid.ink is unavailable — the extension falls back to
    displaying the raw Mermaid source as a formatted code block.
    """
    user_api_key = request.headers.get("X-Gemini-Api-Key") or None
    try:
        mermaid_src = await _generate_mermaid(body.text, user_api_key)
    except RuntimeError as exc:
        logger.warning("Visualize LLM error: %s", exc)
        return JSONResponse(
            status_code=503,
            content={"error": str(exc), "code": "LLM_UNAVAILABLE"},
        )
    except Exception as exc:
        logger.error("Visualize LLM unexpected error: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=503,
            content={"error": "Failed to generate diagram syntax.", "code": "LLM_UNAVAILABLE"},
        )

    svg = await _render_with_fallback(mermaid_src)
    # Always return 200 — svg=null signals the extension to show the source fallback
    return {"svg": svg, "mermaid_source": mermaid_src}
