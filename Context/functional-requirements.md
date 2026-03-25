# PRD: "Gist" — Browser Extension

> **Reading Level:** Spec designed for an AI-native IDE/agent (e.g., Cursor, Windsurf, Antigravity). Every section is written to be machine-parseable and unambiguous. When in doubt, bias toward the most explicit interpretation.

---

## 1. Problem Statement

The internet is gated by specialized vocabulary. When reading technical documentation, academic papers, or legal terms of service, users hit a wall of jargon. Existing workarounds require tab-switching, copying, pasting into ChatGPT/Gemini, and re-prompting — a 5-step context switch that kills focus.

**Gist solves this in one action:** highlight → get a plain-language explanation inline, without ever leaving the page.

---

## 2. Product Vision & Success Metrics

**Vision:** Eliminate reading friction by providing instant, in-context plain-language translations of complex text, directly within the user's browser — with zero context switching.

### KPIs

| Milestone | Metric | Target |
|---|---|---|
| Month 3 Post-Launch | Active Weekly Users (AWU) | 50 |
| Month 3 | API calls/week | 250 |
| Month 3 | Avg. response latency (P95) | < 2 seconds |
| Month 6 | AWU | 500 |
| Month 6 | Day-7 User Retention | ≥ 30% |
| Month 6 | Chrome Web Store Rating | ≥ 4.5 ★ |
| Month 12 | AWU | 2,000 |
| Month 12 | Monetization | Rate-limiting tier live |

---

## 3. User Personas

| Persona | Background | Core Need |
|---|---|---|
| **Liam the Learner** | Undergrad reading dense academic papers | Grasp core concepts fast without domain-specific syntax slowing him down |
| **Sarah the Professional** | Non-technical PM reviewing engineering specs | Translate tech jargon into business logic to make decisions |

---

## 4. Feature Scope

### 4.1 MVP (Phases 1–4 — Build Target)

| Feature | Description |
|---|---|
| **Text Selection Trigger** | User highlights text → right-clicks → selects "Gist this" from the context menu **OR** presses `Cmd/Ctrl+Shift+E` |
| **Floating Popover UI** | A minimal, accessible popover anchors near the highlighted text and renders the explanation |
| **Single Complexity Mode** | One optimized background prompt: *"Explain this clearly to a high schooler. Be concise."* |
| **Streaming Response** | LLM response streams token-by-token to eliminate perceived latency (SSE/chunked transfer) |
| **Error Handling** | Graceful fallback messages for: API timeout, text too long (>2,000 chars), network offline, CSP block |
| **Loading State** | Skeleton/shimmer animation visible while awaiting the API response |

### 4.2 V2 (Planned Fast-Follows — Do Not Build Yet)

- **Complexity Toggles:** UI slider: "ELI5" / "Casual" / "Academic"
- **History Log:** Last 20 explanations persisted to `chrome.storage.local`
- **Pinned Popover:** Allow user to "pin" the popover and drag it

### 4.3 Out of Scope (Hard Blocks — Do Not Implement)

- PDF parsing (Canvas/PDF.js text extraction is flaky and a solo-project time sink)
- User accounts or authentication backend
- Firefox / Safari support in MVP (Chrome/Chromium-only)
- On-device LLM inference

---

## 5. Technical Architecture

### 5.1 Overview

Gist is a **decoupled two-layer system**: a Manifest V3 Chrome Extension (TypeScript frontend) paired with a lightweight Python backend that proxies all LLM calls.

```
[Chrome Browser]
    │
    ├── Content Script (content.ts)
    │       Injected into every page tab.
    │       Listens for text selection events.
    │       Renders React popover into an isolated Shadow DOM.
    │       Sends/receives messages via chrome.runtime.
    │
    ├── Background Service Worker (background.ts)
    │       Registers context menu item.
    │       Manages keyboard shortcuts.
    │       Owns all outbound network fetch() calls (avoids CORS).
    │       Relays streamed chunks back to the content script.
    │
    └── Extension Popup (popup.html / popup.tsx) [Optional settings page]

[Python Backend — FastAPI on Render/Vercel]
    │
    └── POST /api/v1/simplify
            Accepts selected text + page context.
            Constructs the LLM prompt.
            Streams Gemini response via SSE.
            Returns simplified text.
```

### 5.2 Extension File Structure

```
gist-extension/
├── manifest.json              # Manifest V3 config
├── package.json
├── tsconfig.json
├── vite.config.ts             # Multi-entry Vite build (content, background, popup)
├── src/
│   ├── background/
│   │   └── index.ts           # Service worker: context menu, shortcuts, fetch
│   ├── content/
│   │   ├── index.ts           # Entry point: injected into pages
│   │   ├── shadow-host.ts     # Mounts React app into Shadow DOM
│   │   └── components/
│   │       └── Popover.tsx    # React popover UI component
│   ├── popup/
│   │   ├── index.html
│   │   └── App.tsx            # Settings page (placeholder for MVP)
│   └── utils/
│       ├── text.ts            # Text extraction, validation, truncation helpers
│       └── messages.ts        # Typed message schema (shared by all scripts)
└── tests/
    ├── unit/
    │   ├── text.test.ts
    │   └── messages.test.ts
    └── integration/
        └── highlight-flow.test.ts
```

### 5.3 Backend File Structure

```
gist-backend/
├── app/
│   ├── main.py                # FastAPI app entrypoint
│   ├── routes/
│   │   └── simplify.py        # POST /api/v1/simplify route + SSE streaming
│   ├── services/
│   │   └── gemini.py          # Gemini API wrapper + prompt builder
│   └── models/
│       └── schemas.py         # Pydantic request/response models
├── tests/
│   ├── test_simplify.py       # Pytest route tests (mocked Gemini)
│   └── test_gemini_service.py # Pytest service-layer tests
├── requirements.txt
└── .env.example
```

### 5.4 Technology Decisions (Non-Negotiable for MVP)

| Layer | Technology | Rationale |
|---|---|---|
| Extension Language | **TypeScript** | Type-safe message passing between isolated contexts prevents entire class of runtime bugs |
| Extension Build | **Vite** (multi-entry) | Fast HMR, native ESM, easy to configure multiple entry points (content, background, popup) |
| Extension UI | **React** + **CSS Modules** | Component model works cleanly inside Shadow DOM; CSS Modules prevent style leakage |
| Shadow DOM | Required for all UI | Prevents host page CSS from bleeding into the popover |
| Backend Language | **Python 3.11+** | Mature async ecosystem; best Gemini SDK support |
| Backend Framework | **FastAPI** | Native async, automatic OpenAPI docs, Pydantic validation, SSE streaming support |
| LLM Provider | **Google Gemini API** | Large free-tier quota; zero cost during development |
| Hosting | **Render** (free tier) | Zero-config deployment from a GitHub repo; keeps it simple |
| Extension Testing | **Vitest** | Same config as Vite; great TypeScript support; built-in mocking |
| Backend Testing | **Pytest** + **pytest-httpx** | The standard for FastAPI; `pytest-httpx` mocks outbound HTTP cleanly |

### 5.5 Inter-Script Message Protocol

All messages between the content script and background worker MUST use this typed contract. Define it in `src/utils/messages.ts` and import it everywhere.

```typescript
// src/utils/messages.ts

export type MessageType =
  | "GIST_REQUEST"      // Content Script → Background Worker
  | "GIST_CHUNK"        // Background Worker → Content Script (streaming)
  | "GIST_COMPLETE"     // Background Worker → Content Script
  | "GIST_ERROR";       // Background Worker → Content Script

export interface GistMessage {
  type: MessageType;
  payload: {
    selectedText?: string;
    pageContext?: string;   // document.title
    chunk?: string;         // A streamed text chunk
    error?: string;         // Human-readable error message
  };
}
```

---

## 6. API Contract

### `POST /api/v1/simplify`

**Request Body (JSON):**

```json
{
  "selected_text": "The asynchronous nature of the JavaScript event loop prevents blocking the main thread.",
  "page_context": "MDN Web Docs - Concurrency model",
  "complexity_level": "standard"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `selected_text` | string | ✅ | Max 2,000 characters. Reject with 400 if exceeded. |
| `page_context` | string | ✅ | Page `document.title`. Grounds the LLM in the correct domain. |
| `complexity_level` | string | ✅ | MVP only accepts `"standard"`. V2 adds `"eli5"` and `"academic"`. |

**Response: Server-Sent Events (SSE) stream**

```
data: {"chunk": "JavaScript"}
data: {"chunk": " does"}
data: {"chunk": " one thing at a time..."}
data: [DONE]
```

**Error Response (JSON):**

```json
{
  "error": "selected_text exceeds maximum length of 2000 characters.",
  "code": "TEXT_TOO_LONG"
}
```

**Error Codes:**

| Code | HTTP Status | Trigger |
|---|---|---|
| `TEXT_TOO_LONG` | 400 | `selected_text` > 2,000 chars |
| `EMPTY_TEXT` | 400 | `selected_text` is blank or whitespace-only |
| `LLM_UNAVAILABLE` | 503 | Gemini API returned a non-200 status |
| `INTERNAL_ERROR` | 500 | Uncaught exception |

**LLM System Prompt (MVP):**

```
You are a concise reading assistant. The user has highlighted a piece of
text from a webpage titled: "{page_context}".

Your task is to explain the selected text in plain English, as if speaking
to a curious high schooler. Be brief (2–4 sentences max). Do not use
bullet points. Do not repeat the original text back. Just explain it.

Selected text: "{selected_text}"
```

---

## 7. Phased Build Plan & TDD Strategy

> **Testing Philosophy:** Red → Green → Refactor.  
> For every phase: the AI agent writes the tests first, they fail (Red), then the agent implements the feature until all tests pass (Green), then cleans up (Refactor). The user then performs manual verification from the checklist at the end of each phase.

---

### Phase 1: Extension Skeleton & Infrastructure

**Duration:** ~1 week  
**Goal:** A functioning Chrome extension shell that captures highlighted text and passes a correctly-structured message to the Background Service Worker. No backend. No UI. Just the plumbing.

#### Deliverables

- [ ] `manifest.json` (Manifest V3) with correct permissions: `contextMenus`, `scripting`, `activeTab`, `storage`
- [ ] Vite multi-entry build pipeline (`vite.config.ts`) producing separate bundles for `content`, `background`, and `popup`
- [ ] `src/utils/text.ts` — text extraction and validation utility functions
- [ ] `src/utils/messages.ts` — typed message schema
- [ ] `src/background/index.ts` — registers context menu item, listens for shortcut, relays messages
- [ ] `src/content/index.ts` — listens for context menu trigger, reads `window.getSelection()`, sends `GIST_REQUEST` message

#### TDD: Unit Tests (AI Writes First)

**File:** `tests/unit/text.test.ts`

The agent MUST write and run the following tests BEFORE writing any implementation code in `text.ts`.

```typescript
// tests/unit/text.test.ts
import { describe, it, expect } from "vitest";
import {
  extractSelectedText,
  validateText,
  truncateText,
  sanitizeText,
} from "../../src/utils/text";

describe("extractSelectedText", () => {
  it("returns trimmed text from a non-empty selection", () => {
    // mock window.getSelection to return "  Hello World  "
    // expect extractSelectedText() to return "Hello World"
  });
  it("returns null when selection is empty", () => {
    // mock window.getSelection to return ""
    // expect extractSelectedText() to return null
  });
  it("returns null when selection is only whitespace", () => {
    // mock window.getSelection to return "   "
    // expect extractSelectedText() to return null
  });
});

describe("validateText", () => {
  it("returns VALID for a normal text string under 2000 chars", () => {
    expect(validateText("Hello world")).toBe("VALID");
  });
  it("returns TEXT_TOO_LONG for text with 2001+ characters", () => {
    expect(validateText("a".repeat(2001))).toBe("TEXT_TOO_LONG");
  });
  it("returns EMPTY_TEXT for an empty string", () => {
    expect(validateText("")).toBe("EMPTY_TEXT");
  });
  it("returns EMPTY_TEXT for whitespace-only string", () => {
    expect(validateText("   ")).toBe("EMPTY_TEXT");
  });
});

describe("truncateText", () => {
  it("returns the string unchanged if under the limit", () => {
    expect(truncateText("short text", 2000)).toBe("short text");
  });
  it("truncates to exactly the limit and appends '...'", () => {
    const long = "a".repeat(2005);
    const result = truncateText(long, 2000);
    expect(result.length).toBeLessThanOrEqual(2003); // 2000 + "..."
    expect(result.endsWith("...")).toBe(true);
  });
});

describe("sanitizeText", () => {
  it("strips leading/trailing whitespace", () => {
    expect(sanitizeText("  hello  ")).toBe("hello");
  });
  it("collapses multiple internal spaces into one", () => {
    expect(sanitizeText("hello   world")).toBe("hello world");
  });
  it("strips newlines and replaces them with a space", () => {
    expect(sanitizeText("hello\nworld")).toBe("hello world");
  });
});
```

**File:** `tests/unit/messages.test.ts`

```typescript
// tests/unit/messages.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildGistRequest, isGistMessage } from "../../src/utils/messages";

describe("buildGistRequest", () => {
  it("builds a valid GIST_REQUEST message payload", () => {
    const msg = buildGistRequest("jargon text", "MDN Web Docs");
    expect(msg.type).toBe("GIST_REQUEST");
    expect(msg.payload.selectedText).toBe("jargon text");
    expect(msg.payload.pageContext).toBe("MDN Web Docs");
  });
});

describe("isGistMessage", () => {
  it("returns true for a valid GistMessage object", () => {
    const msg = { type: "GIST_REQUEST", payload: { selectedText: "foo" } };
    expect(isGistMessage(msg)).toBe(true);
  });
  it("returns false for an object missing the type field", () => {
    expect(isGistMessage({ payload: {} })).toBe(false);
  });
  it("returns false for a null value", () => {
    expect(isGistMessage(null)).toBe(false);
  });
});
```

#### Manual Verification Checklist (User Performs)

After all unit tests pass (`npm run test`), the user loads the unpacked extension in Chrome (`chrome://extensions` → "Load unpacked") and verifies:

- [ ] Extension appears in the Chrome toolbar with the correct name "Gist"
- [ ] Navigating to any webpage and highlighting text, then right-clicking shows "Gist this" in the context menu
- [ ] Pressing `Cmd/Ctrl+Shift+E` after highlighting text does not throw an error (check `chrome://extensions` → service worker logs)
- [ ] The browser console log in the background service worker shows the correctly shaped `GIST_REQUEST` message object when the context menu item is clicked

---

### Phase 2: Backend API & LLM Engine

**Duration:** ~1 week  
**Goal:** A deployed FastAPI endpoint at `POST /api/v1/simplify` that accepts text, constructs the Gemini prompt, streams the response via SSE, and returns it. No extension changes yet.

#### Deliverables

- [ ] `app/models/schemas.py` — Pydantic `SimplifyRequest` and `SimplifyResponse` models with field validation
- [ ] `app/services/gemini.py` — Gemini API client wrapper with the MVP system prompt
- [ ] `app/routes/simplify.py` — FastAPI router for `POST /api/v1/simplify`, SSE streaming response
- [ ] `app/main.py` — App factory with CORS middleware (allow extension origin)
- [ ] Deployed to Render and accessible via a public URL
- [ ] `.env.example` with all required variables documented (`GEMINI_API_KEY`, `ALLOWED_ORIGINS`)

#### TDD: Unit Tests (AI Writes First)

> **Critical Rule:** Never import or call the real Gemini SDK in tests. Mock ALL outbound HTTP using `pytest-httpx`.

**File:** `tests/test_simplify.py`

```python
# tests/test_simplify.py
import pytest
from httpx import AsyncClient, Response
from app.main import app


@pytest.mark.asyncio
async def test_simplify_returns_stream_for_valid_input(httpx_mock):
    """A valid request should return a 200 SSE stream."""
    # Mock the Gemini API response
    httpx_mock.add_response(
        method="POST",
        url="https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent",
        content=b'data: {"candidates": [{"content": {"parts": [{"text": "JS does one thing at a time."}]}}]}\n\n',
        status_code=200,
    )
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/simplify",
            json={
                "selected_text": "The event loop prevents blocking.",
                "page_context": "MDN Web Docs",
                "complexity_level": "standard",
            },
        )
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]


@pytest.mark.asyncio
async def test_simplify_rejects_empty_text():
    """A request with an empty selected_text must return 400."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/simplify",
            json={
                "selected_text": "",
                "page_context": "Some Page",
                "complexity_level": "standard",
            },
        )
    assert response.status_code == 400
    assert response.json()["code"] == "EMPTY_TEXT"


@pytest.mark.asyncio
async def test_simplify_rejects_text_over_limit():
    """A request with selected_text > 2000 chars must return 400."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/simplify",
            json={
                "selected_text": "a" * 2001,
                "page_context": "Some Page",
                "complexity_level": "standard",
            },
        )
    assert response.status_code == 400
    assert response.json()["code"] == "TEXT_TOO_LONG"


@pytest.mark.asyncio
async def test_simplify_returns_503_when_gemini_fails(httpx_mock):
    """If Gemini returns a non-200, we must surface a 503."""
    httpx_mock.add_response(
        method="POST",
        url="https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent",
        status_code=500,
        content=b'{"error": "Internal Server Error"}',
    )
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/simplify",
            json={
                "selected_text": "valid text here",
                "page_context": "Some Page",
                "complexity_level": "standard",
            },
        )
    assert response.status_code == 503
    assert response.json()["code"] == "LLM_UNAVAILABLE"
```

**File:** `tests/test_gemini_service.py`

```python
# tests/test_gemini_service.py
import pytest
from app.services.gemini import build_prompt


def test_build_prompt_includes_selected_text():
    prompt = build_prompt("the event loop", "MDN Web Docs")
    assert "the event loop" in prompt


def test_build_prompt_includes_page_context():
    prompt = build_prompt("the event loop", "MDN Web Docs")
    assert "MDN Web Docs" in prompt


def test_build_prompt_contains_instruction_language():
    """The prompt must instruct the model to use plain English."""
    prompt = build_prompt("anything", "Anywhere")
    assert "plain English" in prompt or "high schooler" in prompt
```

#### Manual Verification Checklist (User Performs)

- [ ] Run `pytest` locally — all tests pass
- [ ] Send a real `curl` or Postman request to the deployed Render URL endpoint and receive a streamed SSE response
- [ ] Confirm the `GEMINI_API_KEY` environment variable is set in the Render dashboard (not committed to git)
- [ ] Confirm the Swagger UI at `/docs` lists the `/api/v1/simplify` endpoint correctly
- [ ] Test error cases manually: send an empty string body and a 2001-character string and confirm correct error codes

---

### Phase 3: Integration & Popover UI

**Duration:** ~1 week  
**Goal:** Connect the extension to the live backend. Render the explanation in a polished, accessible React popover anchored to the selection. The full user flow works end-to-end.

#### Deliverables

- [ ] `src/content/components/Popover.tsx` — React component with loading, success, and error states
- [ ] `src/content/shadow-host.ts` — Mounts React app root inside a Shadow DOM `<div>` attached to `document.body`
- [ ] `src/background/index.ts` (updated) — `fetch()` to the backend, reads SSE stream, relays `GIST_CHUNK` and `GIST_COMPLETE` messages to the content script
- [ ] CSS Modules stylesheet for the Popover (no Tailwind; scoped styles inside Shadow DOM)
- [ ] Popover anchors to the position of the text selection (`getBoundingClientRect()`)
- [ ] Popover closes on `Escape` key press or click outside

#### Popover Component State Machine

```
IDLE → [user triggers Gist] → LOADING → [first chunk arrives] → STREAMING → [GIST_COMPLETE] → DONE
                                                                            ↘ [GIST_ERROR] → ERROR
```

Each state maps to a distinct UI:
- **IDLE:** Not rendered / hidden
- **LOADING:** Skeleton shimmer animation (3 grey lines)
- **STREAMING:** Text renders progressively as chunks arrive
- **DONE:** Full explanation shown with a "✕ Close" button
- **ERROR:** Error message in a styled error card with a retry hint

#### TDD: Integration Tests (AI Writes First)

**File:** `tests/integration/highlight-flow.test.ts`

```typescript
// tests/integration/highlight-flow.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Popover } from "../../src/content/components/Popover";

// Mock chrome APIs globally
const mockSendMessage = vi.fn();
vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: mockSendMessage,
    onMessage: {
      addListener: vi.fn(),
    },
  },
});

describe("Popover Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a loading skeleton when state is LOADING", () => {
    render(<Popover state="LOADING" text="" onClose={() => {}} />);
    expect(screen.getByTestId("gist-skeleton")).toBeInTheDocument();
  });

  it("renders streamed text when state is STREAMING", () => {
    render(<Popover state="STREAMING" text="JS does one thing" onClose={() => {}} />);
    expect(screen.getByText(/JS does one thing/)).toBeInTheDocument();
  });

  it("renders full explanation when state is DONE", () => {
    render(<Popover state="DONE" text="Full explanation here." onClose={() => {}} />);
    expect(screen.getByText("Full explanation here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("renders an error message when state is ERROR", () => {
    render(<Popover state="ERROR" text="" error="Network unavailable." onClose={() => {}} />);
    expect(screen.getByText(/Network unavailable/i)).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", async () => {
    const mockClose = vi.fn();
    render(<Popover state="DONE" text="Some text." onClose={mockClose} />);
    screen.getByRole("button", { name: /close/i }).click();
    await waitFor(() => expect(mockClose).toHaveBeenCalledOnce());
  });
});
```

#### Manual Verification Checklist (User Performs)

- [ ] Reload the unpacked extension after the new build
- [ ] Navigate to `https://developer.mozilla.org` (or any jargon-heavy page)
- [ ] Highlight a complex sentence and use the context menu or keyboard shortcut
- [ ] Verify the loading skeleton appears immediately
- [ ] Verify the text streams in progressively (not a sudden single block)
- [ ] Verify the popover closes when pressing `Escape`
- [ ] Verify the popover closes when clicking outside its bounds
- [ ] Navigate to `https://github.com` and verify the flow still works (CSP test)
- [ ] Turn off Wi-Fi and trigger Gist — verify the ERROR state renders with a helpful message

---

### Phase 4: Polish, Edge Cases & Chrome Web Store Submission

**Duration:** ~1 week  
**Goal:** Harden the extension against real-world edge cases, define the UI's final visual identity, and submit to the Chrome Web Store.

#### Deliverables

- [ ] Final visual design applied: font, color palette, border-radius, shadow defined in CSS custom properties
- [ ] Popover is fully keyboard accessible (close button focusable, `Escape` exits)
- [ ] ARIA labels on all interactive elements (`role="dialog"`, `aria-label="Gist explanation"`)
- [ ] Rate-limiting UX: if the user triggers Gist more than 5 times in 10 seconds, show a "Slow down!" toast
- [ ] Chrome Web Store assets: 1280×800 promotional screenshot, 128×128 icon (all four sizes: 16, 48, 128), store description copy
- [ ] `README.md` for the git repo with setup instructions, architecture diagram, and a demo GIF

#### TDD: Edge Case Tests (AI Writes First)

**File:** `tests/unit/edge-cases.test.ts`

```typescript
// tests/unit/edge-cases.test.ts
import { describe, it, expect } from "vitest";
import { validateText } from "../../src/utils/text";

describe("Edge Case: Text validation", () => {
  it("handles text that is exactly 2000 characters (boundary — VALID)", () => {
    expect(validateText("a".repeat(2000))).toBe("VALID");
  });
  it("handles text that is exactly 2001 characters (boundary — TOO_LONG)", () => {
    expect(validateText("a".repeat(2001))).toBe("TEXT_TOO_LONG");
  });
  it("handles text with only special characters", () => {
    // Special chars alone are still valid text
    expect(validateText("!@#$%^&*()")).toBe("VALID");
  });
  it("handles unicode and emoji text", () => {
    expect(validateText("こんにちは 🌍 مرحبا")).toBe("VALID");
  });
});
```

**File:** `tests/test_simplify_edge_cases.py` (backend)

```python
# tests/test_simplify_edge_cases.py
import pytest
from httpx import AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_whitespace_only_text_rejected():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/simplify",
            json={"selected_text": "   ", "page_context": "Test", "complexity_level": "standard"},
        )
    assert response.status_code == 400
    assert response.json()["code"] == "EMPTY_TEXT"


@pytest.mark.asyncio
async def test_exactly_2000_chars_is_accepted(httpx_mock):
    httpx_mock.add_response(
        method="POST",
        url="https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent",
        content=b'data: {"candidates": [{"content": {"parts": [{"text": "OK"}]}}]}\n\n',
        status_code=200,
    )
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/simplify",
            json={"selected_text": "a" * 2000, "page_context": "Test", "complexity_level": "standard"},
        )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_missing_page_context_defaults_gracefully():
    """page_context is technically required but should degrade gracefully if empty."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/simplify",
            json={"selected_text": "valid text", "page_context": "", "complexity_level": "standard"},
        )
    # Should not crash — backend uses "Unknown page" as the fallback
    assert response.status_code in [200, 400]
```

#### Manual Verification Checklist (User Performs)

- [ ] Trigger Gist on pages with a strict CSP (GitHub, Google Docs web, banking sites) — should not error in the DevTools console
- [ ] Test with text selections of exactly 2000 characters — should work
- [ ] Test with text selections of 2001 characters — should show "text too long" UI
- [ ] Test with selections of only numbers, only emojis, only a URL
- [ ] Verify all 4 icon sizes render correctly in `chrome://extensions`
- [ ] Complete the Chrome Web Store Developer registration and submit the first build
- [ ] Verify the Render backend stays alive (warm-up ping route at `GET /health` returns `200`)

---

## 8. Environment Variables & Secrets

| Variable | Location | Description |
|---|---|---|
| `GEMINI_API_KEY` | Render Dashboard (backend) | Google Gemini API Key. Never commit to git. |
| `ALLOWED_ORIGINS` | Render Dashboard (backend) | Comma-separated list of allowed CORS origins (use `chrome-extension://YOUR_EXTENSION_ID`) |
| `BACKEND_URL` | `src/background/index.ts` (extension) | URL of the deployed FastAPI backend. Change per environment. |

---

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **CSP blocks network calls from content script** | High | High | All `fetch()` calls live in the Background Service Worker, never the content script |
| **LLM response latency > 2s** | Medium | High | Stream the response via SSE; user sees text flowing within ~500ms of first token |
| **Render free tier cold start (~30s)** | High | High | Add a `GET /health` endpoint; ping it on extension install (`chrome.runtime.onInstalled`) to warm it up |
| **Chrome Web Store review delays** | Medium | Medium | Submit a bare-bones "Hello World" extension under the developer account early to pass initial review, then push content updates |
| **Host page CSS bleeding into popover** | High | Medium | Shadow DOM fully isolates the Popover's styles from any host page styles |
| **Gemini API quota exceeded** | Low | Medium | Log `tokens_used` per response. If approaching quota, return a throttled error with a user-friendly message |

---

## 10. Resume & Portfolio Framing

> Refer to this when writing your resume or presenting this project in interviews.

**Resume Bullet:**
> "Architected a decoupled browser extension (TypeScript/React/Vite) with a streaming Python (FastAPI) backend, leveraging Google Gemini to deliver real-time, in-context text simplification with < 500ms time-to-first-token."

**Interview Talking Points:**
1. **Isolated browser environments:** Explain how Chrome extensions run in three separate contexts (content script, background worker, popup) with strict message-passing as the only communication channel — and how TypeScript's type system was used to enforce the message contract across all three.
2. **Streaming architecture:** Describe the SSE → `fetch()` (background worker) → `chrome.runtime.sendMessage` → React state update pipeline and why this was necessary to beat the perceived latency problem.
3. **Shadow DOM isolation:** Explain why a naive `innerHTML` append would have been broken by host page CSS, and how mounting a React root inside a Shadow DOM solved it cleanly.
