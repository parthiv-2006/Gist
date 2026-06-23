# Gist

A Chrome extension that streams plain-English explanations of any highlighted text, then builds a searchable, visualizable knowledge base from everything you save.

[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9_Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Gemini](https://img.shields.io/badge/Google_Gemini-2.5_Flash-886FBF?logo=googlegemini&logoColor=white)](https://ai.google.dev/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<div align="center">
  <img src=".github/assets/demo.gif" width="900" alt="Gist demo — highlight text, get an instant explanation, explore your knowledge graph"/>
</div>

---

## What It Is

Gist collapses the "copy → new tab → paste → read → find your place again" loop into a single keystroke. Highlight any text, press `Ctrl+Shift+E`, and a streaming explanation appears directly on the page in under 500ms. Every saved explanation gets embedded as a vector, auto-tagged, and stored — so over time your library becomes queryable with natural language, studyable as flashcards, and visualizable as a semantic knowledge graph.

**Live backend:** https://parthiv-2006-gist-backend.hf.space (Hugging Face Spaces, Docker — always warm)

---

## Onboarding

<table>
<tr>
<td align="center"><img src=".github/assets/screenshots/onboarding-welcome.png" width="260"/><br/><sub>Welcome</sub></td>
<td align="center"><img src=".github/assets/screenshots/onboarding-highlight.png" width="260"/><br/><sub>Highlight & explain</sub></td>
<td align="center"><img src=".github/assets/screenshots/onboarding-autogist.png" width="260"/><br/><sub>AutoGist</sub></td>
<td align="center"><img src=".github/assets/screenshots/onboarding-features.png" width="260"/><br/><sub>Features overview</sub></td>
<td align="center"><img src=".github/assets/screenshots/onboarding-done.png" width="260"/><br/><sub>Ready to go</sub></td>
</tr>
</table>

---

## Features

<table>
<tr>
<td align="center" width="50%"><img src=".github/assets/screenshots/popover-streaming.png" width="440"/><br/><sub><b>Streaming explanation</b> — SSE chunks render word by word inside a Shadow DOM popover at z-index 2147483647, invisible to the host page's CSS</sub></td>
<td align="center" width="50%"><img src=".github/assets/screenshots/popover-done.png" width="440"/><br/><sub><b>Done state</b> — Save to library, open a follow-up chat, or generate a Mermaid concept map</sub></td>
</tr>
<tr>
<td align="center"><img src=".github/assets/screenshots/popover-modes.png" width="440"/><br/><sub><b>Explanation modes</b> — Standard, ELI5, Legal, and Academic each use a distinct system prompt; the active mode persists across sessions</sub></td>
<td align="center"><img src=".github/assets/screenshots/popover-chat.png" width="440"/><br/><sub><b>Follow-up chat</b> — Full conversation history is included in each request; the server enforces a 20,000-character cap</sub></td>
</tr>
<tr>
<td align="center"><img src=".github/assets/screenshots/popover-nested.png" width="440"/><br/><sub><b>Progressive disclosure</b> — Double-click any word to drill into a nested definition; breadcrumbs let you navigate back up to 10 levels</sub></td>
<td align="center"><img src=".github/assets/screenshots/popover-mermaid.png" width="440"/><br/><sub><b>Mermaid diagram</b> — Gemini generates a flowchart; the backend sanitizes and renders it via mermaid.ink, falling back to raw source on failure</sub></td>
</tr>
<tr>
<td align="center"><img src=".github/assets/screenshots/capture-overlay.png" width="440"/><br/><sub><b>Visual capture</b> — <code>Alt+Shift+G</code> opens a drag-to-select overlay; the background worker crops and base64-encodes the PNG as a multimodal input</sub></td>
<td align="center"><img src=".github/assets/screenshots/autogist-widget.png" width="440"/><br/><sub><b>AutoGist</b> — An IntersectionObserver fires on scroll; an 8-second per-tab cooldown in the service worker prevents rapid-fire requests</sub></td>
</tr>
<tr>
<td align="center"><img src=".github/assets/screenshots/library-grid.png" width="440"/><br/><sub><b>Gist Library</b> — Masonry grid of saved explanations with category badges, AI-generated tags, and keyword filtering</sub></td>
<td align="center"><img src=".github/assets/screenshots/library-detail.png" width="440"/><br/><sub><b>Split-pane detail</b> — Source URL, original text, full explanation, recall card status, and a "Chat with this Gist" input</sub></td>
</tr>
<tr>
<td align="center"><img src=".github/assets/screenshots/library-search.png" width="440"/><br/><sub><b>Semantic search</b> — Query is embedded and matched against stored vectors; Gemini synthesizes an answer from the top 5 retrieved notes</sub></td>
<td align="center"><img src=".github/assets/screenshots/synapse-graph.png" width="440"/><br/><sub><b>Synapse knowledge graph</b> — PCA-projected embeddings on a 1000×1000 canvas, KMeans-clustered, with AI-labeled cluster groups</sub></td>
</tr>
<tr>
<td align="center"><img src=".github/assets/screenshots/recall-cards.png" width="440"/><br/><sub><b>Recall flashcards</b> — Gemini generates front/back cards for each gist; spaced-repetition scheduling surfaces them for review</sub></td>
<td align="center"><img src=".github/assets/screenshots/settings.png" width="440"/><br/><sub><b>Settings</b> — Personal Gemini API key, dark/light/system theme, and AutoGist toggle</sub></td>
</tr>
</table>

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Extension language | TypeScript 5.9 (strict) |
| Extension UI | React 19, CSS Modules |
| Extension build | Vite 8, two separate configs (content IIFE + popup/background) |
| Extension testing | Vitest 4, Testing Library, jsdom |
| Backend framework | FastAPI 0.110 |
| Database | MongoDB Atlas via Motor 3 |
| AI / LLM | Google Gemini 2.5 Flash |
| Embeddings | gemini-embedding-001 (3072 dims) |
| Compute | NumPy 1.26 (PCA via SVD, KMeans via Lloyd's, cosine similarity) |
| Diagrams | mermaid.ink (server-side SVG render) |
| Rate limiting | SlowAPI 0.1.9 |

---

## Architecture

```
Chrome Extension (MV3)                      FastAPI Backend
TypeScript · React 19 · Vite 8              Python 3.11 · Uvicorn · Motor · SlowAPI

  Content Script                              POST /api/v1/simplify    SSE stream
    Text selection detection                  POST /api/v1/visualize   SVG
    IntersectionObserver (AutoGist)           POST /api/v1/nested-gist
    Shadow DOM popover (z: 2147483647)        POST /autogist
          |                                   GET|POST /library
          | chrome.runtime messages           DELETE /library/{id}
          v                                   POST /library/ask        RAG
  Background Service Worker                   POST|PUT|DELETE /library/{id}/recall
    All fetch() calls                         GET /synapse/graph
    SSE stream relay                          POST /synapse/compute
    resolveBase(): localhost or Render                 |
    Save with primary/fallback retry                   |
          |                                   MongoDB Atlas
          +-- HTTPS ----------------------->  gists collection
                                                embedding: float[3072]
                                                recall_card: nested doc
                                              synapse_cache collection
                                                graph: nodes + edges + clusters
```

The background service worker owns all network I/O because content scripts inherit the host page's Content Security Policy, which blocks cross-origin requests. Routing all `fetch()` calls through the service worker sidesteps this using only four manifest permissions (`contextMenus`, `scripting`, `activeTab`, `storage`).

The Gemini streaming path bridges two incompatible concurrency models: the `google-genai` SDK exposes a synchronous iterator; FastAPI's SSE route is an `async` generator. A daemon thread pushes each chunk into a `queue.Queue` and the async generator pulls from it via `loop.run_in_executor()`, yielding control back to the event loop between chunks.

---

## Getting Started

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 18+ | Extension build |
| Python | 3.11+ | Backend runtime |
| Google Gemini API key | — | Free at [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| MongoDB Atlas | Free tier | Optional — disables Library, Synapse, and Recall without it |

### Installation

```bash
# 1. Clone
git clone https://github.com/parthiv-2006/Gist.git
cd Gist

# 2. Backend
cd gist-backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS / Linux
pip install -r requirements.txt

cp .env.example .env
# Edit .env: set GEMINI_API_KEY (and optionally MONGODB_URI)

uvicorn app.main:app --reload --port 8000

# 3. Extension (separate terminal)
cd gist-extension
npm install
npm run build
```

In Chrome: navigate to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `gist-extension/dist/`.

### Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `MONGODB_URI` | No | MongoDB connection string; Library, Synapse, and Recall are disabled without it |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins; defaults to `*` |
| `MOCK_LLM` | No | `true` for offline development with deterministic mock responses |
| `DEBUG` | No | `true` for verbose error tracebacks |

### Running Locally

```bash
# Backend
cd gist-backend && uvicorn app.main:app --reload --port 8000

# Extension (rebuild on file save)
cd gist-extension && npm run dev
```

Health check: `GET http://localhost:8000/health` → `{"status": "ok", "db": {"connected": true}}`

---

## Testing

```bash
# Backend
cd gist-backend
pytest -v
pytest --cov=app --cov-report=term-missing

# Extension
cd gist-extension
npm run test
npm run test:coverage
```

The backend has 12 pytest test files covering all routes and services. All Gemini API calls and MongoDB handles are mocked. Set `MOCK_LLM=true` to run the full SSE path locally without consuming Gemini quota.

---

## Known Limitations

- **Chrome/Chromium only.** Firefox support requires a `browser` namespace shim and validation against Firefox's stricter content script CSP defaults.
- **Render free-tier cold starts.** First request after 15 minutes of inactivity can take 20–30 seconds.
- **Synapse requires at least 4 embedded gists.** The KMeans minimum cluster count is 4. Gists saved before the embedding feature was added need a manual `POST /library/backfill`.
- **Atlas Vector Search requires a paid cluster.** The numpy cosine fallback works on free-tier Atlas but loads up to 500 documents into memory per query.
- **No image compression before upload.** Visual Capture sends the full viewport PNG as base64 (typically 2–4 MB at 1440×900).

---

## Project Structure

```
Gist/
├── gist-backend/
│   └── app/
│       ├── main.py                      App factory, CORS, security headers
│       ├── routes/
│       │   ├── simplify.py              POST /api/v1/simplify — SSE with first-chunk error probe
│       │   ├── library.py               CRUD + concurrent embed/tag on save
│       │   ├── search.py                RAG: Atlas $vectorSearch with numpy cosine fallback
│       │   ├── synapse.py               Graph pipeline (PCA, KMeans, cosine edges)
│       │   ├── recall.py                Flashcard CRUD
│       │   ├── autogist.py              Viewport summarizer
│       │   ├── nested.py                Progressive disclosure definitions
│       │   └── visualize.py             Mermaid generation + mermaid.ink render
│       └── services/
│           ├── gemini.py                Streaming thread bridge, embed, tags, recall cards
│           ├── synapse.py               Pure numpy: PCA, KMeans, cosine edges
│           └── categorize.py            Keyword-hit categorizer (no LLM, no latency)
└── gist-extension/
    ├── public/manifest.json             MV3 manifest (4 permissions, 2 keyboard commands)
    └── src/
        ├── background/index.ts          Service worker: all fetch(), SSE relay, resolveBase()
        ├── content/
        │   ├── shadow-host.ts           Shadow DOM mount and React root
        │   └── components/Popover.tsx   Main explanation UI (all states)
        ├── onboarding/                  5-step onboarding flow
        └── popup/
            ├── Dashboard.tsx            Sidebar navigation
            └── views/                   Home, Library, Synapse, Recall, Settings
```

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

Built by <a href="https://github.com/parthiv-2006">parthiv-2006</a>

</div>
