"""
tests/test_simplify_edge_cases.py
Edge case tests for POST /api/v1/simplify (backend validation boundaries).
"""
import pytest


async def test_whitespace_only_text_rejected(client):
    """Whitespace-only text must be rejected with EMPTY_TEXT."""
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


async def test_exactly_2000_chars_is_accepted(client, mock_gemini_success):
    """Text of exactly 2000 chars must succeed (inclusive boundary)."""
    response = await client.post(
        "/api/v1/simplify",
        json={
            "selected_text": "a" * 2000,
            "page_context": "Test",
            "complexity_level": "standard",
        },
    )
    assert response.status_code == 200


async def test_missing_page_context_defaults_gracefully(
    client, mock_gemini_success
):
    """An empty page_context must not crash — fallback to 'Unknown page'."""
    response = await client.post(
        "/api/v1/simplify",
        json={
            "selected_text": "valid text",
            "page_context": "",
            "complexity_level": "standard",
        },
    )
    # Should succeed — empty page_context is normalized to "Unknown page"
    assert response.status_code == 200


async def test_unicode_and_emoji_text_accepted(client, mock_gemini_success):
    """Unicode and emoji text must be accepted as valid input."""
    response = await client.post(
        "/api/v1/simplify",
        json={
            "selected_text": "こんにちは 🌍 مرحبا",
            "page_context": "Test",
            "complexity_level": "standard",
        },
    )
    assert response.status_code == 200
