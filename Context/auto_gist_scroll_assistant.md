# 🚀 Feature: Auto-Gist Scroll Assistant (Ambient Intelligence)

## Overview
We are building the "Auto-Gist Scroll Assistant," moving Gist from a reactive tool to a proactive, ambient intelligence companion. As the user reads long articles or documentation, Gist will observe the viewport and silently generate a beautifully subtle "Ghost UI" overlay containing the 3 key takeaways of the section currently on screen. 

## Core Requirements
1. **Viewport Tracking**: The content script must intelligently track what the user is currently reading without killing browser performance.
2. **Context Extraction**: Extract meaningful text from the current viewport (ignoring navbars, footers, ad blocks).
3. **Ambient UI (Ghost UI)**: A completely unobtrusive, premium "bento box" floating UI that remains mostly transparent until hovered, so it never interrupts the reading experience.
4. **Backend Summary Engine**: A specialized prompt optimized for speed and brevity, generating max 3 short bullet points.

---

## Technical Implementation Plan

### 1. Viewport Observation Layer (`gist-extension/src/content/observer.ts`)
- **Intersection Observer / Scroll Debounce**: Create a new module using `IntersectionObserver` or a throttled scroll listener (debounced to ~1.5s after scrolling stops) to determine the focus area.
- **Content Extraction Logic**:
  - Grab text from tags like `<p>`, `<article>`, `<h1>`-`<h3>`, `<li>` that are currently within the `window.innerHeight`.
  - Filter out UI clutter (nav, header, footer, script tags, elements with less than 20 words).
  - Return a consolidated chunk of text representing the current reading context.

### 2. Message Pipeline (`gist-extension/src/utils/messages.ts` & `background.ts`)
- **New Message Types**: Add `AUTOGIST_REQUEST` and `AUTOGIST_RESPONSE` to your message protocol.
- **Background Relay**: The background worker receives `AUTOGIST_REQUEST` from the content script, calls the new backend endpoint, and returns `AUTOGIST_RESPONSE`.

### 3. Backend Endpoint (`gist-backend/app/routes/autogist.py`)
- **New Route**: `POST /autogist`
- **Data Model**: `{ text_chunk: str, url: str }`
- **Prompt Engineering**: 
  - *"You are an ambient reading assistant. Read the following text snippet currently on the user's screen. Extract exactly 3 ultra-concise key takeaways. Return ONLY a JSON list of 3 strings."*
- **Integration**: Wire this new router into `main.py`. Ensure we use Gemini 1.5 Flash for maximum speed.

### 4. Ambient UI Component (`gist-extension/src/content/components/AutoGistWidget.tsx`)
- **Component**: Create a React component injected via the existing Shadow DOM architecture.
- **Styling (CSS Modules)**:
  - **Ghost State**: Fixed bottom-right corner, `opacity: 0.15` or `0.2`, perhaps just showing a small glowing Gist logo/dot when updating.
  - **Hover / Active State**: Expands gracefully using CSS transitions, `opacity: 1`, `backdrop-filter: blur(12px)`.
  - Use Carbon aesthetic: dark translucent backgrounds (`rgba(20,20,20, 0.8)`), subtle `#10b981` accents. 
- **State Management**: It should hold the 3 bullet points. When the content script yields new text, trigger a fade-in/fade-out animation with the new points.

---

## Context Files to Modify

- **`gist-extension/src/utils/messages.ts`**: Update the strict TypeScript message schema.
- **`gist-extension/src/background/index.ts`**: Handle the new `AUTOGIST_REQUEST` fetch logic.
- **`gist-backend/app/main.py`**: Add the new router.
- **`gist-backend/app/routes/autogist.py`**: [NEW FILE] Handle the LLM summarization specifically for scroll view.
- **`gist-extension/src/content/index.tsx`**: Mount the new ambient UI widget alongside your existing popover.

## Execution Guardrails & Critical Considerations
1. **Performance is King**: If the DOM extraction triggers on every scroll pixel, it will crash the browser. You MUST debounce/throttle the extraction heavily. Only trigger a backend call when the user "settles" on a section of text for >2 seconds.
2. **Context Window Limitations**: Do not send the entire webpage. Send ONLY the text visible in the current viewport + maybe a small buffer above/below. Cap the payload size to prevent huge request payloads.
3. **Ghost UI Rule**: The UI must be non-intrusive. If it blocks the text the user is trying to read, it fails its purpose. It must hug the corner and fade into the background when not hovered.
4. **Rate Limiting / Cost**: To prevent massive LLM API spam while a user idly scrolls, implement a check limiting the background script to a maximum of 1 auto-gist request every `X` seconds (e.g., 5-10 seconds) per tab.

**Action for Claude Code**: 
Begin by implementing the `IntersectionObserver`/Scroll Debounce logic in the content script to accurately pull viewport text. Then create the widget UI before wiring it up to the backend.
