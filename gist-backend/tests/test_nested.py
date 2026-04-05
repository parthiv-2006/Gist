# tests/test_nested.py
"""Tests for POST /api/v1/nested-gist (Progressive Disclosure)."""
import json
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _make_gemini_result(text: str) -> MagicMock:
    result = MagicMock()
    result.text = text
    return result


# ── Happy path ────────────────────────────────────────────────────────────────

def test_nested_gist_returns_definition(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    with patch("app.routes.nested.genai.Client") as mock_cls:
        mock_cls.return_value.models.generate_content.return_value = _make_gemini_result(
            "A JavaScript mechanism that handles asynchronous operations."
        )
        response = client.post(
            "/api/v1/nested-gist",
            json={"term": "Event Loop", "parent_context": "JavaScript explanation"},
        )
    assert response.status_code == 200
    assert "definition" in response.json()
    assert len(response.json()["definition"]) > 0


def test_nested_gist_mock_mode():
    import app.routes.nested as nested_module
    original = nested_module._MOCK_LLM
    nested_module._MOCK_LLM = True
    try:
        response = client.post(
            "/api/v1/nested-gist",
            json={"term": "Promise", "parent_context": "Async code"},
        )
        assert response.status_code == 200
        assert response.json()["definition"]
    finally:
        nested_module._MOCK_LLM = original


def test_nested_gist_default_context():
    import app.routes.nested as nested_module
    original = nested_module._MOCK_LLM
    nested_module._MOCK_LLM = True
    try:
        response = client.post(
            "/api/v1/nested-gist",
            json={"term": "Async"},
        )
        assert response.status_code == 200
    finally:
        nested_module._MOCK_LLM = original


# ── Validation errors ──────────────────────────────────────────────────────────

def test_nested_gist_empty_term_returns_400():
    response = client.post(
        "/api/v1/nested-gist",
        json={"term": "   ", "parent_context": "Test"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "EMPTY_TERM"


def test_nested_gist_term_too_long_returns_400():
    response = client.post(
        "/api/v1/nested-gist",
        json={"term": "x" * 101, "parent_context": "Test"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "TERM_TOO_LONG"


def test_nested_gist_missing_term_returns_400():
    response = client.post(
        "/api/v1/nested-gist",
        json={"parent_context": "Test"},
    )
    assert response.status_code == 400


def test_nested_gist_invalid_json_returns_400():
    response = client.post(
        "/api/v1/nested-gist",
        content=b"not json",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_BODY"


# ── LLM errors ────────────────────────────────────────────────────────────────

def test_nested_gist_missing_api_key_returns_503(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("MOCK_LLM", raising=False)
    import app.routes.nested as nested_module
    original = nested_module._MOCK_LLM
    nested_module._MOCK_LLM = False
    try:
        response = client.post(
            "/api/v1/nested-gist",
            json={"term": "Promise", "parent_context": "Async"},
        )
        assert response.status_code == 503
        assert response.json()["code"] == "LLM_UNAVAILABLE"
    finally:
        nested_module._MOCK_LLM = original


def test_nested_gist_gemini_error_returns_503(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    with patch("app.routes.nested.genai.Client") as mock_cls:
        mock_cls.return_value.models.generate_content.side_effect = Exception(
            "503 Service Unavailable"
        )
        response = client.post(
            "/api/v1/nested-gist",
            json={"term": "Callback", "parent_context": "Async patterns"},
        )
    assert response.status_code == 503
    assert response.json()["code"] == "LLM_UNAVAILABLE"
