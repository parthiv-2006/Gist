# app/models/schemas.py
from pydantic import BaseModel, field_validator, model_validator
from typing import Literal, Optional, List


# ─── Constants ────────────────────────────────────────────────────────────────

MAX_TEXT_LEN = 2000
# Total character cap across all messages in a follow-up conversation.
# Prevents history-stuffing attacks that bypass per-message limits.
MAX_HISTORY_TOTAL_LEN = 20_000


# ─── Sub-models ───────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: Literal["user", "model"]
    content: str


# ─── Request schema ───────────────────────────────────────────────────────────

class SimplifyRequest(BaseModel):
    selected_text: str
    page_context: str
    complexity_level: Literal["standard", "simple", "legal", "academic"] = "standard"
    messages: Optional[List[ChatMessage]] = None

    @model_validator(mode="after")
    def validate_selected_text(self) -> "SimplifyRequest":
        # Follow-up turns supply messages containing the full conversation history.
        # Validate total history size instead of the (empty) selected_text.
        if self.messages:
            total_chars = sum(len(m.content) for m in self.messages)
            if total_chars > MAX_HISTORY_TOTAL_LEN:
                raise ValueError("HISTORY_TOO_LONG")
            return self

        stripped = self.selected_text.strip()
        if not stripped:
            raise ValueError("EMPTY_TEXT")
        if len(stripped) > MAX_TEXT_LEN:
            raise ValueError("TEXT_TOO_LONG")
        self.selected_text = stripped
        return self

    @field_validator("page_context")
    @classmethod
    def validate_page_context(cls, v: str) -> str:
        return v.strip() or "Unknown page"


# ─── Response schemas ─────────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    error: str
    code: str
