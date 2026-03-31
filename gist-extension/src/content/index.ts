// src/content/index.ts
// Content Script — injected into every page tab.
// Responsibilities:
//  1. Listen for triggers from the background worker (context menu, keyboard shortcut)
//  2. Read window.getSelection() and send GIST_REQUEST to the background worker
//  3. Mount/unmount the React popover in response to GIST_CHUNK / GIST_COMPLETE / GIST_ERROR

import { buildGistRequest, isGistMessage, type GistMessage } from "../utils/messages";
import { extractSelectedText, validateText } from "../utils/text";
import { mountPopover, updatePopover } from "./shadow-host";
import { RateLimiter } from "../utils/rate-limiter";

const rateLimiter = new RateLimiter(5, 10_000);

declare global {
  interface Window { __gistMounted?: boolean }
}

// Guard against double-injection (e.g. when scripting.executeScript is used on a tab
// that already had the content script injected declaratively at document_idle).
if (!window.__gistMounted) {
  window.__gistMounted = true;

  mountPopover();

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (!isGistMessage(message)) return;

    const msg = message as GistMessage;
    console.log("[Gist CS] message received:", msg.type);

    switch (msg.type) {
      case "GIST_CONTEXT_MENU_TRIGGERED":
      case "GIST_SHORTCUT_TRIGGERED": {
        handleTrigger();
        break;
      }

      case "GIST_CHUNK": {
        console.log("[Gist CS] GIST_CHUNK →", (msg.payload.chunk ?? "").slice(0, 30));
        updatePopover({ state: "STREAMING", chunk: msg.payload.chunk ?? "" });
        break;
      }

      case "GIST_COMPLETE": {
        console.log("[Gist CS] GIST_COMPLETE");
        updatePopover({ state: "DONE" });
        break;
      }

      case "GIST_ERROR": {
        console.warn("[Gist CS] GIST_ERROR:", msg.payload.error);
        updatePopover({ state: "ERROR", error: msg.payload.error ?? "Something went wrong." });
        break;
      }
    }
  });
}

function handleTrigger(): void {
  if (!rateLimiter.isAllowed()) {
    updatePopover({
      state: "ERROR",
      error: "Slow down! You're explaining text too fast. Wait a moment and try again.",
    });
    return;
  }

  const selection = window.getSelection();
  const text = extractSelectedText(selection);

  if (!text) return;

  const validation = validateText(text);
  if (validation === "TEXT_TOO_LONG") {
    updatePopover({ state: "ERROR", error: "Selected text is too long (max 2000 characters)." });
    return;
  }
  if (validation === "EMPTY_TEXT") {
    return;
  }

  // Show loading state and get the selection position for popover placement
  const selectionRect = (selection && selection.rangeCount > 0)
    ? selection.getRangeAt(0).getBoundingClientRect()
    : null;
  updatePopover({ state: "LOADING", position: selectionRect ?? undefined });

  // Send the request to the background worker for LLM processing
  const pageContext = document.title;
  chrome.runtime.sendMessage(buildGistRequest(text, pageContext));
}
