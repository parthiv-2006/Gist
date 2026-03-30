# app/models/schemas.py
from pydantic import BaseModel, field_validator
from typing import Literal


class SimplifyRequest(BaseModel):
    selected_text: str
    page_context: str
    complexity_level: Literal["standard"] = "standard"

    @field_validator("selected_text")
    @classmethod
    def validate_selected_text(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("EMPTY_TEXT")
        if len(stripped) > 2000:
            raise ValueError("TEXT_TOO_LONG")
        return stripped

    @field_validator("page_context")
    @classmethod
    def validate_page_context(cls, v: str) -> str:
        return v.strip() or "Unknown page"


class ErrorResponse(BaseModel):
    error: str
    code: str
