# app/services/gemini.py
import os
import asyncio
import queue
import threading
from typing import AsyncGenerator

from google import genai
from google.genai import types


_MODE_INSTRUCTIONS: dict[str, str] = {
    "standard": "explain the selected text in plain English, as if speaking to a curious high schooler",
    "simple": "explain the selected text using extremely simple language and helpful analogies, as if speaking to a 5-year-old",
    "legal": "translate this legal jargon into a clear summary of what it means for the user's rights and responsibilities",
    "academic": "distill this academic passage into its core scholarly argument or finding, while staying very concise",
}

_PROMPT_TEMPLATE = (
    'You are a concise reading assistant. The user has highlighted text from a page titled: "{page_context}".\n\n'
    'Your task is to {mode_instruction}.\n\n'
    'Constraints:\n'
    '- Be brief (2-4 sentences max).\n'
    '- Do not use bullet points.\n'
    '- Do not repeat the original text.\n'
    '- Just explain it.\n\n'
    'Selected text: "{selected_text}"'
)


def build_prompt(selected_text: str, page_context: str, complexity_level: str = "standard") -> str:
    """
    Build the full prompt string for the given complexity_level.
    Pure function — no side effects, easy to unit test.
    """
    instruction = _MODE_INSTRUCTIONS.get(complexity_level, _MODE_INSTRUCTIONS["standard"])
    return _PROMPT_TEMPLATE.format(
        page_context=page_context or "Unknown page",
        selected_text=selected_text,
        mode_instruction=instruction,
    )


async def stream_explanation(
    selected_text: str, page_context: str, complexity_level: str = "standard"
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
    prompt = build_prompt(selected_text, page_context, complexity_level)

    # Bridge the synchronous SDK iterator to this async generator via a queue.
    # Each chunk is enqueued by a daemon thread as it arrives from the network;
    # the event loop reads one chunk at a time — true streaming, no buffering.
    _SENTINEL = object()
    chunk_queue: queue.Queue = queue.Queue()

    def _produce() -> None:
        try:
            for chunk in client.models.generate_content_stream(
                model="gemini-2.0-flash",
                contents=prompt,
            ):
                chunk_queue.put(chunk)
        except Exception as exc:
            chunk_queue.put(RuntimeError(f"Gemini API error: {exc}"))
        finally:
            chunk_queue.put(_SENTINEL)

    loop = asyncio.get_running_loop()
    threading.Thread(target=_produce, daemon=True).start()

    while True:
        item = await loop.run_in_executor(None, chunk_queue.get)
        if item is _SENTINEL:
            return
        if isinstance(item, RuntimeError):
            raise item
        if item.text:
            yield item.text
