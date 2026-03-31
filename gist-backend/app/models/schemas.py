# app/models/schemas.py
from pydantic import BaseModel, field_validator, model_validator
from typing import Literal, Optional, List


class ChatMessage(BaseModel):
    role: Literal["user", "model"]
    content: str


class SimplifyRequest(BaseModel):
    selected_text: str
    page_context: str
    complexity_level: Literal["standard", "simple", "legal", "academic"] = "standard"
    messages: Optional[List[ChatMessage]] = None

    @model_validator(mode="after")
    def validate_selected_text(self) -> "SimplifyRequest":
        # Follow-up turns supply an empty selected_text — that's valid when
        # the conversation history (messages) provides the full context.
        if self.messages:
            return self
        stripped = self.selected_text.strip()
        if not stripped:
            raise ValueError("EMPTY_TEXT")
        if len(stripped) > 2000:
            raise ValueError("TEXT_TOO_LONG")
        self.selected_text = stripped
        return self

    @field_validator("page_context")
    @classmethod
    def validate_page_context(cls, v: str) -> str:
        return v.strip() or "Unknown page"


class ErrorResponse(BaseModel):
    error: str
    code: str
