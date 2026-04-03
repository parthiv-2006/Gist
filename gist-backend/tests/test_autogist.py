"""
tests/test_autogist.py
TDD tests for POST /autogist (ambient viewport summarizer).
Written before implementation (Red phase).
"""
import pytest
from unittest.mock import MagicMock, patch


# ── /autogist route tests ─────────────────────────────────────────────────────

async def test_autogist_returns_400_on_empty_text(client):
    """Empty text_chunk should return 400."""
    response = await client.post("/autogist", json={"text_chunk": ""})
    assert response.status_code == 400
    assert response.json()["code"] == "EMPTY_TEXT"


async def test_autogist_returns_400_on_whitespace_only(client):
    """Whitespace-only text_chunk should return 400."""
    response = await client.post("/autogist", json={"text_chunk": "   \n\t  "})
    assert response.status_code == 400
    assert response.json()["code"] == "EMPTY_TEXT"


async def test_autogist_returns_400_on_text_too_long(client):
    """text_chunk exceeding 1500 chars should return 400."""
    response = await client.post("/autogist", json={"text_chunk": "x" * 1501})
    assert response.status_code == 400
    assert response.json()["code"] == "TEXT_TOO_LONG"


async def test_autogist_accepts_max_length_text(client):
    """Exactly 1500 chars should be accepted (mocked LLM)."""
    fake_takeaways = ["Point one.", "Point two.", "Point three."]

    with patch("app.routes.autogist._generate_takeaways", return_value=fake_takeaways):
        response = await client.post("/autogist", json={"text_chunk": "a" * 1500})

    assert response.status_code == 200


async def test_autogist_returns_three_takeaways(client):
    """Happy path: returns exactly 3 takeaway strings."""
    fake_takeaways = ["Takeaway one.", "Takeaway two.", "Takeaway three."]

    with patch("app.routes.autogist._generate_takeaways", return_value=fake_takeaways):
        response = await client.post("/autogist", json={
            "text_chunk": "Quantum computing uses qubits instead of bits to perform calculations.",
            "url": "https://example.com/quantum",
        })

    assert response.status_code == 200
    data = response.json()
    assert "takeaways" in data
    assert isinstance(data["takeaways"], list)
    assert len(data["takeaways"]) == 3
    assert data["takeaways"][0] == "Takeaway one."


async def test_autogist_returns_503_on_llm_failure(client):
    """LLM failure (missing API key, etc.) should return 503."""
    with patch(
        "app.routes.autogist._generate_takeaways",
        side_effect=RuntimeError("GEMINI_API_KEY is not set"),
    ):
        response = await client.post("/autogist", json={"text_chunk": "Some readable text here."})

    assert response.status_code == 503
    assert response.json()["code"] == "LLM_UNAVAILABLE"


async def test_autogist_returns_503_on_parse_error(client):
    """If Gemini returns malformed JSON, endpoint returns 503."""
    import json

    with patch(
        "app.routes.autogist._generate_takeaways",
        side_effect=json.JSONDecodeError("Expecting value", "", 0),
    ):
        response = await client.post("/autogist", json={"text_chunk": "Some readable text here."})

    assert response.status_code == 503
    assert response.json()["code"] == "PARSE_ERROR"


async def test_autogist_url_is_optional(client):
    """url field should be optional."""
    fake_takeaways = ["A.", "B.", "C."]

    with patch("app.routes.autogist._generate_takeaways", return_value=fake_takeaways):
        response = await client.post("/autogist", json={"text_chunk": "Some text without a URL."})

    assert response.status_code == 200


async def test_autogist_returns_invalid_body_400(client):
    """Non-JSON body returns 400."""
    response = await client.post(
        "/autogist",
        content=b"not json at all",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 400
