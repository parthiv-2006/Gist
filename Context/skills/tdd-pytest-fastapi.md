---
name: tdd-pytest-fastapi
description: >
  TDD workflow for the Gist FastAPI backend using Pytest.
  Covers the Red-Green-Refactor cycle for FastAPI route testing with
  AsyncClient, how to use pytest-httpx to mock all outbound HTTP calls
  to the Gemini API (so tests never hit the real LLM), fixture patterns,
  and clear separation between route-level and service-level tests.
  Use this skill for all Phase 2 and Phase 4 backend testing in Gist.
---

## Overview

**Critical rule:** The Gemini API must NEVER be called in tests. It is slow (~2s), costs quota, and introduces non-deterministic flakiness. Use `pytest-httpx` to intercept and mock every outbound `httpx` request.

**TDD Order:**
1. Write test functions with clear docstrings (all failing — Red)
2. Run `pytest` → confirm `ImportError` or assertion failures
3. Implement the production code
4. Run `pytest` → all tests pass (Green)
5. Refactor, re-run

---

## 1. Install Test Dependencies

```bash
pip install pytest pytest-asyncio pytest-httpx anyio[asyncio] httpx
```

**`requirements-dev.txt`:**
```
pytest>=8.0.0
pytest-asyncio>=0.23.0
pytest-httpx>=0.28.0
anyio[asyncio]>=4.0.0
httpx>=0.26.0
```

---

## 2. `pytest.ini` or `pyproject.toml` Configuration

Add to `pyproject.toml`:
```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"          # Makes all async test functions work without @pytest.mark.asyncio
testpaths = ["tests"]
```

Or create `pytest.ini`:
```ini
[pytest]
asyncio_mode = auto
testpaths = tests
```

---

## 3. Shared Fixtures (`tests/conftest.py`)

```python
# tests/conftest.py
import pytest
from httpx import AsyncClient
from app.main import app


@pytest.fixture
async def client() -> AsyncClient:
    """Provides an async HTTP client scoped to the test's FastAPI app instance."""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def valid_payload() -> dict:
    """Standard valid request body to reuse across tests."""
    return {
        "selected_text": "The event loop prevents blocking the main thread.",
        "page_context": "MDN Web Docs",
        "complexity_level": "standard",
    }


GEMINI_URL = (
    "https://generativelanguage.googleapis.com/"
    "v1beta/models/gemini-1.5-flash:streamGenerateContent"
)

@pytest.fixture
def mock_gemini_success(httpx_mock):
    """Mocks a successful Gemini streaming response."""
    httpx_mock.add_response(
        method="POST",
        url=GEMINI_URL,
        # Simulate a minimal successful SSE chunk from Gemini
        content=b'data: {"candidates": [{"content": {"parts": [{"text": "JS does one thing."}]}}]}\n\n',
        status_code=200,
        headers={"content-type": "text/event-stream"},
    )
    return httpx_mock


@pytest.fixture
def mock_gemini_failure(httpx_mock):
    """Mocks a Gemini API 500 error."""
    httpx_mock.add_response(
        method="POST",
        url=GEMINI_URL,
        status_code=500,
        content=b'{"error": {"message": "Internal error"}}',
    )
    return httpx_mock
```

---

## 4. Route-Level Tests (`tests/test_simplify.py`)

Write these tests FIRST. They will fail with `ImportError` or `404` until the route is implemented.

```python
# tests/test_simplify.py
"""
Route-level integration tests for POST /api/v1/simplify.
All outbound Gemini HTTP calls are intercepted by pytest-httpx.
"""
import pytest
from tests.conftest import GEMINI_URL


class TestValidRequests:
    """Happy path — all valid inputs."""

    async def test_returns_200_for_valid_input(
        self, client, valid_payload, mock_gemini_success
    ):
        """A well-formed request must return HTTP 200."""
        response = await client.post("/api/v1/simplify", json=valid_payload)
        assert response.status_code == 200

    async def test_response_is_event_stream(
        self, client, valid_payload, mock_gemini_success
    ):
        """The content-type header must be text/event-stream for SSE."""
        response = await client.post("/api/v1/simplify", json=valid_payload)
        assert "text/event-stream" in response.headers.get("content-type", "")

    async def test_response_body_contains_data_prefix(
        self, client, valid_payload, mock_gemini_success
    ):
        """SSE events must be prefixed with 'data: '."""
        response = await client.post("/api/v1/simplify", json=valid_payload)
        assert b"data:" in response.content


class TestEmptyText:
    """Validation: empty or whitespace-only selected_text."""

    async def test_empty_string_returns_400(self, client):
        """Empty selected_text must return HTTP 400."""
        response = await client.post(
            "/api/v1/simplify",
            json={"selected_text": "", "page_context": "Test", "complexity_level": "standard"},
        )
        assert response.status_code == 400

    async def test_empty_string_returns_empty_text_code(self, client):
        """Error code must be EMPTY_TEXT for empty selected_text."""
        response = await client.post(
            "/api/v1/simplify",
            json={"selected_text": "", "page_context": "Test", "complexity_level": "standard"},
        )
        assert response.json()["code"] == "EMPTY_TEXT"

    async def test_whitespace_only_returns_400(self, client):
        """Whitespace-only selected_text must be treated as empty."""
        response = await client.post(
            "/api/v1/simplify",
            json={"selected_text": "   ", "page_context": "Test", "complexity_level": "standard"},
        )
        assert response.status_code == 400
        assert response.json()["code"] == "EMPTY_TEXT"


class TestTextTooLong:
    """Validation: selected_text exceeds the 2000 character limit."""

    async def test_2001_chars_returns_400(self, client):
        """selected_text > 2000 chars must return HTTP 400."""
        response = await client.post(
            "/api/v1/simplify",
            json={"selected_text": "a" * 2001, "page_context": "Test", "complexity_level": "standard"},
        )
        assert response.status_code == 400
        assert response.json()["code"] == "TEXT_TOO_LONG"

    async def test_exactly_2000_chars_is_accepted(
        self, client, mock_gemini_success
    ):
        """selected_text of exactly 2000 chars must NOT be rejected."""
        response = await client.post(
            "/api/v1/simplify",
            json={"selected_text": "a" * 2000, "page_context": "Test", "complexity_level": "standard"},
        )
        assert response.status_code == 200


class TestGeminiFailure:
    """Upstream Gemini API errors must be handled gracefully."""

    async def test_gemini_500_returns_503(self, client, valid_payload, mock_gemini_failure):
        """A Gemini API error must surface as HTTP 503 to the client."""
        response = await client.post("/api/v1/simplify", json=valid_payload)
        assert response.status_code == 503

    async def test_gemini_500_returns_llm_unavailable_code(
        self, client, valid_payload, mock_gemini_failure
    ):
        """Error code must be LLM_UNAVAILABLE for upstream Gemini errors."""
        response = await client.post("/api/v1/simplify", json=valid_payload)
        assert response.json()["code"] == "LLM_UNAVAILABLE"
```

---

## 5. Service-Level Tests (`tests/test_gemini_service.py`)

Test the pure functions in `app/services/gemini.py` without any HTTP involved.

```python
# tests/test_gemini_service.py
"""
Unit tests for the Gemini service layer.
These test pure functions only — no HTTP mocking needed.
"""
import pytest
from app.services.gemini import build_prompt


class TestBuildPrompt:
    """Tests for the prompt construction function."""

    def test_includes_selected_text(self):
        """The selected text must appear verbatim in the prompt."""
        prompt = build_prompt("the event loop", "MDN Web Docs")
        assert "the event loop" in prompt

    def test_includes_page_context(self):
        """The page context must be embedded in the prompt."""
        prompt = build_prompt("the event loop", "MDN Web Docs")
        assert "MDN Web Docs" in prompt

    def test_contains_plain_english_instruction(self):
        """The prompt must instruct the model to use plain language."""
        prompt = build_prompt("anything", "Anywhere")
        assert "plain English" in prompt or "high schooler" in prompt

    def test_does_not_contain_unformatted_placeholders(self):
        """Ensure template variables are all substituted (no '{page_context}' left over)."""
        prompt = build_prompt("text", "context")
        assert "{page_context}" not in prompt
        assert "{selected_text}" not in prompt

    def test_handles_special_characters_in_text(self):
        """Special chars in user text must not break prompt formatting."""
        prompt = build_prompt('text with "quotes" and {braces}', "Page")
        assert 'text with "quotes"' in prompt

    def test_handles_empty_page_context(self):
        """An empty page_context should not crash — fallback to 'Unknown page'."""
        # This test documents expected behavior; the service OR the schema must handle it
        prompt = build_prompt("text", "")
        assert "Unknown page" in prompt or len(prompt) > 50
```

---

## 6. Schema Tests (`tests/test_schemas.py`)

Test Pydantic validation logic in isolation.

```python
# tests/test_schemas.py
"""
Unit tests for Pydantic request/response models.
"""
import pytest
from pydantic import ValidationError
from app.models.schemas import SimplifyRequest


class TestSimplifyRequest:
    def test_valid_input_parses_successfully(self):
        req = SimplifyRequest(
            selected_text="Hello world",
            page_context="Test Page",
            complexity_level="standard",
        )
        assert req.selected_text == "Hello world"

    def test_strips_whitespace_from_selected_text(self):
        req = SimplifyRequest(
            selected_text="  hello  ",
            page_context="Page",
            complexity_level="standard",
        )
        assert req.selected_text == "hello"

    def test_raises_on_empty_selected_text(self):
        with pytest.raises(ValidationError) as exc_info:
            SimplifyRequest(
                selected_text="",
                page_context="Page",
                complexity_level="standard",
            )
        assert "EMPTY_TEXT" in str(exc_info.value)

    def test_raises_on_text_over_2000_chars(self):
        with pytest.raises(ValidationError) as exc_info:
            SimplifyRequest(
                selected_text="a" * 2001,
                page_context="Page",
                complexity_level="standard",
            )
        assert "TEXT_TOO_LONG" in str(exc_info.value)

    def test_empty_page_context_defaults_to_unknown_page(self):
        req = SimplifyRequest(
            selected_text="valid",
            page_context="",
            complexity_level="standard",
        )
        assert req.page_context == "Unknown page"
```

---

## 7. Health Check Test

```python
# tests/test_health.py
import pytest


async def test_health_endpoint_returns_200(client):
    """The /health endpoint must always return 200 with status ok."""
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

---

## 8. Running Tests

```bash
# Activate venv first
source venv/bin/activate   # Windows: venv\Scripts\activate

# Run all tests
pytest

# Run with verbose output
pytest -v

# Run a specific file
pytest tests/test_simplify.py -v

# Run a specific class or function
pytest tests/test_simplify.py::TestEmptyText -v

# Run with coverage report
pytest --cov=app --cov-report=term-missing
```

**Target output after full Phase 2 implementation:**
```
tests/test_health.py ....                                [ 10%]
tests/test_schemas.py .....                              [ 30%]
tests/test_gemini_service.py ......                      [ 60%]
tests/test_simplify.py .........                         [ 95%]

========= 25 passed in 1.42s =========
```

---

## 9. Common Pitfalls

| Pitfall | Fix |
|---|---|
| `RuntimeError: no running event loop` | Set `asyncio_mode = "auto"` in `pytest.ini` |
| `pytest-httpx` not intercepting Gemini SDK calls | The `google-generativeai` SDK uses its own gRPC transport, not `httpx`. Use `unittest.mock.patch` on the SDK method instead |
| Tests are slow (~2s each) | You are hitting the real Gemini API. Check that `httpx_mock` fixture is in the test function signature |
| `422 Unprocessable Entity` in tests | FastAPI rejected the request body — the test JSON doesn't match the Pydantic model shape |
| `fixture 'client' not found` | `conftest.py` must be in the `tests/` directory (or project root), not a subdirectory |
| Schema `ValidationError` not triggering on empty string | Pydantic v2 won't reject an empty string by default. You MUST add a `@field_validator` — see `app/models/schemas.py` in skill `fastapi-sse-streaming` |
