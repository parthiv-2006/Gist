---
name: shadow-dom-react-injection
description: >
  How to mount a React application root inside a Shadow DOM that is attached
  to the host page's document.body from a Chrome Extension content script.
  Shadow DOM provides complete style isolation — the host page's CSS cannot
  affect the popover, and the popover's CSS cannot affect the host page.
  Use this skill whenever building any UI that a content script needs to render
  on top of an arbitrary webpage.
---

## Overview

A naive content script that does `document.body.appendChild(popoverElement)` will inherit all of the host page's CSS. On some sites this completely breaks the popover's layout. Shadow DOM creates an **isolated DOM subtree** with its own style scope.

```
document.body
  └── <div id="gist-host">          ← Our anchor element (in the main DOM)
        └── #shadow-root (open)     ← Shadow DOM boundary — styles cannot cross here
              └── <div id="gist-root">
                    └── <Popover />  ← React app lives entirely inside here
```

---

## 1. `src/content/shadow-host.ts` — The Mount Function

```typescript
// src/content/shadow-host.ts
import React from "react";
import { createRoot, Root } from "react-dom/client";
import { Popover, PopoverState } from "./components/Popover";

// CSS for the popover, imported as a raw string.
// IMPORTANT: Use ?inline suffix so Vite gives us the CSS as a string,
// not a <style> tag injection (which would go into the host page's DOM).
import popoverStyles from "./components/Popover.module.css?inline";

let shadowHost: HTMLElement | null = null;
let reactRoot: Root | null = null;
let accumulatedText = "";
let currentState: PopoverState = "IDLE";

/**
 * Creates the Shadow DOM host and mounts the React app inside it.
 * Call this when a Gist request is first triggered.
 * @param selection - The current window.getSelection() object (used to position the popover)
 */
export function mountPopover(selection: Selection | null): void {
  // Unmount any existing popover first (user triggered Gist again)
  unmountPopover();

  // Reset accumulated text
  accumulatedText = "";
  currentState = "LOADING";

  // 1. Create the anchor element and attach it to the page body
  shadowHost = document.createElement("div");
  shadowHost.id = "gist-shadow-host";

  // Position the host near the selection
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    shadowHost.style.cssText = `
      position: fixed;
      top: ${rect.bottom + window.scrollY + 8}px;
      left: ${Math.min(rect.left, window.innerWidth - 340)}px;
      z-index: 2147483647;
      width: 0;
      height: 0;
      overflow: visible;
    `;
  }

  document.body.appendChild(shadowHost);

  // 2. Attach a Shadow DOM to the host element
  const shadowRoot = shadowHost.attachShadow({ mode: "open" });

  // 3. Inject our scoped CSS into the Shadow DOM
  const styleSheet = document.createElement("style");
  styleSheet.textContent = popoverStyles;
  shadowRoot.appendChild(styleSheet);

  // 4. Create the React mount point inside the Shadow DOM
  const reactContainer = document.createElement("div");
  reactContainer.id = "gist-root";
  shadowRoot.appendChild(reactContainer);

  // 5. Mount React into the Shadow DOM container
  reactRoot = createRoot(reactContainer);
  renderPopover();
}

/**
 * Updates the popover's state and re-renders.
 * Call this when chunks arrive, on completion, or on error.
 */
export function updatePopoverState(
  newState: PopoverState,
  data?: string
): void {
  currentState = newState;

  if (newState === "STREAMING" && data) {
    accumulatedText += data; // Append each new chunk
  }

  if (newState === "ERROR") {
    accumulatedText = data ?? "Something went wrong. Please try again.";
  }

  renderPopover();
}

/**
 * Removes the popover from the DOM entirely.
 */
export function unmountPopover(): void {
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }
  if (shadowHost) {
    shadowHost.remove();
    shadowHost = null;
  }
}

function renderPopover(): void {
  if (!reactRoot) return;

  reactRoot.render(
    React.createElement(Popover, {
      state: currentState,
      text: accumulatedText,
      onClose: unmountPopover,
    })
  );
}
```

---

## 2. `src/content/components/Popover.tsx` — The React Component

```typescript
// src/content/components/Popover.tsx
import React, { useEffect } from "react";
// Note: CSS Modules work inside Shadow DOM — just import the styles object
import styles from "./Popover.module.css";

export type PopoverState = "IDLE" | "LOADING" | "STREAMING" | "DONE" | "ERROR";

interface PopoverProps {
  state: PopoverState;
  text: string;
  error?: string;
  onClose: () => void;
}

export function Popover({ state, text, error, onClose }: PopoverProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Attach to the document — NOTE: inside Shadow DOM this still works
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (state === "IDLE") return null;

  return (
    <div
      className={styles.popover}
      role="dialog"
      aria-label="Gist explanation"
      aria-modal="false"
    >
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.logo}>⚡ Gist</span>
        <button
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close Gist explanation"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className={styles.body}>
        {state === "LOADING" && (
          <div data-testid="gist-skeleton" className={styles.skeleton}>
            <div className={styles.skeletonLine} />
            <div className={styles.skeletonLine} style={{ width: "80%" }} />
            <div className={styles.skeletonLine} style={{ width: "60%" }} />
          </div>
        )}

        {(state === "STREAMING" || state === "DONE") && (
          <p className={styles.explanation}>{text}</p>
        )}

        {state === "ERROR" && (
          <div className={styles.errorCard}>
            <span className={styles.errorIcon}>⚠️</span>
            <p>{error ?? "Something went wrong. Try again."}</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 3. `src/content/components/Popover.module.css`

```css
/* Popover.module.css */
/* All rules are scoped inside the Shadow DOM — they CANNOT leak out */

:host {
  all: initial; /* Reset everything inherited from the host page */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.popover {
  position: relative;
  width: 320px;
  background: #18181b;
  border: 1px solid #3f3f46;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  color: #e4e4e7;
  font-size: 14px;
  line-height: 1.6;
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #3f3f46;
}

.logo {
  font-size: 13px;
  font-weight: 600;
  color: #a78bfa;
  letter-spacing: 0.04em;
}

.closeButton {
  background: none;
  border: none;
  cursor: pointer;
  color: #71717a;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.15s, color 0.15s;
}

.closeButton:hover {
  background: #3f3f46;
  color: #e4e4e7;
}

.body {
  padding: 14px;
}

.explanation {
  margin: 0;
  color: #d4d4d8;
}

/* Skeleton shimmer animation */
.skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeletonLine {
  height: 14px;
  background: linear-gradient(
    90deg,
    #3f3f46 25%,
    #52525b 50%,
    #3f3f46 75%
  );
  background-size: 200% 100%;
  border-radius: 4px;
  animation: shimmer 1.5s infinite;
  width: 100%;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Error state */
.errorCard {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: #fca5a5;
}

.errorCard p {
  margin: 0;
  font-size: 13px;
}
```

---

## 4. Critical: CSS Import in Production Builds

When Vite processes `import styles from "./Popover.module.css?inline"`, it returns the CSS as a plain string. You can then inject it into the Shadow DOM with:

```typescript
const styleSheet = document.createElement("style");
styleSheet.textContent = styles; // The raw CSS string
shadowRoot.appendChild(styleSheet);
```

**Do NOT** use standard CSS Module imports (`import styles from "./X.css"`) in the content script — Vite will try to inject a `<style>` tag into the host page's `<head>`, bypassing the Shadow DOM entirely.

---

## 5. Common Pitfalls

| Pitfall | Fix |
|---|---|
| React renders but has no styles | Ensure CSS is injected into `shadowRoot`, not `document.head` |
| `window.getSelection()` returns null after context menu click | Read the selection BEFORE the context menu closes. Store it as a variable in the content script scope at mouse-down time. |
| Popover appears under other page elements | Use `z-index: 2147483647` (the maximum CSS z-index value) on the host `div` |
| Popover clips at viewport edges | Clamp the `left` position: `Math.min(rect.left, window.innerWidth - popoverWidth - 16)` |
| `document.addEventListener` for `keydown` not firing inside Shadow DOM | Shadow DOM does not block keyboard events on `document`. The listener works correctly. |
