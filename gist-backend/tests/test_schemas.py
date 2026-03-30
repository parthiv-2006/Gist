"""
tests/test_schemas.py
Unit tests for Pydantic request/response models (app/models/schemas.py).
These test validation logic in isolation — no HTTP or Gemini calls needed.
"""
import pytest
from pydantic import ValidationError
from app.models.schemas import SimplifyRequest


class TestSimplifyRequest:
    def test_valid_input_parses_successfully(self):
        """A well-formed request must parse without errors."""
        req = SimplifyRequest(
            selected_text="Hello world",
            page_context="Test Page",
            complexity_level="standard",
        )
        assert req.selected_text == "Hello world"
        assert req.page_context == "Test Page"
        assert req.complexity_level == "standard"

    def test_strips_whitespace_from_selected_text(self):
        """Leading/trailing whitespace on selected_text must be stripped."""
        req = SimplifyRequest(
            selected_text="  hello  ",
            page_context="Page",
            complexity_level="standard",
        )
        assert req.selected_text == "hello"

    def test_raises_on_empty_selected_text(self):
        """Empty selected_text must raise ValidationError with EMPTY_TEXT."""
        with pytest.raises(ValidationError) as exc_info:
            SimplifyRequest(
                selected_text="",
                page_context="Page",
                complexity_level="standard",
            )
        assert "EMPTY_TEXT" in str(exc_info.value)

    def test_raises_on_whitespace_only_selected_text(self):
        """Whitespace-only selected_text must be treated as empty."""
        with pytest.raises(ValidationError) as exc_info:
            SimplifyRequest(
                selected_text="   ",
                page_context="Page",
                complexity_level="standard",
            )
        assert "EMPTY_TEXT" in str(exc_info.value)

    def test_raises_on_text_over_2000_chars(self):
        """selected_text > 2000 chars must raise ValidationError with TEXT_TOO_LONG."""
        with pytest.raises(ValidationError) as exc_info:
            SimplifyRequest(
                selected_text="a" * 2001,
                page_context="Page",
                complexity_level="standard",
            )
        assert "TEXT_TOO_LONG" in str(exc_info.value)

    def test_exactly_2000_chars_is_valid(self):
        """Exactly 2000 characters must NOT be rejected (boundary check)."""
        req = SimplifyRequest(
            selected_text="a" * 2000,
            page_context="Page",
            complexity_level="standard",
        )
        assert len(req.selected_text) == 2000

    def test_empty_page_context_defaults_to_unknown_page(self):
        """An empty page_context must default to 'Unknown page'."""
        req = SimplifyRequest(
            selected_text="valid text",
            page_context="",
            complexity_level="standard",
        )
        assert req.page_context == "Unknown page"
