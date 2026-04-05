# tests/test_scan.py
"""
Tests for POST /api/v1/scan-terms (Gist Lens endpoint).
All Gemini API calls are mocked — no real network traffic.
"""
import json
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_gemini_result(text: str) -> MagicMock:
    result = MagicMock()
    result.text = text
    return result


VALID_JSON = json.dumps({
    "terms": [
        {"term": "Heuristic", "definition": "A practical method that is not guaranteed to be optimal."},
        {"term": "Latency",   "definition": "The delay before data transfer begins following an instruction."},
    ]
})

# ── Happy path ────────────────────────────────────────────────────────────────

def test_scan_terms_returns_terms(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    with patch("app.routes.scan.genai.Client") as mock_client_cls:
        mock_client_cls.return_value.models.generate_content.return_value = _make_gemini_result(VALID_JSON)
        response = client.post(
            "/api/v1/scan-terms",
            json={"text_content": "The heuristic reduces latency in distributed systems.", "page_context": "Tech blog"},
        )
    assert response.status_code == 200
    data = response.json()
    assert "terms" in data
    assert len(data["terms"]) == 2
    assert data["terms"][0]["term"] == "Heuristic"
    assert "definition" in data["terms"][0]


def test_scan_terms_mock_mode():
    import app.routes.scan as scan_module
    original = scan_module._MOCK_LLM
    scan_module._MOCK_LLM = True
    try:
        response = client.post(
            "/api/v1/scan-terms",
            json={"text_content": "Some text about complex systems.", "page_context": "Docs"},
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["terms"], list)
        assert len(data["terms"]) > 0
        assert "term" in data["terms"][0]
        assert "definition" in data["terms"][0]
    finally:
        scan_module._MOCK_LLM = original


def test_scan_terms_default_page_context(monkeypatch):
    monkeypatch.setenv("MOCK_LLM", "true")
    response = client.post(
        "/api/v1/scan-terms",
        json={"text_content": "Server-side rendering with hydration."},
    )
    assert response.status_code == 200


# ── JSON parsing robustness ───────────────────────────────────────────────────

def test_scan_terms_tolerates_markdown_fence(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    fenced = f"```json\n{VALID_JSON}\n```"
    with patch("app.routes.scan.genai.Client") as mock_client_cls:
        mock_client_cls.return_value.models.generate_content.return_value = _make_gemini_result(fenced)
        response = client.post(
            "/api/v1/scan-terms",
            json={"text_content": "Heuristic and latency are discussed here.", "page_context": "Blog"},
        )
    assert response.status_code == 200
    assert len(response.json()["terms"]) == 2


def test_scan_terms_tolerates_surrounding_text(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    wrapped = f"Sure! Here are the terms:\n{VALID_JSON}\nHope that helps."
    with patch("app.routes.scan.genai.Client") as mock_client_cls:
        mock_client_cls.return_value.models.generate_content.return_value = _make_gemini_result(wrapped)
        response = client.post(
            "/api/v1/scan-terms",
            json={"text_content": "Heuristic and latency are discussed here.", "page_context": "Blog"},
        )
    assert response.status_code == 200
    assert len(response.json()["terms"]) == 2


def test_scan_terms_returns_empty_when_model_says_no_terms(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    empty_json = json.dumps({"terms": []})
    with patch("app.routes.scan.genai.Client") as mock_client_cls:
        mock_client_cls.return_value.models.generate_content.return_value = _make_gemini_result(empty_json)
        response = client.post(
            "/api/v1/scan-terms",
            json={"text_content": "The cat sat on the mat.", "page_context": "Simple text"},
        )
    assert response.status_code == 200
    assert response.json()["terms"] == []


def test_scan_terms_caps_at_five_terms(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    many_terms = {"terms": [{"term": f"Term{i}", "definition": f"Def {i}."} for i in range(10)]}
    with patch("app.routes.scan.genai.Client") as mock_client_cls:
        mock_client_cls.return_value.models.generate_content.return_value = _make_gemini_result(
            json.dumps(many_terms)
        )
        response = client.post(
            "/api/v1/scan-terms",
            json={"text_content": "A " * 100, "page_context": "Test"},
        )
    assert response.status_code == 200
    assert len(response.json()["terms"]) <= 5


# ── Validation errors ─────────────────────────────────────────────────────────

def test_scan_terms_empty_text_returns_400():
    response = client.post("/api/v1/scan-terms", json={"text_content": "   "})
    assert response.status_code == 400
    assert response.json()["code"] == "EMPTY_TEXT"


def test_scan_terms_text_too_long_returns_400():
    response = client.post("/api/v1/scan-terms", json={"text_content": "x" * 3000})
    assert response.status_code == 400
    assert response.json()["code"] == "TEXT_TOO_LONG"


def test_scan_terms_missing_field_returns_400():
    response = client.post("/api/v1/scan-terms", json={})
    assert response.status_code == 400


def test_scan_terms_invalid_json_body_returns_400():
    response = client.post(
        "/api/v1/scan-terms",
        content=b"not json",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_BODY"


# ── LLM / service errors ──────────────────────────────────────────────────────

def test_scan_terms_missing_api_key_returns_503(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("MOCK_LLM", raising=False)
    # Ensure mock mode is off
    import app.routes.scan as scan_module
    original = scan_module._MOCK_LLM
    scan_module._MOCK_LLM = False
    try:
        response = client.post(
            "/api/v1/scan-terms",
            json={"text_content": "Technical content about APIs.", "page_context": "Docs"},
        )
        assert response.status_code == 503
        assert response.json()["code"] == "LLM_UNAVAILABLE"
    finally:
        scan_module._MOCK_LLM = original


def test_scan_terms_parse_error_returns_503(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    with patch("app.routes.scan.genai.Client") as mock_client_cls:
        mock_client_cls.return_value.models.generate_content.return_value = _make_gemini_result(
            "I cannot find any terms in this text."
        )
        response = client.post(
            "/api/v1/scan-terms",
            json={"text_content": "Some content here.", "page_context": "Blog"},
        )
    assert response.status_code == 503
    assert response.json()["code"] == "PARSE_ERROR"
