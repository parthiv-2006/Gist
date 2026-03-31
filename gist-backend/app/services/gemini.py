# app/services/gemini.py
import os
import asyncio
import queue
import threading
from typing import AsyncGenerator

from google import genai
from google.genai import types as _genai_types  # noqa: F401 — kept for future use


# ─── Model Configuration ──────────────────────────────────────────────────────

# The model name is defined here as a single source of truth.
# gemini-2.5-flash is the current default; update here if the project migrates.
GEMINI_MODEL = "gemini-2.5-flash"

# ─── Mode Instructions ────────────────────────────────────────────────────────

_MODE_INSTRUCTIONS: dict[str, str] = {
    "standard": "explain the selected text in plain English, as if speaking to a curious high schooler",
    "simple": "explain the selected text using extremely simple language and helpful analogies, as if speaking to a 5-year-old",
    "legal": "translate this legal jargon into a clear summary of what it means for the user's rights and responsibilities",
    "academic": "distill this academic passage into its core scholarly argument or finding, while staying very concise",
}

# ─── Prompt Builder ───────────────────────────────────────────────────────────

# The page_context and selected_text are wrapped in XML-style delimiters so
# the model clearly distinguishes between system instructions and user data.
# This is a primary mitigation against prompt injection attacks where a hostile
# webpage title or highlighted text attempts to override the system role.
_PROMPT_TEMPLATE = (
    "You are a concise reading assistant.\n\n"
    "<task>{mode_instruction}.</task>\n\n"
    "Constraints:\n"
    "- Be brief (2-4 sentences max).\n"
    "- Do not repeat the original text.\n"
    "- Just explain it.\n\n"
    "Visual Analogies:\n"
    "If the concept is complex, you ARE encouraged to use a small Mermaid.js diagram or an ASCII chart. "
    "Format diagrams within a code block (e.g., ```mermaid ... ```).\n\n"
    "<page_title>{page_context}</page_title>\n\n"
    "<selected_text>{selected_text}</selected_text>"
)

# Maximum length we allow page_context to grow before truncating.
# Keeps the prompt small and limits injection surface area.
_MAX_PAGE_CONTEXT_LEN = 200


def _sanitize_page_context(raw: str) -> str:
    """
    Truncate and strip the page context to reduce the prompt-injection surface.
    We do NOT strip angle brackets or quotes here because they are contained by
    the XML delimiters in the prompt template; the model sees them as data, not
    instructions.
    """
    return (raw.strip() or "Unknown page")[:_MAX_PAGE_CONTEXT_LEN]


def build_prompt(selected_text: str, page_context: str, complexity_level: str = "standard") -> str:
    """
    Build the full prompt string for the given complexity_level.
    Pure function — no side effects, easy to unit test.
    """
    instruction = _MODE_INSTRUCTIONS.get(complexity_level, _MODE_INSTRUCTIONS["standard"])
    return _PROMPT_TEMPLATE.format(
        page_context=_sanitize_page_context(page_context),
        selected_text=selected_text,
        mode_instruction=instruction,
    )


# ─── Streaming ────────────────────────────────────────────────────────────────

async def stream_explanation(
    selected_text: str,
    page_context: str,
    complexity_level: str = "standard",
    messages: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    """
    Call the Gemini API with streaming enabled.
    Yields text chunks as they arrive from the model.
    Raises RuntimeError if the API key is missing or Gemini returns an error.

    NOTE: The google-generativeai SDK uses gRPC internally (not httpx).
    In tests, patch 'app.services.gemini.genai' directly with unittest.mock.patch.
    The SDK's generate_content(stream=True) returns a synchronous iterator, so
    we run it in a thread pool to keep the FastAPI event loop unblocked.

    Thread cancellation: a threading.Event is passed to the producer thread so
    that if the client disconnects (the async generator is garbage-collected),
    the thread can exit early rather than continuing to consume Gemini quota.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")

    client = genai.Client(api_key=api_key)

    # For the very first turn, build the initial prompt
    if not messages:
        contents = [build_prompt(selected_text, page_context, complexity_level)]
    else:
        # Convert our ChatMessage list into the format the Gemini SDK expects
        # { 'role': 'user'|'model', 'parts': [{'text': '...'}] }
        contents = []
        for msg in messages:
            contents.append({
                "role": "user" if msg["role"] == "user" else "model",
                "parts": [{"text": msg["content"]}]
            })

    # Bridge the synchronous SDK iterator to this async generator via a queue.
    # Each chunk is enqueued by a daemon thread as it arrives from the network;
    # the event loop reads one chunk at a time — true streaming, no buffering.
    _SENTINEL = object()
    chunk_queue: queue.Queue = queue.Queue()
    cancel_event = threading.Event()

    def _produce() -> None:
        try:
            for chunk in client.models.generate_content_stream(
                model=GEMINI_MODEL,
                contents=contents,
            ):
                if cancel_event.is_set():
                    # Client disconnected — stop consuming Gemini quota early.
                    return
                chunk_queue.put(chunk)
        except Exception as exc:
            chunk_queue.put(RuntimeError(f"Gemini API error: {exc}"))
        finally:
            chunk_queue.put(_SENTINEL)

    loop = asyncio.get_running_loop()
    threading.Thread(target=_produce, daemon=True).start()

    try:
        while True:
            item = await loop.run_in_executor(None, chunk_queue.get)
            if item is _SENTINEL:
                return
            if isinstance(item, RuntimeError):
                raise item
            if item.text:
                yield item.text
    finally:
        # Signal the producer thread to stop if the consumer exits early
        # (e.g. client disconnected, exception in caller, generator GC'd).
        cancel_event.set()
