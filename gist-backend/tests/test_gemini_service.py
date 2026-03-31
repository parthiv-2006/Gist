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


class TestBuildPromptModes:
    """Tests that each complexity_level produces the correct instruction."""

    def test_standard_mode_uses_high_schooler_instruction(self):
        prompt = build_prompt("text", "Page", complexity_level="standard")
        assert "high schooler" in prompt or "plain English" in prompt

    def test_simple_mode_uses_eli5_instruction(self):
        prompt = build_prompt("text", "Page", complexity_level="simple")
        assert "5-year-old" in prompt or "simple" in prompt.lower()

    def test_legal_mode_uses_rights_instruction(self):
        prompt = build_prompt("text", "Page", complexity_level="legal")
        assert "rights" in prompt or "legal" in prompt.lower()

    def test_academic_mode_uses_scholarly_instruction(self):
        prompt = build_prompt("text", "Page", complexity_level="academic")
        assert "scholarly" in prompt or "academic" in prompt.lower()

    def test_standard_is_default_when_omitted(self):
        prompt_explicit = build_prompt("text", "Page", complexity_level="standard")
        prompt_default = build_prompt("text", "Page")
        assert prompt_explicit == prompt_default

    def test_simple_and_standard_prompts_differ(self):
        """Different modes must produce different prompts."""
        assert build_prompt("text", "Page", "simple") != build_prompt("text", "Page", "standard")

    def test_legal_and_standard_prompts_differ(self):
        assert build_prompt("text", "Page", "legal") != build_prompt("text", "Page", "standard")

    def test_academic_and_standard_prompts_differ(self):
        assert build_prompt("text", "Page", "academic") != build_prompt("text", "Page", "standard")
