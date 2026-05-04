"""
tests/test_search.py
TDD tests for semantic search — written before implementation (Red phase).
Covers: embed_text utility, POST /library/ask RAG endpoint.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import os


# ── embed_text unit tests ─────────────────────────────────────────────────────

async def test_embed_text_returns_float_list():
    """embed_text should return a list of floats from the Gemini embedding API."""
    fake_values = [0.1, 0.2, 0.3] * 256  # 768-dim

    with patch("app.services.gemini.genai") as mock_genai:
        mock_client = MagicMock()
        mock_genai.Client.return_value = mock_client

        mock_embedding = MagicMock()
        mock_embedding.values = fake_values
        mock_response = MagicMock()
        mock_response.embedding = mock_embedding  # singular — SDK v1 shape
        mock_response.embeddings = [mock_embedding]
        mock_client.models.embed_content.return_value = mock_response

        from app.services.gemini import embed_text
        result = await embed_text("hello world")

    assert isinstance(result, list)
    assert result == fake_values


async def test_embed_text_raises_without_api_key():
    """embed_text raises RuntimeError when GEMINI_API_KEY is not set."""
    from app.services.gemini import embed_text
    with patch.dict(os.environ, {"GEMINI_API_KEY": ""}, clear=False):
        # Remove the key entirely if present
        env = {k: v for k, v in os.environ.items() if k != "GEMINI_API_KEY"}
        with patch.dict(os.environ, env, clear=True):
            with pytest.raises(RuntimeError, match="GEMINI_API_KEY"):
                await embed_text("test")


async def test_embed_text_truncates_long_input():
    """embed_text silently truncates text longer than 8000 chars."""
    long_text = "a" * 20_000

    with patch("app.services.gemini.genai") as mock_genai:
        mock_client = MagicMock()
        mock_genai.Client.return_value = mock_client

        mock_embedding = MagicMock()
        mock_embedding.values = [0.5] * 768
        mock_response = MagicMock()
        mock_response.embedding = mock_embedding  # singular — SDK v1 shape
        mock_response.embeddings = [mock_embedding]
        mock_client.models.embed_content.return_value = mock_response

        from app.services.gemini import embed_text
        await embed_text(long_text)

        # The actual text passed to embed_content should be at most 8000 chars
        call_kwargs = mock_client.models.embed_content.call_args
        passed_contents = call_kwargs.kwargs.get("contents") or call_kwargs.args[0] if call_kwargs.args else None
        if passed_contents is None and call_kwargs.kwargs:
            passed_contents = call_kwargs.kwargs.get("contents")
        assert passed_contents is None or len(passed_contents) <= 8000


# ── POST /library/ask route tests ─────────────────────────────────────────────

async def test_ask_returns_400_on_empty_query(client):
    """Empty query string should return 400."""
    with patch("app.routes.search.get_db", return_value=MagicMock()):
        response = await client.post("/library/ask", json={"query": ""})
    assert response.status_code == 400
    assert response.json()["code"] == "EMPTY_QUERY"


async def test_ask_returns_400_on_missing_query(client):
    """Missing query field should return 400."""
    with patch("app.routes.search.get_db", return_value=MagicMock()):
        response = await client.post("/library/ask", json={})
    assert response.status_code == 400


async def test_ask_returns_503_when_db_unavailable(client):
    """Returns 503 when MongoDB is not connected."""
    with patch("app.routes.search.get_db", return_value=None):
        response = await client.post("/library/ask", json={"query": "What is machine learning?"})
    assert response.status_code == 503
    assert response.json()["code"] == "DB_UNAVAILABLE"


async def test_ask_returns_503_when_embedding_fails(client):
    """Returns 503 when the embedding API call fails."""
    with (
        patch("app.routes.search.get_db", return_value=MagicMock()),
        patch(
            "app.routes.search.embed_text",
            new_callable=AsyncMock,
            side_effect=RuntimeError("GEMINI_API_KEY is not set"),
        ),
    ):
        response = await client.post("/library/ask", json={"query": "What is ML?"})
    assert response.status_code == 503
    assert response.json()["code"] == "LLM_UNAVAILABLE"


async def test_ask_returns_answer_and_sources(client):
    """Happy path: valid query returns an answer string and source gist list."""
    from datetime import datetime, timezone

    fake_sources = [
        {
            "original_text": "Machine learning is a type of AI.",
            "explanation": "ML lets computers learn from data without explicit programming.",
            "mode": "standard",
            "url": "https://example.com",
            "category": "Science",
            "created_at": datetime(2024, 1, 1, tzinfo=timezone.utc).isoformat(),
            "score": 0.95,
        }
    ]

    async def fake_stream(*args, **kwargs):
        yield "ML is a subset of AI that learns from data."

    with (
        patch("app.routes.search.get_db", return_value=MagicMock()),
        patch("app.routes.search.embed_text", new_callable=AsyncMock, return_value=[0.1] * 768),
        patch("app.routes.search.semantic_search", new_callable=AsyncMock, return_value=fake_sources),
        patch("app.routes.search.stream_explanation", return_value=fake_stream()),
    ):
        response = await client.post("/library/ask", json={"query": "What is machine learning?"})

    assert response.status_code == 200
    data = response.json()
    assert "answer" in data
    assert "sources" in data
    assert isinstance(data["answer"], str)
    assert len(data["answer"]) > 0
    assert len(data["sources"]) == 1
    assert data["sources"][0]["category"] == "Science"


async def test_ask_returns_zero_result_message_when_no_matches(client):
    """When semantic search finds nothing, return helpful message with empty sources."""
    with (
        patch("app.routes.search.get_db", return_value=MagicMock()),
        patch("app.routes.search.embed_text", new_callable=AsyncMock, return_value=[0.1] * 768),
        patch("app.routes.search.semantic_search", new_callable=AsyncMock, return_value=[]),
    ):
        response = await client.post("/library/ask", json={"query": "What is quantum computing?"})

    assert response.status_code == 200
    data = response.json()
    assert data["sources"] == []
    assert len(data["answer"]) > 0
    # Should mention the library or gisting
    assert any(word in data["answer"].lower() for word in ["library", "gist", "content"])


async def test_ask_returns_503_when_llm_generation_fails(client):
    """Returns 503 when Gemini generation throws during RAG answer."""
    fake_sources = [
        {
            "original_text": "Some text",
            "explanation": "Some explanation",
            "mode": "standard",
            "url": "https://example.com",
            "category": "General",
            "created_at": "2024-01-01T00:00:00+00:00",
            "score": 0.8,
        }
    ]

    async def failing_stream(*args, **kwargs):
        raise RuntimeError("Gemini API error")
        yield  # make it a generator

    with (
        patch("app.routes.search.get_db", return_value=MagicMock()),
        patch("app.routes.search.embed_text", new_callable=AsyncMock, return_value=[0.1] * 768),
        patch("app.routes.search.semantic_search", new_callable=AsyncMock, return_value=fake_sources),
        patch("app.routes.search.stream_explanation", return_value=failing_stream()),
    ):
        response = await client.post("/library/ask", json={"query": "What is this?"})

    assert response.status_code == 503
