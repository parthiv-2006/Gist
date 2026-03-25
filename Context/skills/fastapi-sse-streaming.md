---
name: fastapi-sse-streaming
description: >
  How to build a FastAPI endpoint that streams its response using
  Server-Sent Events (SSE). Covers the Pydantic request/response models,
  the streaming generator pattern, CORS configuration for Chrome Extension
  origins, and the corresponding client-side fetch() reader in the
  extension's background service worker.
  Use this skill when implementing or modifying the POST /api/v1/simplify endpoint.
---

## Overview

Standard `return JSONResponse(...)` sends the entire response at once. With an LLM, this means the user waits 2–5 seconds for the full response before seeing anything. **SSE streaming** sends the response token-by-token as it arrives, so the user sees text appear within ~500ms.

```
FastAPI (Render)                    Chrome Extension (Background Worker)
───────────────                     ────────────────────────────────────
POST /api/v1/simplify               fetch(BACKEND_URL, { method: "POST" })
  │                                   │
  ├── Calls Gemini streaming API       │
  │   (yields chunks as they arrive)  │
  │                                   │
  ├─→ data: {"chunk": "JS "}     ──→  reader.read() → send GIST_CHUNK
  ├─→ data: {"chunk": "does "}   ──→  reader.read() → send GIST_CHUNK
  ├─→ data: {"chunk": "one..."}  ──→  reader.read() → send GIST_CHUNK
  └─→ data: [DONE]               ──→  reader.read() → send GIST_COMPLETE
```

---

## 1. Backend: Dependencies (`requirements.txt`)

```
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
pydantic>=2.0.0
httpx>=0.26.0           # async HTTP client for Gemini calls
google-generativeai>=0.4.0
python-dotenv>=1.0.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
pytest-httpx>=0.28.0    # Mocks outbound httpx calls in tests
anyio>=4.0.0
```

---

## 2. Pydantic Models (`app/models/schemas.py`)

```python
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
```

---

## 3. Gemini Service (`app/services/gemini.py`)

```python
# app/services/gemini.py
import os
from typing import AsyncGenerator
import google.generativeai as genai

SYSTEM_PROMPT_TEMPLATE = """You are a concise reading assistant. The user has highlighted a piece of \
text from a webpage titled: "{page_context}".

Your task is to explain the selected text in plain English, as if speaking to a curious high schooler. \
Be brief (2-4 sentences max). Do not use bullet points. Do not repeat the original text back. \
Just explain it.

Selected text: "{selected_text}" """


def build_prompt(selected_text: str, page_context: str) -> str:
    """Build the full prompt string. Kept as a pure function for easy unit testing."""
    return SYSTEM_PROMPT_TEMPLATE.format(
        page_context=page_context,
        selected_text=selected_text,
    )


async def stream_explanation(
    selected_text: str, page_context: str
) -> AsyncGenerator[str, None]:
    """
    Calls the Gemini API with streaming enabled.
    Yields text chunks as they arrive.
    Raises RuntimeError if the Gemini API returns an error.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")

    prompt = build_prompt(selected_text, page_context)

    try:
        response = model.generate_content(prompt, stream=True)
        for chunk in response:
            if chunk.text:
                yield chunk.text
    except Exception as e:
        raise RuntimeError(f"Gemini API error: {str(e)}") from e
```

---

## 4. Route with SSE Streaming (`app/routes/simplify.py`)

```python
# app/routes/simplify.py
import json
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import ValidationError

from app.models.schemas import SimplifyRequest, ErrorResponse
from app.services.gemini import stream_explanation

router = APIRouter()


@router.post("/api/v1/simplify")
async def simplify(request: Request):
    # 1. Parse and validate the request body
    try:
        body = await request.json()
        payload = SimplifyRequest(**body)
    except ValidationError as e:
        # Extract the first validation error code
        first_error = e.errors()[0]
        msg = first_error["msg"]

        if "EMPTY_TEXT" in msg:
            return JSONResponse(
                status_code=400,
                content={"error": "selected_text is empty.", "code": "EMPTY_TEXT"},
            )
        if "TEXT_TOO_LONG" in msg:
            return JSONResponse(
                status_code=400,
                content={
                    "error": "selected_text exceeds 2000 characters.",
                    "code": "TEXT_TOO_LONG",
                },
            )
        return JSONResponse(
            status_code=400,
            content={"error": str(e), "code": "VALIDATION_ERROR"},
        )

    # 2. Define the SSE generator
    async def event_generator():
        try:
            async for chunk in stream_explanation(
                payload.selected_text, payload.page_context
            ):
                # Each SSE event: "data: <json>\n\n"
                data = json.dumps({"chunk": chunk})
                yield f"data: {data}\n\n"

            # Signal completion
            yield "data: [DONE]\n\n"

        except RuntimeError as e:
            error_data = json.dumps(
                {"error": str(e), "code": "LLM_UNAVAILABLE"}
            )
            yield f"data: {error_data}\n\n"

    # 3. Return as a streaming response
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Prevents Nginx from buffering the stream
        },
    )
```

---

## 5. App Factory with CORS (`app/main.py`)

```python
# app/main.py
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.simplify import router

app = FastAPI(
    title="Gist API",
    description="Plain-language explanation service for the Gist browser extension.",
    version="0.1.0",
)

# CORS — MUST allow the Chrome Extension's origin
# In production, set ALLOWED_ORIGINS=chrome-extension://YOUR_EXTENSION_ID in Render
allowed_origins_raw = os.environ.get("ALLOWED_ORIGINS", "*")
allowed_origins = [o.strip() for o in allowed_origins_raw.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health():
    """Health check endpoint. Ping this on extension install to warm up Render's free tier."""
    return {"status": "ok"}
```

---

## 6. Extension: Reading the SSE Stream (Background Service Worker)

```typescript
// Inside src/background/index.ts — handleGistRequest function
async function handleGistRequest(message: GistMessage, tabId?: number) {
  if (!tabId || !message.payload.selectedText) return;

  const BACKEND_URL = "https://your-render-url.onrender.com/api/v1/simplify";

  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selected_text: message.payload.selectedText,
        page_context: message.payload.pageContext ?? "",
        complexity_level: "standard",
      }),
    });

    if (!response.ok || !response.body) {
      const err = await response.json();
      chrome.tabs.sendMessage(tabId, {
        type: "GIST_ERROR",
        payload: { error: err.error ?? "API request failed." },
      });
      return;
    }

    // Read the SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n").filter((l) => l.startsWith("data: "));

      for (const line of lines) {
        const data = line.slice(6).trim(); // Remove "data: " prefix

        if (data === "[DONE]") {
          chrome.tabs.sendMessage(tabId, { type: "GIST_COMPLETE", payload: {} });
          return;
        }

        try {
          const parsed = JSON.parse(data);

          if (parsed.error) {
            chrome.tabs.sendMessage(tabId, {
              type: "GIST_ERROR",
              payload: { error: parsed.error },
            });
            return;
          }

          if (parsed.chunk) {
            chrome.tabs.sendMessage(tabId, {
              type: "GIST_CHUNK",
              payload: { chunk: parsed.chunk },
            });
          }
        } catch {
          // Malformed JSON chunk — skip
        }
      }
    }
  } catch (error) {
    chrome.tabs.sendMessage(tabId, {
      type: "GIST_ERROR",
      payload: { error: "Network unavailable. Check your connection." },
    });
  }
}
```

---

## 7. Running the Backend Locally

```bash
cd gist-backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
cp .env.example .env
# Edit .env: add your GEMINI_API_KEY

# Run the dev server
uvicorn app.main:app --reload --port 8000
```

Test it:
```bash
curl -X POST http://localhost:8000/api/v1/simplify \
  -H "Content-Type: application/json" \
  -d '{"selected_text": "The event loop prevents blocking.", "page_context": "MDN", "complexity_level": "standard"}' \
  --no-buffer
```

---

## 8. Common Pitfalls

| Pitfall | Fix |
|---|---|
| Render buffers the SSE stream (nothing arrives until [DONE]) | Add `X-Accel-Buffering: no` to response headers |
| CORS error in the service worker | Chrome extension origins look like `chrome-extension://abc123...`. Add this exact string to `ALLOWED_ORIGINS` in Render |
| `async for chunk in response` not working with the Gemini SDK | The `google-generativeai` SDK's `stream=True` returns a synchronous iterator. Wrap it with `anyio.to_thread.run_sync` or use `asyncio.to_thread` if you need true async |
| Render free tier cold start takes 30+ seconds | Add a `/health` endpoint and ping it from `chrome.runtime.onInstalled` in the extension |
| `ValidationError` bubbling as 500 instead of 400 | Import `ValidationError` from `pydantic`, not `fastapi` |
