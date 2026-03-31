# Gist — Persistent Project Memory

> This file is maintained across Claude Code sessions. Update it when decisions are made,
> questions are answered, or phase status changes. Do NOT re-ask questions already recorded here.

---

## Project Status

- **Current phase:** Phase 2 complete. Ready to begin **Phase 3** (Integration & Popover UI).
- **Code written:** `gist-extension/` complete and loaded as unpacked extension. `gist-backend/` complete (31/31 tests passing, 93% coverage).
- **Backend deployed:** Yes (Render `gist-vc8m.onrender.com`).
- **Extension submitted to Chrome Web Store:** No.

---

## Key Decisions (Do Not Re-Ask)

| Decision | Value | Rationale |
|---|---|---|
| Extension UI framework | React + CSS Modules | Chosen for Shadow DOM compatibility |
| CSS strategy | CSS custom properties, no Tailwind | Host page isolation requirement |
| LLM model | `gemini-1.5-flash` | Large free-tier quota, fast responses |
| LLM Provider | Google Gemini API | via `google-genai` SDK (v1.x, NOT deprecated `google-generativeai`) |
| Gemini SDK | `google-genai` v1.69+ | `google-generativeai` is deprecated; new SDK uses `genai.Client()` + `client.models.generate_content_stream()` |
| Test mocking (Gemini) | `unittest.mock.patch("app.services.gemini.genai")` | SDK uses gRPC (not httpx), so pytest-httpx cannot intercept it |
| httpx test client | `ASGITransport(app=app)` | httpx >= 0.28 dropped `AsyncClient(app=...)` shortcut |
| Hosting | Render (free tier) | Zero-config GitHub deployment. Live at `https://gist-vc8m.onrender.com` |
| Extension manifest | `public/manifest.json` | Vite copies anything in `public/` directly to `dist/` root without transformation |
| Extension folder name | `gist-extension/` | Matches PRD and render.yaml |
| Backend folder name | `gist-backend/` | Matches PRD and render.yaml |
| Popover design style | Dark glassmorphism | Semi-transparent dark panel, Inter font, accent `hsl(265, 89%, 78%)` |
| Monorepo layout | Both sub-projects in repo root | `gist-extension/` and `gist-backend/` |
| Test runner (extension) | Vitest + @testing-library/react | Same config as Vite |
| Test runner (backend) | Pytest + pytest-httpx | pytest-httpx available but Gemini uses gRPC; mock via `unittest.mock` |
| TDD discipline | Red → Green → Refactor | Mandatory for all phases |

---

## Architecture Decisions

- **All `fetch()` calls belong in the background service worker.** The content script never makes network requests directly. This avoids CSP violations on host pages.
- **`chrome.tabs.sendMessage(tabId, message)`** is how the background worker sends chunks back to the content script. `chrome.runtime.sendMessage` is for content script → background only.
- **Shadow DOM is mandatory** for all popover UI. Prevents host page CSS from bleeding into the extension's styles.
- **SSE streaming** is mandatory. The user must see text streaming in within ~500ms of the first token.
- The Gemini model identifier used everywhere is **`gemini-1.5-flash`**. The string `gemini-pro` must not appear in any test mock URL or production code.

---

## Open Questions

None at this time.

---

## Completed Phase Checklist

*(Fill in as phases complete)*

### Phase 1 — Not started
- [ ] All unit tests passing (`npm run test`)
- [ ] Extension loads in Chrome without errors
- [ ] Context menu item "Gist this" is visible
- [ ] `GIST_REQUEST` message logged in background service worker console

### Phase 2 — ✅ Complete
- [x] All pytest tests passing (31/31, 93% coverage)
- [x] Backend deployed to Render (Live at gist-vc8m.onrender.com)
- [x] `/health` endpoint returns `{"status": "ok"}` (confirmed during deployment)
- [x] SSE stream confirmed via `curl` / client logic

### Phase 3 — Not started
- [ ] End-to-end flow works in browser
- [ ] Streaming text visible in popover
- [ ] Popover closes on Escape and click-outside

### Phase 4 — Not started
- [ ] Edge case tests passing
- [ ] Store assets ready (icons, screenshots, description)
- [ ] Chrome Web Store submission complete
