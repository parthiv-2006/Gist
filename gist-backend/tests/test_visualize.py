"""
tests/test_visualize.py
Tests for POST /api/v1/visualize — Mermaid SVG diagram generation pipeline.
"""
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient

FAKE_MERMAID = "flowchart TD\n    A(Input) --> B(Process)\n    B --> C(Output)"
FAKE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>'


# ── Shared fixture ─────────────────────────────────────────────────────────────

@pytest.fixture
def mock_pipeline():
    """Patches _generate_mermaid and _fetch_svg for a fully successful run."""
    with patch("app.routes.visualize._generate_mermaid", new=AsyncMock(return_value=FAKE_MERMAID)), \
         patch("app.routes.visualize._fetch_svg", new=AsyncMock(return_value=FAKE_SVG)):
        yield


# ── Happy path ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_visualize_returns_svg_and_source(client: AsyncClient, mock_pipeline):
    resp = await client.post("/api/v1/visualize", json={
        "text": "Async functions allow non-blocking code execution.",
        "page_context": "MDN Web Docs",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["svg"] == FAKE_SVG
    assert data["mermaid_source"] == FAKE_MERMAID


@pytest.mark.asyncio
async def test_visualize_page_context_optional(client: AsyncClient, mock_pipeline):
    resp = await client.post("/api/v1/visualize", json={
        "text": "Blockchain is a distributed ledger technology.",
    })
    assert resp.status_code == 200
    assert "svg" in resp.json()


@pytest.mark.asyncio
async def test_visualize_long_text_is_truncated(client: AsyncClient, mock_pipeline):
    resp = await client.post("/api/v1/visualize", json={"text": "word " * 700})
    assert resp.status_code == 200


# ── Validation ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_visualize_empty_text_returns_422(client: AsyncClient):
    resp = await client.post("/api/v1/visualize", json={"text": "   "})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_visualize_missing_text_returns_422(client: AsyncClient):
    resp = await client.post("/api/v1/visualize", json={"page_context": "test"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_visualize_invalid_body_returns_422(client: AsyncClient):
    resp = await client.post("/api/v1/visualize", content=b"not json",
                             headers={"Content-Type": "application/json"})
    assert resp.status_code == 422


# ── LLM failures (still 503) ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_visualize_llm_unavailable_returns_503(client: AsyncClient):
    with patch("app.routes.visualize._generate_mermaid",
               new=AsyncMock(side_effect=RuntimeError("GEMINI_API_KEY is not set"))):
        resp = await client.post("/api/v1/visualize", json={"text": "Some concept."})
    assert resp.status_code == 503
    assert resp.json()["code"] == "LLM_UNAVAILABLE"


@pytest.mark.asyncio
async def test_visualize_llm_unexpected_error_returns_503(client: AsyncClient):
    with patch("app.routes.visualize._generate_mermaid",
               new=AsyncMock(side_effect=Exception("unknown error"))):
        resp = await client.post("/api/v1/visualize", json={"text": "Some concept."})
    assert resp.status_code == 503
    assert resp.json()["code"] == "LLM_UNAVAILABLE"


# ── Render failure → graceful fallback (200 + svg=null) ───────────────────────

@pytest.mark.asyncio
async def test_visualize_render_failure_returns_200_with_null_svg(client: AsyncClient):
    """When mermaid.ink is down, the endpoint still returns 200 with svg=null
    so the extension can fall back to displaying the raw Mermaid source."""
    with patch("app.routes.visualize._generate_mermaid", new=AsyncMock(return_value=FAKE_MERMAID)), \
         patch("app.routes.visualize._fetch_svg", new=AsyncMock(side_effect=Exception("timeout"))):
        resp = await client.post("/api/v1/visualize", json={"text": "Some concept."})
    assert resp.status_code == 200
    data = resp.json()
    assert data["svg"] is None
    assert data["mermaid_source"] == FAKE_MERMAID


# ── Mermaid extraction helpers ─────────────────────────────────────────────────

def test_extract_mermaid_strips_fence():
    from app.routes.visualize import _extract_mermaid
    raw = "```mermaid\nflowchart TD\n  A --> B\n```"
    assert _extract_mermaid(raw) == "flowchart TD\n  A --> B"


def test_extract_mermaid_strips_generic_fence():
    from app.routes.visualize import _extract_mermaid
    raw = "```\ngraph TD\n  A --> B\n```"
    assert _extract_mermaid(raw) == "graph TD\n  A --> B"


def test_extract_mermaid_skips_leading_prose():
    from app.routes.visualize import _extract_mermaid
    raw = "Here is the diagram:\nflowchart TD\n  A --> B"
    assert _extract_mermaid(raw).startswith("flowchart TD")


def test_extract_mermaid_plain_passthrough():
    from app.routes.visualize import _extract_mermaid
    raw = "flowchart TD\n  A --> B"
    assert _extract_mermaid(raw) == raw


# ── Mermaid sanitiser ──────────────────────────────────────────────────────────

def test_sanitize_removes_square_bracket_double_quotes():
    from app.routes.visualize import _sanitize_mermaid
    src = 'flowchart TD\n  A["Start here"] --> B["End"]\n'
    result = _sanitize_mermaid(src)
    assert '"' not in result
    assert "Start here" in result


def test_sanitize_leaves_clean_source_unchanged():
    from app.routes.visualize import _sanitize_mermaid
    src = "flowchart TD\n  A(Start) --> B(End)"
    assert _sanitize_mermaid(src) == src


# ── Mock LLM mode ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_visualize_mock_llm_skips_gemini(client: AsyncClient):
    with patch("app.routes.visualize._MOCK_LLM", True), \
         patch("app.routes.visualize._fetch_svg", new=AsyncMock(return_value=FAKE_SVG)):
        resp = await client.post("/api/v1/visualize", json={"text": "Neural networks."})
    assert resp.status_code == 200
    data = resp.json()
    assert data["svg"] == FAKE_SVG
    assert "flowchart" in data["mermaid_source"].lower()
