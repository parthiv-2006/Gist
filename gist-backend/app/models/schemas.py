# app/models/schemas.py
import base64
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
    selected_text: Optional[str] = None
    page_context: str
    complexity_level: Literal["standard", "simple", "legal", "academic"] = "standard"
    messages: Optional[List[ChatMessage]] = None
    image_data: Optional[str] = None  # Base64 encoded image, max ~5 MB
    image_mime_type: Optional[str] = "image/png"

    @model_validator(mode="after")
    def validate_request_content(self) -> "SimplifyRequest":
        # Follow-up turns supply messages containing the full conversation history.
        if self.messages:
            total_chars = sum(len(m.content) for m in self.messages)
            if total_chars > MAX_HISTORY_TOTAL_LEN:
                raise ValueError("HISTORY_TOO_LONG")
            return self

        # Must have either text or an image
        has_text = self.selected_text and self.selected_text.strip()
        has_image = self.image_data and self.image_data.strip()

        if not (has_text or has_image):
            raise ValueError("EMPTY_TEXT")

        if has_text:
            stripped = self.selected_text.strip()
            if len(stripped) > MAX_TEXT_LEN:
                raise ValueError("TEXT_TOO_LONG")
            self.selected_text = stripped
        
        return self

    @field_validator("page_context")
    @classmethod
    def validate_page_context(cls, v: str) -> str:
        return v.strip() or "Unknown page"

    @field_validator("image_data")
    @classmethod
    def validate_image_data(cls, v: Optional[str]) -> Optional[str]:
        if v:
            if len(v) > 5_000_000:
                raise ValueError("IMAGE_TOO_LARGE")
            try:
                base64.b64decode(v, validate=True)
            except Exception:
                raise ValueError("INVALID_IMAGE_DATA")
        return v


# ─── Response schemas ─────────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    error: str
    code: str
