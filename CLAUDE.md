# Gist — Claude Code Project Context

> **Read this file first.** This is the single source of truth for project conventions, commands,
> and constraints. Refer to it at the start of every session. Never contradict it.

## Context Gathering Rule
Before reading files, using grep, or exploring directories, you must ALWAYS use `qmd` to search for context in local projects.

Available tools:
- `qmd search "query"` — Fast keyword search (BM25)
- `qmd query "query"` — Hybrid search with LLM reranking (Best for complex questions)
- `qmd vsearch "query"` — Semantic vector search
- `qmd get <file>` — Retrieve a specific document

Use `qmd query` for understanding architecture, bugs, or logic across the gist-backend and gist-extension. Use `qmd search` for quick exact-match lookups. 
Only use your default Read/Glob/Grep tools if `qmd` fails to return relevant results.
---

## What Is Gist?

A Manifest V3 Chrome Extension that lets users highlight any text on a webpage and instantly
receive a plain-language AI explanation in a floating popover — without leaving the page.
Backend is a Python/FastAPI service that proxies calls to Google Gemini and streams the response
via SSE back to the extension.

26: **Current Status:** Phase 5 complete (Library & MongoDB). All core features deployed and committed.
27: 
28: ---
29: 
30: ## Repository Structure
31: 
32: ```
33: Gist/                          ← repo root (you are here)
34: ├── CLAUDE.md                  ← this file
35: ├── render.yaml                ← Render deployment config (backend)
36: ├── Context/
37: │   ├── functional-requirements.md   ← FULL PRD — read before starting any phase
38: │   └── skills/                      ← Skill reference files (read before implementing)
39: │       ├── project-bootstrap.md     ← Exact CLI commands to scaffold both sub-projects
40: │       ├── tdd-vitest-chrome-mocks.md
41: │       ├── tdd-pytest-fastapi.md
42: │       ├── fastapi-sse-streaming.md
43: │       ├── chrome-extension-mv3.md
44: │       ├── shadow-dom-react-injection.md
45: │       ├── vite-multi-entry-build.md
46: │       ├── popover-design.md        ← Visual spec: colors, fonts, spacing (read before Phase 3 UI)
47: │       ├── explanation-modes.md     ← Prompt engineering spec for ELI5, Legal, Academic (read before Phase 5)
48: │       └── gist-patterns.md
49: ├── gist-extension/            ← Chrome Extension (TypeScript + React + Vite)
50: └── gist-backend/              ← FastAPI backend (Python 3.11+)
51: ```
52: 
53: ---
54: 
55: ## Key Commands
56: 
57: ### Extension (`gist-extension/`)
58: 
59: ```bash
60: npm install          # Install all dependencies
61: npm run build        # Vite multi-entry build → dist/ folder (load this in chrome://extensions)
62: npm run test         # Run Vitest unit + integration tests once
63: npm run test:watch   # Re-run on file save
64: ```
65: 
66: ### Backend (`gist-backend/`)
67: 
68: ```bash
69: # First time setup
70: python -m venv venv
71: venv\Scripts\activate          # Windows
72: pip install -r requirements.txt
73: 
74: # Run dev server
75: uvicorn app.main:app --reload --port 8000
76: 
77: # Run tests
78: pytest
79: pytest -v
80: ```
81: 
82: ---
83: 
84: ## Technology Stack (Non-Negotiable)
85: 
86: | Layer | Technology | Notes |
87: |---|---|---|
88: | Extension language | TypeScript | Strict mode required |
89: | Extension UI | React + CSS Modules | Tabbed layout: Capture vs Library |
90: | Extension build | Vite (multi-entry) | See `skills/vite-multi-entry-build.md` |
91: | Backend framework | FastAPI | Uses async lifespan (DB connect/disconnect) |
92: | Database | MongoDB (Motor) | Stores gists for Library view |
93: | LLM | Google Gemini (`gemini-1.5-flash`) | Via `google-genai` SDK (v1.x) |
94: | Hosting | Render (free tier) | Config in `render.yaml` |
95: 
96: ---
97: 
98: ## Data Models & Persistence
99: 
100: ### MongoDB Gists Collection
101: 
102: - **DB Name**: `gist`
103: - **Collection**: `gists`
104: - **Index**: `created_at` (descending)
105: 
106: ```json
107: {
108:   "original_text": "...",
109:   "explanation": "...",
110:   "mode": "standard | eli5 | legal | academic",
111:   "url": "...",
112:   "category": "Code | Legal | Medical | Finance | Science | General",
113:   "created_at": "ISODate"
114: }
115: ```
116: 
117: ### Environment Variables
118: 
119: - `MONGODB_URI`: (Required for Library) MongoDB connection string.
120: - `GEMINI_API_KEY`: (Required) API key for Google Gemini.
121: 
122: ---
123: 
124: ## Hard Constraints — Never Violate These
125: 
126: 1. **No Tailwind CSS.** Use CSS Modules with CSS custom properties.
127: 2. **All extension UI must be inside Shadow DOM.** No direct DOM injection.
128: 3. **All `fetch()` calls must live in the background service worker.** Never in the content script.
129: 4. **Never call the real Gemini API or MongoDB in tests.** Mock ALL outbound traffic and DB handles.
130: 5. **Chrome/Chromium only.** No Firefox or Safari compatibility shims in MVP.
131: 6. **The LLM model string is always `gemini-1.5-flash`.** No other model names. The model is defined as `GEMINI_MODEL` in `app/services/gemini.py` — change it there only.
132: 7. **TDD is mandatory.** Write tests before implementation.
133: 
134: ---
135: 
136: ## Inter-Script Message Protocol
137: 
138: All messages between content script and background worker use the schema defined in `src/utils/messages.ts`.
139: 
140: **Message flow:**
141: - Content Script → Background Worker: `chrome.runtime.sendMessage(message)`
142: - Background Worker → Content Script: `chrome.tabs.sendMessage(tabId, message)`
143: 
144: ---
145: 
146: ## Phase Tracker
147: 
148: | Phase | Description | Status |
149: |---|---|---|
150: | 0 | Documentation & planning | ✅ Done |
151: | 1 | Extension Skeleton & Infrastructure | ✅ Done |
152: | 2 | Backend API & LLM Engine | ✅ Done |
153: | 3 | Integration & Popover UI | ✅ Done |
154: | 4 | Polish, Edge Cases & Customization | ✅ Done |
155: | 5 | Gist Library & MongoDB Persistence | ✅ Done |
156: | 6 | Advanced Analytics & Export | ⏳ Not started |
157: 
158: ---
159: 
160: ## Before You Write Any Code
161: 
162: 1. Read `@Context/functional-requirements.md` § matching the current phase.
163: 2. Read the skill files relevant to that phase.
164: 3. Write tests first (Red).
165: 4. Implement until tests pass (Green).


---

## After You Write Any Code

After completing any code changes, always commit and push to the GitHub repository, do this in smaller batched commits rather than one large commit:
1. Stage only the relevant source files (never `__pycache__`, `.pyc`, or generated build artifacts).
2. Write a conventional commit message (`fix:`, `feat:`, `refactor:`, etc.).
3. Push to `origin main`.
