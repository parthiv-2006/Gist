# app/services/gemini.py
import os
import asyncio
import queue
import threading
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

    # Bridge the synchronous SDK iterator to this async generator via a queue.
    # Each chunk is enqueued by a daemon thread as it arrives from the network;
    # the event loop reads one chunk at a time — true streaming, no buffering.
    _SENTINEL = object()
    chunk_queue: queue.Queue = queue.Queue()

    def _produce() -> None:
        try:
            for chunk in client.models.generate_content_stream(
                model="gemini-1.5-flash",
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
