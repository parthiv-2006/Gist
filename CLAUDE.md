# Gist — Claude Code Project Context

> **Read this file first.** This is the single source of truth for project conventions, commands,
> and constraints. Refer to it at the start of every session. Never contradict it.

---

## What Is Gist?

A Manifest V3 Chrome Extension that lets users highlight any text on a webpage and instantly
receive a plain-language AI explanation in a floating popover — without leaving the page.
Backend is a Python/FastAPI service that proxies calls to Google Gemini and streams the response
via SSE back to the extension.

**Current Status:** Phase 2 complete. Backend deployed to Render. Ready to begin Phase 3 (Integration & Popover UI).

---

## Repository Structure

```
Gist/                          ← repo root (you are here)
├── CLAUDE.md                  ← this file
├── render.yaml                ← Render deployment config (backend)
├── Context/
│   ├── functional-requirements.md   ← FULL PRD — read before starting any phase
│   └── skills/                      ← Skill reference files (read before implementing)
│       ├── project-bootstrap.md     ← Exact CLI commands to scaffold both sub-projects
│       ├── tdd-vitest-chrome-mocks.md
│       ├── tdd-pytest-fastapi.md
│       ├── fastapi-sse-streaming.md
│       ├── chrome-extension-mv3.md
│       ├── shadow-dom-react-injection.md
│       ├── vite-multi-entry-build.md
│       ├── popover-design.md        ← Visual spec: colors, fonts, spacing (read before Phase 3 UI)
│       ├── explanation-modes.md     ← Prompt engineering spec for ELI5, Legal, Academic (read before Phase 5)
│       └── gist-patterns.md
├── gist-extension/            ← Chrome Extension (TypeScript + React + Vite) [created in Phase 1]
└── gist-backend/              ← FastAPI backend (Python 3.11+)              [created in Phase 2]
```

---

## Key Commands

### Extension (`gist-extension/`)

```bash
npm install          # Install all dependencies
npm run build        # Vite multi-entry build → dist/ folder (load this in chrome://extensions)
npm run test         # Run Vitest unit + integration tests once
npm run test:watch   # Re-run on file save
npm run test:coverage
```

### Backend (`gist-backend/`)

```bash
# First time setup
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Run dev server
uvicorn app.main:app --reload --port 8000

# Run tests
pytest
pytest -v
pytest --cov=app --cov-report=term-missing
```

---

## Technology Stack (Non-Negotiable)

| Layer | Technology | Notes |
|---|---|---|
| Extension language | TypeScript | Strict mode required |
| Extension build | Vite (multi-entry) | See `skills/vite-multi-entry-build.md` |
| Extension UI | React + CSS Modules | Inside Shadow DOM — no Tailwind |
| Extension testing | Vitest + @testing-library/react | See `skills/tdd-vitest-chrome-mocks.md` |
| Backend language | Python 3.11+ | |
| Backend framework | FastAPI | See `skills/fastapi-sse-streaming.md` |
| LLM | Google Gemini (`gemini-1.5-flash`) | Via `google-genai` SDK (v1.x) |
| Backend testing | Pytest + pytest-httpx | See `skills/tdd-pytest-fastapi.md` |
| Hosting | Render (free tier) | Config in `render.yaml` |

---

## Hard Constraints — Never Violate These

1. **No Tailwind CSS.** Use CSS Modules with CSS custom properties.
2. **All extension UI must be inside Shadow DOM.** No direct DOM injection.
3. **All `fetch()` calls must live in the background service worker.** Never in the content script.
4. **Never call the real Gemini API in tests.** Mock ALL outbound HTTP with `pytest-httpx` for Python and `vi.fn()` for TypeScript.
5. **Chrome/Chromium only.** No Firefox or Safari compatibility shims in MVP.
6. **No user accounts, no auth, no PDF parsing** — hard out-of-scope.
7. **The LLM model string is always `gemini-1.5-flash`.** No other model names.
8. **TDD is mandatory.** Write tests before implementation for every phase. Red → Green → Refactor.

---

## Inter-Script Message Protocol

All messages between content script and background worker use this schema.
**Defined in `src/utils/messages.ts` — import from there everywhere.**

```typescript
type MessageType = "GIST_REQUEST" | "GIST_CHUNK" | "GIST_COMPLETE" | "GIST_ERROR";

interface GistMessage {
  type: MessageType;
  payload: {
    selectedText?: string;
    pageContext?: string;
    chunk?: string;
    error?: string;
  };
}
```

**Message flow:**
- Content Script → Background Worker: `chrome.runtime.sendMessage(message)`
- Background Worker → Content Script: `chrome.tabs.sendMessage(tabId, message)`

The background worker MUST use `chrome.tabs.sendMessage(tabId, ...)` — NOT `chrome.runtime.sendMessage` — when relaying chunks back to the content script.

---

## Phase Tracker

| Phase | Description | Status |
|---|---|---|
| 0 | Documentation & planning | ✅ Done |
| 1 | Extension Skeleton & Infrastructure | ✅ Done — 26/26 tests passing, build succeeds |
| 2 | Backend API & LLM Engine | ✅ Done — 31/31 tests passing, 93% coverage, deployed to Render |
| 3 | Integration & Popover UI | ✅ Done — end-to-end flow working |
| 4 | Polish, Edge Cases & Store Submission | ✅ Done |
| 5 | Explanation Selection Modes | ⏳ Not started |

**Before starting any phase:** Read the corresponding section in
`@Context/functional-requirements.md` and the relevant skill files listed above.

---

## Before You Write Any Code

1. Read `@Context/functional-requirements.md` § matching the current phase.
2. Read the skill files relevant to that phase (listed in the PRD phase header).
3. Write tests first (Red).
4. Implement until tests pass (Green).
5. Refactor, then present the manual verification checklist from the PRD for the user to run.
