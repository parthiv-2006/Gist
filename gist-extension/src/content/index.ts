import { buildGistRequest, isGistMessage, type GistMessage } from "../utils/messages";
import { extractSelectedText, validateText } from "../utils/text";
import { mountPopover, updatePopover, setHandlers, mountCaptureOverlay, toggleSidebar, setWidgetLoading, updateWidget, setWidgetIdle, setWidgetEnabled, updateSaveResult, showLensDefinition, drillIntoGist, jumpToDrillingLevel, getDrillingStack, updateDiagram } from "./shadow-host";
import { highlightTerms, removeLensHighlights, LENS_CLASS } from "../utils/dom-walker";
import { startObserver } from "./observer";
import { RateLimiter } from "../utils/rate-limiter";

const rateLimiter = new RateLimiter(5, 10_000);

// Remembered so mode-change re-triggers work even after selection is cleared
let lastGistedText = "";

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
    if (area !== "local") return;
    if (changes["autoGistEnabled"]) {
      if (changes["autoGistEnabled"].newValue === true) {
        startAutoGist();
      } else {
        stopAutoGist();
      }
    }
    if (changes["lensEnabled"]) {
      if (changes["lensEnabled"].newValue === true) {
        startLensMode();
      } else {
        stopLensMode();
      }
    }
  });

  // ── Gist Lens mode ────────────────────────────────────────────────────────
  let lensActive = false;
  let lensIdleCallbackId: ReturnType<typeof requestIdleCallback> | null = null;
  let lensUrlPollInterval: ReturnType<typeof setInterval> | null = null;
  let lensRescanTimer: ReturnType<typeof setTimeout> | null = null;
  let lensLastUrl = location.href;

  function injectLensStyles(): void {
    if (document.getElementById("gist-lens-styles")) return;
    const style = document.createElement("style");
    style.id = "gist-lens-styles";
    style.textContent = [
      `span.${LENS_CLASS} {`,
      "  border-bottom: 1.5px dashed rgba(16,185,129,0.55);",
      "  cursor: pointer;",
      "  border-radius: 1px;",
      "  transition: background-color 120ms ease, border-color 120ms ease;",
      "}",
      `span.${LENS_CLASS}:hover {`,
      "  background-color: rgba(16,185,129,0.10);",
      "  border-bottom-color: rgba(16,185,129,0.9);",
      "}",
    ].join("\n");
    document.head.appendChild(style);
  }

  function getLensRoot(): Element {
    return (
      document.querySelector("article") ??
      document.querySelector("main") ??
      document.body
    );
  }

  function scanPageForTerms(): void {
    if (!lensActive) return; // Guard: idle callback may fire after stopLensMode()
    const root = getLensRoot();
    // Send a single chunk — 3 parallel requests hammer the API quota
    const fullText = (root as HTMLElement).innerText?.slice(0, 600) ?? "";
    if (!fullText.trim()) return;

    chrome.runtime.sendMessage({
      type: "LENS_SCAN_REQUEST",
      payload: { textChunk: fullText, pageContext: document.title },
    });
  }

  function scheduleLensScan(delayMs = 0): void {
    if (lensIdleCallbackId !== null) { cancelIdleCallback(lensIdleCallbackId); lensIdleCallbackId = null; }
    if (delayMs > 0) {
      if (lensRescanTimer !== null) clearTimeout(lensRescanTimer);
      lensRescanTimer = setTimeout(() => {
        if (lensActive) lensIdleCallbackId = requestIdleCallback(() => scanPageForTerms(), { timeout: 5000 });
      }, delayMs);
    } else {
      if (lensActive) lensIdleCallbackId = requestIdleCallback(() => scanPageForTerms(), { timeout: 5000 });
    }
  }

  function startLensMode(): void {
    if (lensActive) return;
    lensActive = true;
    lensLastUrl = location.href;
    injectLensStyles();
    scheduleLensScan();

    // Poll for URL changes every 800 ms to catch SPA navigation (pushState / replaceState / hash changes)
    lensUrlPollInterval = setInterval(() => {
      if (location.href !== lensLastUrl) {
        lensLastUrl = location.href;
        removeLensHighlights(document.body);
        // Wait 1.5 s for the SPA to finish rendering new content before rescanning
        scheduleLensScan(1500);
      }
    }, 800);
  }

  function stopLensMode(): void {
    if (!lensActive) return;
    lensActive = false;
    if (lensIdleCallbackId !== null) { cancelIdleCallback(lensIdleCallbackId); lensIdleCallbackId = null; }
    if (lensRescanTimer !== null) { clearTimeout(lensRescanTimer); lensRescanTimer = null; }
    if (lensUrlPollInterval !== null) { clearInterval(lensUrlPollInterval); lensUrlPollInterval = null; }
    removeLensHighlights(document.body);
    document.getElementById("gist-lens-styles")?.remove();
  }

  // Delegated click handler for highlighted Lens terms (capture phase so it
  // intercepts before any host-page listeners and before the popover's own handler).
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains(LENS_CLASS)) return;
      e.preventDefault();
      e.stopPropagation();
      const term = target.dataset["term"] ?? "";
      const def  = target.dataset["def"]  ?? "";
      const rect = target.getBoundingClientRect();
      showLensDefinition(term, def, rect);
    },
    true
  );

  // Read initial lens storage state
  chrome.storage.local.get(["lensEnabled"], (result) => {
    if (result["lensEnabled"] === true) {
      startLensMode();
    }
  });

  setHandlers(
    (mode) => {
      // Use the stored text — selection is typically cleared by the time user switches modes
      const selection = window.getSelection();
      const text = extractSelectedText(selection) || lastGistedText;
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

      case "SAVE_GIST_RESULT": {
        updateSaveResult(msg.payload.success ?? false);
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

      case "LENS_SCAN_RESPONSE": {
        const terms = msg.payload.terms ?? [];
        if (terms.length > 0) {
          const root = document.querySelector("article") ?? document.querySelector("main") ?? document.body;
          highlightTerms(terms, root);
        }
        break;
      }

      case "NESTED_GIST_RESPONSE": {
        const term = msg.payload.term ?? "";
        const definition = msg.payload.definition ?? "";
        if (term && definition) {
          drillIntoNestedGist(term, definition);
        }
        break;
      }

      case "VISUALIZE_RESPONSE": {
        const svg = msg.payload.diagramSvg;
        const source = msg.payload.diagramSource;
        // svg may be undefined when mermaid.ink was unreachable — source always present
        if (svg || source) {
          updateDiagram({ state: "done", svg, source });
        } else {
          updateDiagram({ state: "error" });
        }
        break;
      }

      case "VISUALIZE_ERROR": {
        updateDiagram({ state: "error" });
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
  const pageContext = document.title;
  updatePopover({ state: "LOADING", position: selectionRect ?? undefined, originalText: text, pageContext });

  lastGistedText = text;
  chrome.runtime.sendMessage(buildGistRequest(text, pageContext));
}

function drillIntoNestedGist(term: string, definition: string): void {
  // Push onto drilling stack and show breadcrumbs
  drillIntoGist(term, definition);
}

async function handleCapture(rect: { x: number; y: number; width: number; height: number }): Promise<void> {
  // 1. Loading state for popover
  const fauxRect = new DOMRect(rect.x, rect.y, rect.width, rect.height);
  updatePopover({ state: "LOADING", position: fauxRect, originalText: "[Visual capture]", pageContext: document.title });

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
