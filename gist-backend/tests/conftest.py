"""
tests/conftest.py
Shared fixtures for all Gist backend tests.

The Gemini SDK (google-genai) uses gRPC internally — NOT httpx — so
pytest-httpx cannot intercept its calls. Instead, we patch
google.genai.Client.models.generate_content_stream with
unittest.mock.patch to return a fake synchronous iterator.

httpx >= 0.28 dropped the AsyncClient(app=...) shortcut.
Use ASGITransport(app=app) instead.
"""
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, MagicMock

from app.main import app


# ---------------------------------------------------------------------------
# HTTP client fixture
# ---------------------------------------------------------------------------

@pytest.fixture
async def client() -> AsyncClient:
    """Provides an async HTTP client bound to the FastAPI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# Shared payload fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def valid_payload() -> dict:
    """Standard valid request body reused across tests."""
    return {
        "selected_text": "The event loop prevents blocking the main thread.",
        "page_context": "MDN Web Docs",
        "complexity_level": "standard",
    }


# ---------------------------------------------------------------------------
# Gemini SDK mock fixtures
# ---------------------------------------------------------------------------

def _make_fake_chunk(text: str) -> MagicMock:
    """Create a mock Gemini chunk with a .text attribute."""
    chunk = MagicMock()
    chunk.text = text
    return chunk


@pytest.fixture
def mock_gemini_success():
    """
    Patches google.genai.Client so that generate_content_stream returns a
    fake iterator yielding one text chunk and then stops.
    """
    fake_chunk = _make_fake_chunk("JS does one thing at a time.")

    with patch("app.services.gemini.genai") as mock_genai:
        mock_client = MagicMock()
        mock_genai.Client.return_value = mock_client
        # Use side_effect so each call gets a fresh iterator (return_value=iter([...])
        # would be exhausted after the first call).
        mock_client.models.generate_content_stream.side_effect = lambda **_: iter([fake_chunk])
        yield mock_genai


@pytest.fixture
def mock_gemini_failure():
    """
    Patches google.genai.Client so that generate_content_stream raises an
    exception, simulating a Gemini API failure.
    """
    with patch("app.services.gemini.genai") as mock_genai:
        mock_client = MagicMock()
        mock_genai.Client.return_value = mock_client
        mock_client.models.generate_content_stream.side_effect = Exception(
            "503 Service Unavailable"
        )
        yield mock_genai
