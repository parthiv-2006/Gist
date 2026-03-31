# Gist — Instant In-Context Text Explanations

A Manifest V3 Chrome Extension that lets you highlight any text on any webpage and instantly receive a plain-language AI explanation in a floating popover — without leaving the page.

---

## How It Works

1. Highlight any complex text on any webpage
2. Right-click → **"Gist this"** (or press `Ctrl/Cmd+Shift+E`)
3. A floating popover appears anchored to your selection, streaming the explanation in real time

---

## Architecture

```
[Chrome Extension — TypeScript + React + Vite]
       │
       ├── loader.js  (classic content script)
       │       Bootstraps the ESM bundle via dynamic import().
       │
       ├── content.js  (ES Module, injected via loader)
       │       Injected into every page tab.
       │       Reads window.getSelection() on trigger.
       │       Mounts React popover into an isolated Shadow DOM.
       │       Communicates with the background worker via chrome.runtime.
       │
       ├── background.js  (Service Worker)
       │       Registers the "Gist this" context menu item.
       │       Handles Ctrl/Cmd+Shift+E keyboard shortcut.
       │       Owns all outbound fetch() calls (avoids CORS/CSP issues).
       │       Streams Gemini response back to content script via SSE chunks.
       │
       └── popup.html  (Extension popup — settings placeholder)

[Python Backend — FastAPI on Render]
       │
       └── POST /api/v1/simplify
               Accepts selected text + page title.
               Constructs the Gemini prompt.
               Streams response via Server-Sent Events (SSE).
```

### Key Design Decisions

| Decision | Rationale |
|---|---|
| All `fetch()` calls in the background worker | Content scripts are subject to host-page CSP; the background worker is not |
| Shadow DOM for the popover UI | Prevents host-page CSS from bleeding into the extension's styles |
| Classic `loader.js` + ESM `content.js` | Chrome MV3 doesn't support `type: module` in `content_scripts`; a tiny loader bridges the gap |
| SSE streaming from backend → extension | User sees the first token in ~500ms instead of waiting for the full response |
| Sliding-window rate limiter (5 req / 10s) | Prevents runaway API usage from rapid repeated triggers |

---

## Project Structure

```
Gist/
├── README.md
├── render.yaml                  ← Render deployment config
├── Context/
│   ├── functional-requirements.md
│   └── skills/                  ← Reference guides used during development
├── gist-extension/              ← Chrome Extension (TypeScript + React + Vite)
│   ├── public/
│   │   ├── manifest.json
│   │   └── loader.js            ← Classic-script ESM bridge
│   ├── src/
│   │   ├── background/index.ts
│   │   ├── content/
│   │   │   ├── index.ts
│   │   │   ├── shadow-host.ts
│   │   │   └── components/Popover.tsx
│   │   ├── popup/
│   │   └── utils/
│   │       ├── messages.ts      ← Typed message contract (shared across all contexts)
│   │       ├── text.ts
│   │       └── rate-limiter.ts
│   └── tests/
│       ├── unit/
│       └── integration/
└── gist-backend/                ← FastAPI backend (Python 3.11+)
    ├── app/
    │   ├── main.py
    │   ├── routes/simplify.py
    │   ├── services/gemini.py
    │   └── models/schemas.py
    └── tests/
```

---

## Local Development

### Prerequisites

- Node.js 18+
- Python 3.11+
- A Google Gemini API key (`gemini-1.5-flash` model)

### Extension

```bash
cd gist-extension
npm install
npm run build        # Output goes to dist/ — load this folder in Chrome
npm run test         # Run Vitest unit + integration tests
npm run dev          # Watch mode — rebuilds on save
```

**Loading in Chrome:**
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select `gist-extension/dist/`

### Backend

```bash
cd gist-backend
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt

# Create .env from the example
cp .env.example .env
# Add your GEMINI_API_KEY to .env

uvicorn app.main:app --reload --port 8000
```

**Running backend tests:**
```bash
pytest
pytest -v
pytest --cov=app --cov-report=term-missing
```

### Environment Variables

| Variable | Location | Description |
|---|---|---|
| `GEMINI_API_KEY` | `gist-backend/.env` (never commit) | Google Gemini API key |
| `ALLOWED_ORIGINS` | `gist-backend/.env` | Comma-separated CORS origins |
| `BACKEND_URL` | `gist-extension/src/background/index.ts` | Deployed backend URL |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension language | TypeScript (strict) |
| Extension build | Vite (multi-entry) |
| Extension UI | React + CSS Modules inside Shadow DOM |
| Extension testing | Vitest + @testing-library/react |
| Backend language | Python 3.11+ |
| Backend framework | FastAPI |
| LLM | Google Gemini (`gemini-1.5-flash`) |
| Backend testing | Pytest + pytest-asyncio |
| Hosting | Render (free tier) |

---

## Chrome Web Store Submission

Before submitting:
- [ ] All 4 icon sizes present: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
- [ ] Promotional screenshot at 1280×800
- [ ] Store description written (see below)
- [ ] Privacy policy URL provided (required for extensions that make network requests)
- [ ] `GEMINI_API_KEY` set in Render dashboard — never committed to git

**Short description (132 chars max):**
> Highlight any text on any webpage and get an instant plain-language explanation — powered by Gemini AI, without leaving the page.

**Detailed description:**
> Gist eliminates reading friction. Whether you're working through dense technical docs, academic papers, or legal jargon, just highlight the confusing text and hit "Gist this." A clean floating popover streams a plain-English explanation directly on the page — no tab switching, no copy-pasting, no context loss.
>
> Features:
> - Right-click context menu or Ctrl/Cmd+Shift+E keyboard shortcut
> - Streams the explanation token-by-token for near-instant feedback
> - **[NEW] Interactive Follow-up Chat**: Ask questions about any explanation
> - **[NEW] Visual Analogies**: Automatic diagrams (Mermaid.js/ASCII) for complex concepts
> - **[NEW] Text-to-Speech**: Listen to explanations with a single click
> - Fully isolated UI — never interferes with host-page styles
> - Works on all websites including GitHub, MDN, and Wikipedia

---

## Resume Bullet

> Architected a decoupled browser extension (TypeScript/React/Vite) with a streaming Python (FastAPI) backend, leveraging Google Gemini to deliver real-time, in-context text simplification with < 500ms time-to-first-token.
