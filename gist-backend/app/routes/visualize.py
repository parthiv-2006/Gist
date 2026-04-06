"""
app/routes/visualize.py
POST /api/v1/visualize — Generate a Mermaid diagram SVG from text.

Flow:
  1. Validate the request body.
  2. Call Gemini (via run_in_executor) to generate Mermaid syntax.
  3. Base64-URL encode the Mermaid source.
  4. Fetch the rendered SVG from mermaid.ink.
  5. Return { "svg": "...", "mermaid_source": "..." }.
"""
import asyncio
import base64
import logging
import os
from typing import Optional

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from google import genai
from pydantic import BaseModel, field_validator

from app.services.gemini import GEMINI_MODEL

logger = logging.getLogger(__name__)

router = APIRouter()

_MAX_TEXT = 3000
_MERMAID_INK_URL = "https://mermaid.ink/svg/{encoded}"

_PROMPT_TEMPLATE = (
    "Create a concept map or flow diagram using Mermaid.js syntax for the following text. "
    "Use 'graph TD', 'flowchart TD', or 'sequenceDiagram' as appropriate. "
    "Keep it concise — maximum 12 nodes. "
    "Do NOT include any explanation or prose. "
    "Output ONLY valid Mermaid markdown with no surrounding text or fences.\n\n"
    "Text:\n{text}"
)

_MOCK_MERMAID = (
    "flowchart TD\n"
    "    A[Concept] --> B[Key Idea 1]\n"
    "    A --> C[Key Idea 2]\n"
    "    B --> D[Detail A]\n"
    "    C --> E[Detail B]\n"
    "    D --> F[Outcome]\n"
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
        # Silently truncate instead of rejecting — long explanations are fine inputs
        return v[:_MAX_TEXT]


def _encode_mermaid(mermaid_src: str) -> str:
    """URL-safe base64 encode for mermaid.ink."""
    return base64.urlsafe_b64encode(mermaid_src.encode("utf-8")).decode("ascii")


def _strip_fences(raw: str) -> str:
    """Remove ```mermaid ... ``` or ``` ... ``` fences if the model emits them."""
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        # Drop first line (fence open) and last line (fence close) if it's ```
        if len(lines) >= 3 and lines[-1].strip() == "```":
            return "\n".join(lines[1:-1]).strip()
        elif len(lines) >= 2:
            return "\n".join(lines[1:]).strip()
    return raw


async def _generate_mermaid(text: str) -> str:
    """Call Gemini to produce Mermaid syntax."""
    if _MOCK_LLM:
        return _MOCK_MERMAID

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
    return _strip_fences(raw)


async def _fetch_svg(mermaid_src: str) -> str:
    """Encode Mermaid source and fetch the rendered SVG from mermaid.ink."""
    encoded = _encode_mermaid(mermaid_src)
    url = _MERMAID_INK_URL.format(encoded=encoded)
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.text


@router.post("/api/v1/visualize")
async def visualize(body: VisualizeRequest):
    """
    Generate a Mermaid.js diagram from an explanation text and return the SVG.

    Body:    { "text": "...", "page_context": "..." }
    Returns: { "svg": "<svg>...</svg>", "mermaid_source": "graph TD ..." }
    """
    try:
        mermaid_src = await _generate_mermaid(body.text)
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

    try:
        svg = await _fetch_svg(mermaid_src)
    except httpx.HTTPStatusError as exc:
        logger.warning("mermaid.ink returned %s for encoded diagram", exc.response.status_code)
        return JSONResponse(
            status_code=503,
            content={"error": "Diagram rendering service unavailable.", "code": "RENDER_ERROR"},
        )
    except Exception as exc:
        logger.error("mermaid.ink fetch error: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=503,
            content={"error": "Failed to render diagram.", "code": "RENDER_ERROR"},
        )

    return {"svg": svg, "mermaid_source": mermaid_src}
