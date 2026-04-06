"""
tests/test_visualize.py
Tests for POST /api/v1/visualize — Mermaid SVG diagram generation pipeline.

TDD: these tests were written before the route implementation.
"""
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient

FAKE_MERMAID = "graph TD\n  A[Input] --> B[Process]\n  B --> C[Output]"
FAKE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>'


# ── Shared fixture ─────────────────────────────────────────────────────────────

@pytest.fixture
def mock_pipeline():
    """
    Patches _generate_mermaid and _fetch_svg so the endpoint runs end-to-end
    without calling Gemini or mermaid.ink.
    """
    with patch("app.routes.visualize._generate_mermaid", new=AsyncMock(return_value=FAKE_MERMAID)), \
         patch("app.routes.visualize._fetch_svg", new=AsyncMock(return_value=FAKE_SVG)):
        yield


# ── Happy path ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_visualize_returns_svg_and_source(client: AsyncClient, mock_pipeline):
    """Happy path: returns svg and mermaid_source keys."""
    resp = await client.post("/api/v1/visualize", json={
        "text": "Async functions allow non-blocking code execution in JavaScript.",
        "page_context": "MDN Web Docs",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["svg"] == FAKE_SVG
    assert data["mermaid_source"] == FAKE_MERMAID


@pytest.mark.asyncio
async def test_visualize_page_context_optional(client: AsyncClient, mock_pipeline):
    """page_context is optional — request without it should succeed."""
    resp = await client.post("/api/v1/visualize", json={
        "text": "Blockchain is a distributed ledger technology.",
    })
    assert resp.status_code == 200
    assert "svg" in resp.json()


@pytest.mark.asyncio
async def test_visualize_long_text_is_truncated(client: AsyncClient, mock_pipeline):
    """Text longer than 3000 chars is silently truncated (not rejected)."""
    long_text = "word " * 700  # ~3500 chars
    resp = await client.post("/api/v1/visualize", json={"text": long_text})
    assert resp.status_code == 200


# ── Validation errors ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_visualize_empty_text_returns_422(client: AsyncClient):
    """Empty / whitespace-only text is rejected by Pydantic (422)."""
    resp = await client.post("/api/v1/visualize", json={"text": "   "})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_visualize_missing_text_returns_422(client: AsyncClient):
    """Missing text field is rejected by Pydantic (422)."""
    resp = await client.post("/api/v1/visualize", json={"page_context": "test"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_visualize_invalid_body_returns_422(client: AsyncClient):
    """Non-JSON body is rejected (422)."""
    resp = await client.post("/api/v1/visualize", content=b"not json",
                             headers={"Content-Type": "application/json"})
    assert resp.status_code == 422


# ── LLM failures ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_visualize_llm_unavailable_returns_503(client: AsyncClient):
    """Gemini call failure bubbles up as 503 LLM_UNAVAILABLE."""
    with patch("app.routes.visualize._generate_mermaid",
               new=AsyncMock(side_effect=RuntimeError("GEMINI_API_KEY is not set"))):
        resp = await client.post("/api/v1/visualize", json={"text": "Some concept."})
    assert resp.status_code == 503
    assert resp.json()["code"] == "LLM_UNAVAILABLE"


@pytest.mark.asyncio
async def test_visualize_llm_unexpected_error_returns_503(client: AsyncClient):
    """Unexpected LLM error is caught and returns 503."""
    with patch("app.routes.visualize._generate_mermaid",
               new=AsyncMock(side_effect=Exception("unknown error"))):
        resp = await client.post("/api/v1/visualize", json={"text": "Some concept."})
    assert resp.status_code == 503
    assert resp.json()["code"] == "LLM_UNAVAILABLE"


# ── Render service failures ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_visualize_render_error_returns_503(client: AsyncClient):
    """mermaid.ink failure returns 503 RENDER_ERROR."""
    with patch("app.routes.visualize._generate_mermaid", new=AsyncMock(return_value=FAKE_MERMAID)), \
         patch("app.routes.visualize._fetch_svg", new=AsyncMock(side_effect=Exception("timeout"))):
        resp = await client.post("/api/v1/visualize", json={"text": "Some concept."})
    assert resp.status_code == 503
    assert resp.json()["code"] == "RENDER_ERROR"


# ── Mock LLM mode ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_visualize_mock_llm_skips_gemini(client: AsyncClient):
    """With MOCK_LLM=true, Gemini is skipped and a canned Mermaid string is used."""
    with patch("app.routes.visualize._MOCK_LLM", True), \
         patch("app.routes.visualize._fetch_svg", new=AsyncMock(return_value=FAKE_SVG)):
        resp = await client.post("/api/v1/visualize", json={
            "text": "Neural networks learn from data.",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert data["svg"] == FAKE_SVG
    # Mock mode returns the canned mermaid string
    assert "graph" in data["mermaid_source"].lower() or "flowchart" in data["mermaid_source"].lower()
