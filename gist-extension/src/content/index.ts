import { buildGistRequest, isGistMessage, type GistMessage } from "../utils/messages";
import { extractSelectedText, validateText } from "../utils/text";
import { mountPopover, updatePopover, setHandlers, mountCaptureOverlay, toggleSidebar, setWidgetLoading, updateWidget, setWidgetIdle, setWidgetEnabled } from "./shadow-host";
import { startObserver } from "./observer";
import { RateLimiter } from "../utils/rate-limiter";

const rateLimiter = new RateLimiter(5, 10_000);

declare global {
  interface Window { __gistMounted?: boolean }
}

// Guard against double-injection
if (!window.__gistMounted) {
  window.__gistMounted = true;

  mountPopover();

  // ── AutoGist observer management ─────────────────────────────────────────
  // Observer only runs when the user has opted in via the popup toggle.
  // The enabled state is persisted in chrome.storage.local.
  let stopObserver: (() => void) | null = null;

  function startAutoGist(): void {
    if (stopObserver) return; // already running
    setWidgetEnabled(true);
    stopObserver = startObserver((text) => {
      setWidgetLoading();
      chrome.runtime.sendMessage({
        type: "AUTOGIST_REQUEST",
        payload: { textChunk: text, url: document.title },
      });
    });
  }

  function stopAutoGist(): void {
    if (stopObserver) {
      stopObserver();
      stopObserver = null;
    }
    setWidgetEnabled(false);
  }

  // Read initial storage value
  chrome.storage.local.get(["autoGistEnabled"], (result) => {
    if (result["autoGistEnabled"] === true) {
      startAutoGist();
    }
  });

  // React to toggle changes from the popup in real time
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes["autoGistEnabled"]) return;
    if (changes["autoGistEnabled"].newValue === true) {
      startAutoGist();
    } else {
      stopAutoGist();
    }
  });

  setHandlers(
    (mode) => {
      // Re-trigger with same text but new mode
      const selection = window.getSelection();
      const text = extractSelectedText(selection);
      if (text) {
        updatePopover({ state: "LOADING", mode });
        chrome.runtime.sendMessage(buildGistRequest(text, document.title, mode));
      }
    },
    (query, history) => {
      // Send the follow-up request to the background worker
      chrome.runtime.sendMessage({
        type: "GIST_FOLLOW_UP",
        payload: {
          selectedText: "",
          pageContext: document.title,
          messages: history,
          query,
        }
      });
    },
    (rect) => {
      handleCapture(rect);
    }
  );

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

      case "GIST_CAPTURE_START": {
        mountCaptureOverlay();
        break;
      }

      case "GIST_SIDEBAR_TOGGLE": {
        toggleSidebar();
        break;
      }

      case "GIST_CHUNK": {
        updatePopover({ state: "STREAMING", chunk: msg.payload.chunk ?? "" });
        break;
      }

      case "GIST_COMPLETE": {
        updatePopover({ state: "DONE" });
        break;
      }

      case "GIST_ERROR": {
        updatePopover({ state: "ERROR", error: msg.payload.error ?? "Something went wrong." });
        break;
      }

      case "AUTOGIST_RESPONSE": {
        const takeaways = msg.payload.takeaways ?? [];
        if (takeaways.length > 0) {
          updateWidget(takeaways);
        } else {
          setWidgetIdle();
        }
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

  const selectionRect = (selection && selection.rangeCount > 0)
    ? selection.getRangeAt(0).getBoundingClientRect()
    : null;
  updatePopover({ state: "LOADING", position: selectionRect ?? undefined });

  const pageContext = document.title;
  chrome.runtime.sendMessage(buildGistRequest(text, pageContext));
}

async function handleCapture(rect: { x: number; y: number; width: number; height: number }): Promise<void> {
  // 1. Loading state for popover
  const fauxRect = new DOMRect(rect.x, rect.y, rect.width, rect.height);
  updatePopover({ state: "LOADING", position: fauxRect });

  try {
    // 2. Request full tab screenshot from background
    const response = await chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE_TAB", payload: {} });
    if (!response || !response.dataUrl) throw new Error("Capture failed");

    // 3. Crop it via canvas
    const img = new Image();
    img.src = response.dataUrl;
    await new Promise((resolve) => (img.onload = resolve));

    const canvas = document.createElement("canvas");
    // Account for device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context failed");

    ctx.drawImage(
      img,
      rect.x * dpr,
      rect.y * dpr,
      rect.width * dpr,
      rect.height * dpr,
      0,
      0,
      rect.width * dpr,
      rect.height * dpr
    );

    const croppedDataUrl = canvas.toDataURL("image/png");

    // 4. Update popover with thumbnail
    updatePopover({ state: "LOADING", imageData: croppedDataUrl });

    // 5. Send to backend
    chrome.runtime.sendMessage(buildGistRequest("", document.title, "standard", croppedDataUrl.split(",")[1]));
  } catch (err) {
    updatePopover({ state: "ERROR", error: "Failed to capture screen area." });
  }
}
