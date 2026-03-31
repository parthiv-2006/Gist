---
name: gist-patterns
description: >
  Coding patterns, conventions, and workflows extracted from the Gist project —
  a Manifest V3 Chrome Extension (TypeScript/React/Vite) paired with a Python
  FastAPI backend. Use this skill to stay aligned with the project's architecture,
  testing strategy, and coding conventions when building any part of Gist.
version: 1.0.0
source: local-git-analysis
analyzed_commits: 3
---

# Gist Project Patterns

## Project Overview

Gist is a **decoupled two-layer system**: a Chrome Extension (TypeScript + React + Vite) and a Python FastAPI backend that proxies all LLM calls to Google Gemini. The extension runs in three strictly isolated contexts; the backend streams responses via SSE.

---

## Commit Conventions

The project does not yet enforce a convention (only 3 commits: "Initial Commit", "Initial Commit", "Agent Skills"). Follow **Conventional Commits** going forward:

| Prefix | Use For |
|--------|---------|
| `feat:` | New user-visible feature |
| `fix:` | Bug fix |
| `chore:` | Tooling, config, deps |
| `test:` | Test-only changes |
| `docs:` | Documentation updates |
| `refactor:` | Code changes with no behavior change |

---

## Code Architecture

### Extension (`gist-extension/`)

```
gist-extension/
├── manifest.json              # Manifest V3 — permissions: contextMenus, activeTab, scripting, storage
├── vite.config.ts             # Multi-entry build: content, background, popup
├── src/
│   ├── background/index.ts    # Service worker: context menu, shortcuts, ALL fetch() calls
│   ├── content/
│   │   ├── index.ts           # Injected into every tab — selection → GIST_REQUEST
│   │   ├── shadow-host.ts     # Mounts React root inside Shadow DOM
│   │   └── components/
│   │       └── Popover.tsx    # React popover: IDLE/LOADING/STREAMING/DONE/ERROR states
│   ├── popup/App.tsx          # Settings placeholder (MVP only)
│   └── utils/
│       ├── messages.ts        # Typed message schema — SINGLE SOURCE OF TRUTH
│       └── text.ts            # extractSelectedText, validateText, truncateText, sanitizeText
└── tests/
    ├── unit/                  # text.test.ts, messages.test.ts, edge-cases.test.ts
    └── integration/           # highlight-flow.test.ts (Popover component tests)
```

### Backend (`gist-backend/`)

```
gist-backend/
├── app/
│   ├── main.py                # FastAPI factory + CORS middleware
│   ├── routes/simplify.py     # POST /api/v1/simplify — SSE streaming response
│   ├── services/gemini.py     # Gemini wrapper: build_prompt() + stream_explanation()
│   └── models/schemas.py      # Pydantic: SimplifyRequest, ErrorResponse
├── tests/
│   ├── test_simplify.py       # Route tests (mocked via pytest-httpx)
│   ├── test_gemini_service.py # Service-layer unit tests (pure functions)
│   └── test_simplify_edge_cases.py
└── requirements.txt
```

---

## Core Architectural Rules

### 1. All `fetch()` Lives in the Background Service Worker

**Never** call `fetch()` from the content script. Host page CSPs will block it.
The background worker makes all outbound HTTP requests and relays results via `chrome.tabs.sendMessage`.

### 2. All UI Lives in a Shadow DOM

Mount the React popover inside a Shadow DOM element attached to `document.body`. This prevents host page CSS from bleeding into the popover and vice versa.

### 3. Typed Message Contract is the Source of Truth

The `MessageType` union and `GistMessage` interface in `src/utils/messages.ts` are the canonical contract between the three extension contexts. Import from there — never use raw string literals.

```typescript
// All valid message types:
"GIST_REQUEST"               // Content → Background
"GIST_CONTEXT_MENU_TRIGGERED" // Background → Content
"GIST_SHORTCUT_TRIGGERED"    // Background → Content
"GIST_CHUNK"                 // Background → Content (streaming)
"GIST_COMPLETE"              // Background → Content
"GIST_ERROR"                 // Background → Content
```

### 4. Backend Validation via Pydantic `field_validator`

Validation lives in `SimplifyRequest`, not in the route handler. The route catches `pydantic.ValidationError` and maps it to the correct HTTP error code:

| Pydantic error msg | HTTP | Code |
|--------------------|------|------|
| `EMPTY_TEXT` | 400 | `EMPTY_TEXT` |
| `TEXT_TOO_LONG` | 400 | `TEXT_TOO_LONG` |
| Gemini RuntimeError | 503 | `LLM_UNAVAILABLE` |
| Uncaught | 500 | `INTERNAL_ERROR` |

### 5. Text Validation Boundary: 2000 Characters

`selected_text` max is **2000 characters** (enforced both in the extension's `validateText()` and the backend's Pydantic model). 2000 chars = VALID; 2001 chars = `TEXT_TOO_LONG`.

---

## Popover State Machine

```
IDLE → LOADING → STREAMING → DONE
                           ↘ ERROR
```

Each state maps to a distinct UI:
- **IDLE:** Not rendered
- **LOADING:** Skeleton shimmer (3 grey lines), `data-testid="gist-skeleton"`
- **STREAMING:** Text renders progressively
- **DONE:** Full text + close button (`role="button"`, name matches `/close/i`)
- **ERROR:** Error card with human-readable message

---

## SSE Streaming Pattern

Backend yields `data: {"chunk": "..."}` lines; final line is `data: [DONE]`.

```python
# Route
return StreamingResponse(event_generator(), media_type="text/event-stream",
    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
```

Extension reads via `response.body.getReader()` in the background service worker, splits on `\n`, strips `"data: "` prefix, parses JSON, and forwards `GIST_CHUNK` / `GIST_COMPLETE` messages to the content script.

---

## Testing Philosophy

> **Red → Green → Refactor.** AI writes tests first (they fail), then implements until all pass, then cleans up.

### Extension Tests (Vitest)

| File | What It Covers |
|------|----------------|
| `tests/unit/text.test.ts` | extractSelectedText, validateText, truncateText, sanitizeText |
| `tests/unit/messages.test.ts` | buildGistRequest, isGistMessage |
| `tests/unit/edge-cases.test.ts` | Boundary values (exactly 2000, 2001, unicode, emoji) |
| `tests/integration/highlight-flow.test.ts` | Popover component render for all states; uses `@testing-library/react`; stubs `chrome` globals via `vi.stubGlobal` |

**Chrome API mocking pattern:**
```typescript
vi.stubGlobal("chrome", {
  runtime: { sendMessage: vi.fn(), onMessage: { addListener: vi.fn() } }
});
```

### Backend Tests (Pytest + pytest-httpx)

**Critical rule:** Never import the real Gemini SDK in tests. Mock ALL outbound HTTP via `pytest-httpx`.

```python
@pytest.mark.asyncio
async def test_something(httpx_mock):
    httpx_mock.add_response(method="POST", url="https://...gemini...", ...)
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/v1/simplify", json={...})
    assert response.status_code == 200
```

`build_prompt()` is a pure function — test it without any mocks.

---

## Technology Stack (Non-Negotiable for MVP)

| Layer | Tech |
|-------|------|
| Extension language | TypeScript |
| Extension build | Vite (multi-entry: content, background, popup) |
| Extension UI | React + CSS Modules (inside Shadow DOM) |
| Extension tests | Vitest + `@testing-library/react` |
| Backend language | Python 3.11+ |
| Backend framework | FastAPI |
| Backend HTTP client | httpx (async) |
| LLM provider | Google Gemini (`gemini-1.5-flash`) |
| Backend tests | Pytest + pytest-asyncio + pytest-httpx |
| Hosting | Render (free tier) |

---

## Environment Variables

| Variable | Location | Notes |
|----------|----------|-------|
| `GEMINI_API_KEY` | Render Dashboard | **Never commit to git** |
| `ALLOWED_ORIGINS` | Render Dashboard | Chrome extension origin: `chrome-extension://YOUR_ID` |
| `BACKEND_URL` | `src/background/index.ts` | Change per environment |

---

## Common Pitfalls to Avoid

| Pitfall | Fix |
|---------|-----|
| `fetch()` in content script | Move to background service worker |
| `chrome.runtime.sendMessage` returns `undefined` | Add `return true` in `onMessage` listener |
| Service worker state lost | Do NOT use module-level vars; use `chrome.storage.session` |
| Render buffers SSE | Add `X-Accel-Buffering: no` header |
| CORS error in service worker | Set `ALLOWED_ORIGINS=chrome-extension://YOUR_ID` in Render |
| Context menu registered multiple times | Only register in `chrome.runtime.onInstalled` |
| `ValidationError` as 500 | Import from `pydantic`, not `fastapi` |
| Gemini SDK sync iterator in async route | Wrap with `asyncio.to_thread` if needed |

---

## Build & Dev Workflow

```bash
# Extension
npm run build          # Produces dist/ with separate bundles
npm run test           # Vitest unit + integration tests

# Backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
pytest                 # All backend tests
```

Load unpacked extension: `chrome://extensions` → Developer Mode → Load unpacked → select project root.
