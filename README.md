<div align="center">

# 🍃 Gist

**Your AI-powered knowledge garden — right inside the browser.**

Highlight any text on any webpage. Get an instant, streaming explanation without ever leaving the page.  
Then save it, search it, visualize it, and let your knowledge compound over time.

[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Gemini](https://img.shields.io/badge/Google_Gemini-2.5_Flash-886FBF?logo=googlegemini&logoColor=white)](https://ai.google.dev/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## The Problem

Reading the internet is full of friction. You run into dense legal clauses, unfamiliar jargon in a research paper, or a terse code comment that assumes context you don't have. The usual workflow — copy, open a new tab, paste, read, try to remember where you were — breaks your flow every single time.

## The Solution

Gist eliminates that loop entirely. Highlight the confusing text, press `Ctrl+Shift+E` (or right-click → *"Gist this"*), and a floating popover streams a plain-English explanation directly on the page. No tab switching, no copy-pasting, no context loss.

But Gist doesn't stop at explaining. Everything you gist gets saved to a persistent, searchable knowledge base. Over time, your library becomes a personal second brain — one you can query with natural language, visualize as a knowledge graph, and study with AI-generated flashcards.

---

## ✨ Features

### Core Experience
- **Instant Explanations** — Streaming responses via SSE with ~500ms time-to-first-token
- **Multiple Explanation Modes** — Standard, ELI5 (Simple), Legal, and Academic
- **Follow-up Chat** — Ask contextual questions about any explanation without leaving the popover
- **Visual Capture** — Select a region of the screen (`Alt+Shift+G`) and explain images, diagrams, or screenshots
- **Progressive Disclosure** — Double-click any word in an explanation to drill deeper; breadcrumb trail lets you navigate back
- **Visual Analogies** — Automatic Mermaid.js diagrams for complex concepts, rendered as inline SVGs

### Knowledge Base
- **Gist Library** — Every explanation is persisted to MongoDB with auto-categorization (Code, Legal, Medical, Finance, Science, General)
- **Semantic Search (RAG)** — Ask your library questions in natural language; Gist retrieves relevant notes via vector embeddings and synthesizes an answer
- **Smart Tags** — AI-generated tags for every saved gist, enabling fast filtering and discovery
- **Grid & Split-Pane Interface** — Browse saved gists in a masonry grid; click to open a detail panel with source URL, original text, and a "Chat with this Gist" box

### Advanced Tools
- **Synapse Knowledge Graph** — PCA-projected, KMeans-clustered interactive visualization of your entire knowledge base, with AI-labeled topic clusters and cosine-similarity edges
- **Recall (Spaced Repetition)** — Auto-generated flashcards from saved gists; SM-2 inspired review intervals surface cards when they're due
- **AutoGist Scroll Assistant** — Ambient viewport observer that summarizes what you're currently reading in a ghost-mode widget (opt-in)
- **Full Dashboard** — A premium, full-page dashboard with sidebar navigation, activity streaks, category breakdowns, and library insights

### Under the Hood
- **Shadow DOM Isolation** — All on-page UI lives inside an isolated Shadow DOM; host-page styles never interfere
- **Background-Only Networking** — Every `fetch()` call lives in the background service worker, bypassing host-page CSP restrictions
- **Sliding-Window Rate Limiter** — Client-side + server-side rate limiting to prevent runaway API usage
- **Security Hardening** — Prompt injection mitigations (XML delimiters, input sanitization, output validation), DOMPurify for SVGs, HSTS/X-Frame-Options/CSP headers, and message sender validation

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Chrome Extension (MV3)                          │
│                 TypeScript · React · Vite · CSS Modules             │
│                                                                     │
│  ┌─────────────┐   chrome.runtime    ┌──────────────────────────┐  │
│  │ Content      │ ◄────────────────► │ Background Service Worker │  │
│  │ Script       │   messages          │                          │  │
│  │              │                     │ • Context menu handler   │  │
│  │ • Selection  │                     │ • Keyboard shortcut      │  │
│  │   detection  │                     │ • All fetch() calls      │  │
│  │ • Shadow DOM │                     │ • SSE stream relay       │  │
│  │   popover    │                     │ • Rate limiter           │  │
│  │ • AutoGist   │                     │ • Library save/load      │  │
│  │   observer   │                     └──────────┬───────────────┘  │
│  └──────────────┘                                │                  │
│                                                  │ HTTPS            │
│  ┌──────────────────────────────────────┐        │                  │
│  │ Popup / Full Dashboard (Tab Mode)    │        │                  │
│  │ Overview · Library · Synapse ·       │        │                  │
│  │ Recall · Settings                    │        │                  │
│  └──────────────────────────────────────┘        │                  │
└──────────────────────────────────────────────────┼──────────────────┘
                                                   │
                                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend (Python)                        │
│                Render · Uvicorn · Motor · SlowAPI                   │
│                                                                     │
│  POST /api/v1/simplify ─── Streaming explanation via SSE            │
│  POST /api/v1/visualize ── Mermaid diagram generation + SVG render  │
│  POST /api/v1/nested-gist  Progressive disclosure definitions      │
│  POST /autogist ─────────── Viewport ambient summarization          │
│                                                                     │
│  GET/POST /library ──────── CRUD for saved gists                    │
│  POST /library/ask ──────── Semantic RAG search                     │
│  POST /library/{id}/recall  Flashcard generation                    │
│                                                                     │
│  GET/POST /synapse ──────── Knowledge graph compute + cache         │
│                                                                     │
│  Services:                                                          │
│  ├── gemini.py ── Streaming, embedding, tagging, recall cards       │
│  ├── synapse.py ─ PCA projection, KMeans clustering, edge compute  │
│  └── categorize.py  Auto-categorization via Gemini                  │
│                                                                     │
│  ┌────────────────┐                                                 │
│  │ MongoDB Atlas   │  gists collection (text, embeddings, metadata) │
│  │ (Motor async)   │  synapse_cache collection                      │
│  └────────────────┘                                                 │
└──────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Why |
|---|---|
| All `fetch()` in the background worker | Content scripts inherit the host page's CSP, which blocks most API calls. The background worker has no such restriction. |
| Shadow DOM for on-page UI | Guarantees style isolation. The popover looks the same on GitHub, Wikipedia, and a CSS-heavy marketing site. |
| SSE streaming from backend | Users see the first token in ~500ms instead of waiting 2-3 seconds for a full response. Perception of speed matters. |
| Thread-bridged Gemini streaming | The `google-genai` SDK is synchronous. A daemon thread produces chunks into a `queue.Queue`; the async generator consumes them without blocking the event loop. |
| In-process cosine fallback for search | MongoDB Atlas Vector Search requires a paid index. The numpy fallback means semantic search works on any Mongo deployment. |
| PCA + KMeans for Synapse (no external deps) | Keeps the compute pipeline dependency-free beyond numpy. Deterministic via seeded RNG. |

---

## 📁 Project Structure

```
Gist/
├── README.md
├── render.yaml                     ← Render deployment config
├── dev.bat                         ← Local dev launcher (Windows)
│
├── gist-extension/                 ← Chrome Extension
│   ├── public/
│   │   └── manifest.json           ← MV3 manifest (permissions, commands, icons)
│   ├── src/
│   │   ├── background/index.ts     ← Service worker: context menu, shortcuts, fetch relay
│   │   ├── content/
│   │   │   ├── index.ts            ← Selection detection, message routing
│   │   │   ├── shadow-host.ts      ← Shadow DOM mount, React root, state management
│   │   │   ├── observer.ts         ← IntersectionObserver for AutoGist
│   │   │   └── components/
│   │   │       ├── Popover.tsx      ← Main explanation UI (30K+ lines of polish)
│   │   │       ├── AutoGistWidget.tsx
│   │   │       ├── CaptureOverlay.tsx
│   │   │       └── Mermaid.tsx
│   │   ├── popup/
│   │   │   ├── App.tsx             ← Popup + full-page dashboard entry
│   │   │   ├── Dashboard.tsx       ← Sidebar navigation, streak tracking
│   │   │   ├── tokens.ts           ← Design system (oklch color palette)
│   │   │   ├── views/
│   │   │   │   ├── HomeView.tsx    ← Activity heatmap, metrics, insights
│   │   │   │   ├── LibraryView.tsx ← Grid layout, search, filters, split pane
│   │   │   │   ├── SynapseView.tsx ← Interactive knowledge graph canvas
│   │   │   │   ├── RecallView.tsx  ← Flashcard review interface
│   │   │   │   └── SettingsView.tsx
│   │   │   └── components/
│   │   │       ├── GistCard.tsx
│   │   │       └── ToggleSwitch.tsx
│   │   └── utils/
│   │       ├── messages.ts         ← Typed message protocol (shared across contexts)
│   │       ├── rate-limiter.ts
│   │       └── text.ts
│   ├── tests/
│   ├── vite.config.ts              ← Multi-entry build (popup + background)
│   └── vite.content.config.ts      ← Separate content script build
│
└── gist-backend/                   ← FastAPI Backend
    ├── app/
    │   ├── main.py                 ← App factory, middleware, CORS, routers
    │   ├── db.py                   ← Motor async connection manager
    │   ├── limiter.py              ← SlowAPI rate limiter
    │   ├── routes/
    │   │   ├── simplify.py         ← POST /api/v1/simplify (SSE streaming)
    │   │   ├── library.py          ← CRUD + auto-categorize + embed on save
    │   │   ├── search.py           ← Semantic RAG search (Atlas + numpy fallback)
    │   │   ├── autogist.py         ← Ambient viewport summarizer
    │   │   ├── nested.py           ← Progressive disclosure definitions
    │   │   ├── visualize.py        ← Mermaid diagram generation + SVG render
    │   │   ├── synapse.py          ← Knowledge graph pipeline + cache
    │   │   └── recall.py           ← Flashcard CRUD (auto-generate, custom, delete)
    │   ├── services/
    │   │   ├── gemini.py           ← Prompt builder, streaming, embeddings, tags, recall
    │   │   ├── synapse.py          ← PCA, KMeans, edge computation (pure numpy)
    │   │   └── categorize.py       ← Auto-categorization service
    │   └── models/
    │       └── schemas.py          ← Pydantic request/response models
    ├── tests/
    └── requirements.txt
```

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 18+ | Extension build |
| Python | 3.11+ | Backend runtime |
| Google Gemini API Key | — | [Get one free](https://aistudio.google.com/app/apikey) |
| MongoDB Atlas (optional) | — | [Free tier](https://www.mongodb.com/atlas) — required for Library/Synapse/Recall |

### 1. Clone the repository

```bash
git clone https://github.com/parthiv-2006/Gist.git
cd Gist
```

### 2. Start the backend

```bash
cd gist-backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS / Linux
pip install -r requirements.txt

cp .env.example .env
# Edit .env → add your GEMINI_API_KEY (and optionally MONGODB_URI)

uvicorn app.main:app --reload --port 8000
```

The health check should respond at [http://localhost:8000/health](http://localhost:8000/health).

> **Tip:** Set `MOCK_LLM=true` in your `.env` to run without consuming any Gemini quota — all responses are instant and deterministic.

### 3. Build the extension

```bash
cd gist-extension
npm install
npm run build
```

### 4. Load in Chrome

1. Navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked** → select the `gist-extension/dist/` folder
4. The Gist icon appears in your toolbar — you're ready to go

### 5. Try it out

1. Highlight any text on a webpage
2. Press **Ctrl+Shift+E** (or right-click → *"Gist this"*)
3. Watch the streaming explanation appear in a floating popover
4. Click ☆ to save it to your library

---

## ⚙️ Environment Variables

### Backend (`gist-backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `MONGODB_URI` | No | MongoDB connection string. Without it, the app runs fine but Library features are disabled. |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins. Defaults to `*` for local dev. In production, set to `chrome-extension://YOUR_ID`. |
| `MOCK_LLM` | No | Set to `true` for offline development with deterministic mock responses. |
| `DEBUG` | No | Set to `true` for verbose error tracebacks in logs. |

---

## 🧪 Testing

Both sub-projects follow TDD. All outbound API calls and database handles are fully mocked in tests.

```bash
# Extension — Vitest + Testing Library
cd gist-extension
npm run test              # Single run
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report

# Backend — Pytest + pytest-asyncio
cd gist-backend
pytest                    # Run all tests
pytest -v                 # Verbose
pytest --cov=app --cov-report=term-missing
```

---

## 🌐 Deployment

The backend is configured for **Render** via [`render.yaml`](render.yaml):

- **Runtime:** Python
- **Build:** `pip install -r requirements.lock` (pinned lockfile for reproducible deploys)
- **Start:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Health check:** `GET /health`

Set `GEMINI_API_KEY` and `MONGODB_URI` as secret environment variables in the Render dashboard — they are never committed to git.

The extension auto-detects whether a local backend is running at `localhost:8000`. If not, it falls back to the production Render URL.

---

## 🔒 Security

Security is treated as a first-class concern, not an afterthought:

- **Prompt injection mitigations** — User input is wrapped in XML delimiters (`<selected_text>`, `<page_title>`) with explicit data-boundary instructions. Control characters and bidi overrides are stripped.
- **Input validation** — All endpoints enforce strict character limits via Pydantic validators with custom error codes.
- **Rate limiting** — Server-side per-endpoint limits via SlowAPI (e.g., 20 req/min for search, 30/min for autogist). Client-side sliding-window rate limiter in the background worker.
- **CORS hardening** — `ALLOWED_ORIGINS` should be locked to the extension's `chrome-extension://` origin in production.
- **Security headers** — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security: max-age=63072000`.
- **SVG sanitization** — All Mermaid SVGs pass through DOMPurify before rendering.
- **Message sender validation** — Content scripts verify `chrome.runtime.id` on incoming messages.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Extension | TypeScript (strict), React 19, Vite 8 |
| Extension UI | CSS Modules, oklch color system, Shadow DOM |
| Extension Testing | Vitest 4, Testing Library, jsdom |
| Backend | Python 3.11+, FastAPI, Uvicorn |
| Database | MongoDB Atlas (Motor async driver) |
| AI / LLM | Google Gemini 2.5 Flash |
| Embeddings | Google text-embedding-004 (768 dim) |
| Compute | NumPy (PCA, KMeans, cosine similarity) |
| Diagrams | Mermaid.js (via mermaid.ink rendering service) |
| Deployment | Render |

---

## 📋 API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/simplify` | POST | Stream an explanation for highlighted text or captured image (SSE) |
| `/api/v1/visualize` | POST | Generate a Mermaid concept map + render to SVG |
| `/api/v1/nested-gist` | POST | Progressive disclosure — define a term in context |
| `/autogist` | POST | Extract 3 key takeaways from viewport text |
| `/library` | GET | List saved gists (sorted by creation date) |
| `/library` | POST | Save a gist (auto-categorizes, generates embeddings + tags) |
| `/library/{id}` | DELETE | Delete a saved gist |
| `/library/ask` | POST | Semantic RAG query over saved gists |
| `/library/{id}/recall` | POST | Auto-generate a flashcard for a gist |
| `/library/{id}/recall` | PUT | Save a custom flashcard |
| `/library/{id}/recall` | DELETE | Remove a flashcard |
| `/synapse/graph` | GET | Retrieve cached knowledge graph |
| `/synapse/compute` | POST | Recompute knowledge graph (rate-limited: 1/60s) |
| `/health` | GET | Health check (includes DB connection status) |

---

## 🗺 Roadmap

- [x] Core explain + streaming popover
- [x] Follow-up chat with conversation history
- [x] Multiple explanation modes (Standard, ELI5, Legal, Academic)
- [x] Visual Capture (screenshot → explanation)
- [x] Progressive Disclosure (nested gist drilling)
- [x] Mermaid.js visual analogies
- [x] Gist Library with MongoDB persistence
- [x] Semantic search (RAG) over saved gists
- [x] Auto-categorization + smart tagging
- [x] AutoGist ambient scroll assistant
- [x] Synapse knowledge graph visualization
- [x] Recall spaced repetition flashcards
- [x] Full dashboard with sidebar navigation
- [x] Security hardening (prompt injection, rate limiting, CSP)
- [ ] Export library to JSON / CSV / Markdown
- [ ] Chrome Web Store publication
- [ ] Cross-device sync
- [ ] Browser support expansion (Firefox, Edge)

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Write tests first, then implement (TDD is mandatory for this project)
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`, etc.)
5. Open a pull request against `dev`

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with obsessive attention to detail.**

Gist is a solo-developed project focused on thoughtful engineering —  
from prompt injection mitigations in the backend to oklch color theory in the UI.

</div>
