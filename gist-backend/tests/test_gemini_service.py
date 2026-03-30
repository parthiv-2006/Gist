"""
tests/test_gemini_service.py
Unit tests for the Gemini service layer (app/services/gemini.py).
Tests the pure build_prompt() function — no HTTP or SDK mocking needed.
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
        """All template variables must be substituted — no leftover {braces}."""
        prompt = build_prompt("text", "context")
        assert "{page_context}" not in prompt
        assert "{selected_text}" not in prompt

    def test_handles_special_characters_in_text(self):
        """Special chars in user text must not break prompt formatting."""
        prompt = build_prompt('text with "quotes" and {braces}', "Page")
        assert 'text with "quotes"' in prompt

    def test_handles_empty_page_context_gracefully(self):
        """An empty page_context should not crash build_prompt."""
        prompt = build_prompt("text", "")
        # Should produce a non-trivial prompt string regardless
        assert len(prompt) > 50
