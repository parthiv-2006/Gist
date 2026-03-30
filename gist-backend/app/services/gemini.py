# app/services/gemini.py
import os
import asyncio
from typing import AsyncGenerator

from google import genai
from google.genai import types


SYSTEM_PROMPT_TEMPLATE = (
    'You are a concise reading assistant. The user has highlighted a piece of '
    'text from a webpage titled: "{page_context}".\n\n'
    'Your task is to explain the selected text in plain English, as if speaking '
    'to a curious high schooler. Be brief (2-4 sentences max). Do not use bullet '
    'points. Do not repeat the original text back. Just explain it.\n\n'
    'Selected text: "{selected_text}"'
)


def build_prompt(selected_text: str, page_context: str) -> str:
    """
    Build the full prompt string.
    Pure function — no side effects, easy to unit test.
    """
    return SYSTEM_PROMPT_TEMPLATE.format(
        page_context=page_context or "Unknown page",
        selected_text=selected_text,
    )


async def stream_explanation(
    selected_text: str, page_context: str
) -> AsyncGenerator[str, None]:
    """
    Call the Gemini API with streaming enabled.
    Yields text chunks as they arrive from the model.
    Raises RuntimeError if the API key is missing or Gemini returns an error.

    NOTE: The google-generativeai SDK uses gRPC internally (not httpx).
    In tests, patch 'app.services.gemini.genai' directly with unittest.mock.patch.
    The SDK's generate_content(stream=True) returns a synchronous iterator, so
    we run it in a thread pool to keep the FastAPI event loop unblocked.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")

    client = genai.Client(api_key=api_key)
    prompt = build_prompt(selected_text, page_context)

    try:
        # generate_content_stream returns a synchronous iterator.
        # asyncio.to_thread keeps the event loop free while the SDK does I/O.
        def _stream():
            return list(
                client.models.generate_content_stream(
                    model="gemini-1.5-flash",
                    contents=prompt,
                )
            )

        chunks = await asyncio.to_thread(_stream)
        for chunk in chunks:
            if chunk.text:
                yield chunk.text
    except Exception as e:
        raise RuntimeError(f"Gemini API error: {e}") from e
