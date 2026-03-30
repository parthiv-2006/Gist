"""
tests/test_simplify.py
Route-level integration tests for POST /api/v1/simplify.

The Gemini SDK uses gRPC — not httpx — so all Gemini calls are mocked via
the mock_gemini_success / mock_gemini_failure fixtures in conftest.py,
which patch genai.GenerativeModel.generate_content directly.
"""
import pytest


class TestValidRequests:
    """Happy path — well-formed requests should stream a 200 response."""

    async def test_returns_200_for_valid_input(
        self, client, valid_payload, mock_gemini_success
    ):
        """A well-formed request must return HTTP 200."""
        response = await client.post("/api/v1/simplify", json=valid_payload)
        assert response.status_code == 200

    async def test_response_content_type_is_event_stream(
        self, client, valid_payload, mock_gemini_success
    ):
        """The content-type header must be text/event-stream for SSE."""
        response = await client.post("/api/v1/simplify", json=valid_payload)
        assert "text/event-stream" in response.headers.get("content-type", "")

    async def test_response_body_contains_sse_data_prefix(
        self, client, valid_payload, mock_gemini_success
    ):
        """SSE events must be prefixed with 'data: '."""
        response = await client.post("/api/v1/simplify", json=valid_payload)
        assert b"data:" in response.content

    async def test_response_body_contains_done_sentinel(
        self, client, valid_payload, mock_gemini_success
    ):
        """The stream must end with a 'data: [DONE]' sentinel."""
        response = await client.post("/api/v1/simplify", json=valid_payload)
        assert b"[DONE]" in response.content


class TestEmptyText:
    """Validation: empty or whitespace-only selected_text → 400 EMPTY_TEXT."""

    async def test_empty_string_returns_400(self, client):
        """Empty selected_text must return HTTP 400."""
        response = await client.post(
            "/api/v1/simplify",
            json={
                "selected_text": "",
                "page_context": "Test",
                "complexity_level": "standard",
            },
        )
        assert response.status_code == 400

    async def test_empty_string_returns_empty_text_code(self, client):
        """Error code must be EMPTY_TEXT for empty selected_text."""
        response = await client.post(
            "/api/v1/simplify",
            json={
                "selected_text": "",
                "page_context": "Test",
                "complexity_level": "standard",
            },
        )
        assert response.json()["code"] == "EMPTY_TEXT"

    async def test_whitespace_only_returns_400_empty_text(self, client):
        """Whitespace-only selected_text must be treated as empty."""
        response = await client.post(
            "/api/v1/simplify",
            json={
                "selected_text": "   ",
                "page_context": "Test",
                "complexity_level": "standard",
            },
        )
        assert response.status_code == 400
        assert response.json()["code"] == "EMPTY_TEXT"


class TestTextTooLong:
    """Validation: selected_text exceeds the 2000 character limit."""

    async def test_2001_chars_returns_400(self, client):
        """selected_text > 2000 chars must return HTTP 400."""
        response = await client.post(
            "/api/v1/simplify",
            json={
                "selected_text": "a" * 2001,
                "page_context": "Test",
                "complexity_level": "standard",
            },
        )
        assert response.status_code == 400

    async def test_2001_chars_returns_text_too_long_code(self, client):
        """Error code must be TEXT_TOO_LONG when text exceeds limit."""
        response = await client.post(
            "/api/v1/simplify",
            json={
                "selected_text": "a" * 2001,
                "page_context": "Test",
                "complexity_level": "standard",
            },
        )
        assert response.json()["code"] == "TEXT_TOO_LONG"

    async def test_exactly_2000_chars_is_accepted(
        self, client, mock_gemini_success
    ):
        """selected_text of exactly 2000 chars must NOT be rejected."""
        response = await client.post(
            "/api/v1/simplify",
            json={
                "selected_text": "a" * 2000,
                "page_context": "Test",
                "complexity_level": "standard",
            },
        )
        assert response.status_code == 200


class TestGeminiFailure:
    """Upstream Gemini API errors must be handled gracefully."""

    async def test_gemini_error_returns_503(
        self, client, valid_payload, mock_gemini_failure
    ):
        """A Gemini API error must surface as HTTP 503 to the client."""
        response = await client.post("/api/v1/simplify", json=valid_payload)
        assert response.status_code == 503

    async def test_gemini_error_returns_llm_unavailable_code(
        self, client, valid_payload, mock_gemini_failure
    ):
        """Error code must be LLM_UNAVAILABLE for upstream Gemini errors."""
        response = await client.post("/api/v1/simplify", json=valid_payload)
        assert response.json()["code"] == "LLM_UNAVAILABLE"
