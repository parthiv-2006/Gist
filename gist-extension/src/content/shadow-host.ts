// src/content/shadow-host.ts
// Mounts the React Popover into an isolated Shadow DOM attached to document.body.
// This prevents host-page CSS from bleeding into the extension UI.

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { Popover, type PopoverState } from "./components/Popover";
import { CaptureOverlay } from "./components/CaptureOverlay";
import { AutoGistWidget, type WidgetState } from "./components/AutoGistWidget";
import type { ComplexityLevel, ChatMessage } from "../utils/messages";
import popoverStyles from "./components/Popover.module.css?inline";
import overlayStyles from "./components/CaptureOverlay.module.css?inline";
import widgetStyles from "./components/AutoGistWidget.module.css?inline";

let shadowHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let reactRoot: Root | null = null;

// ── AutoGist widget (separate React root) ────────────────────────────────────
let widgetReactRoot: Root | null = null;
let widgetState: WidgetState = "idle";
let widgetTakeaways: string[] = [];
let widgetDismissed = false;
let widgetEnabled = false; // off by default — user must opt in via popup toggle

// Internal accumulated text (builds up as STREAMING chunks arrive)
let accumulatedText = "";
let messages: ChatMessage[] = [];
let currentMode: ComplexityLevel = "standard";
let currentPosition: DOMRect | undefined = undefined;
let currentImageData: string | undefined = undefined;
let currentOriginalText = "";
let currentPageContext = "";
let isSidebarMode = false;
let isVisible = false;
let lastState: PopoverState = "IDLE";
let saveStatus: "unsaved" | "saving" | "saved" | "error" = "unsaved";

let currentErrorCode: string | undefined = undefined;

// Visualize (Mermaid diagram) state
let diagramSvg: string | undefined = undefined;
let diagramSource: string | undefined = undefined;
let diagramState: "idle" | "loading" | "done" | "error" = "idle";

// Progressive Disclosure: drilling stack for nested gists (breadcrumb trail)
interface DrillLevel {
  term: string;
  definition: string;
  level: number;
}
let drillingStack: DrillLevel[] = [];
const MAX_DRILLING_DEPTH = 10;

// Callbacks set by content/index.ts
let modeChangeCallback: ((mode: ComplexityLevel) => void) | null = null;
let sendMessageCallback: ((query: string, history: ChatMessage[]) => void) | null = null;
let captureFinalizedCallback: ((rect: { x: number; y: number; width: number; height: number }) => void) | null = null;

export function setHandlers(
  onModeChange: (mode: ComplexityLevel) => void,
  onSendMessage: (query: string, history: ChatMessage[]) => void,
  onCaptureFinalized: (rect: { x: number; y: number; width: number; height: number }) => void
): void {
  modeChangeCallback = onModeChange;
  sendMessageCallback = onSendMessage;
  captureFinalizedCallback = onCaptureFinalized;
}

export interface PopoverUpdate {
  state: PopoverState;
  chunk?: string;
  error?: string;
  errorCode?: string;
  position?: DOMRect;
  mode?: ComplexityLevel;
  imageData?: string;
  originalText?: string;
  pageContext?: string;
}

export function mountPopover(): void {
  if (shadowHost) return;

  // Wait for document.body if it's not ready
  if (!document.body) {
    window.addEventListener("DOMContentLoaded", () => mountPopover());
    return;
  }

  shadowHost = document.createElement("div");
  shadowHost.id = "gist-shadow-host";
  // Cover full screen but allow click-through so we don't break the page
  shadowHost.style.cssText = `
    all: initial;
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 2147483647;
    pointer-events: none;
    display: block;
  `;
  document.body.appendChild(shadowHost);

  shadowRoot = shadowHost.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; display: block; contain: content; }
    * { box-sizing: border-box !important; }
    #gist-mount { width: 100%; height: 100%; pointer-events: none; display: flex; align-items: flex-start; justify-content: flex-end; }
    #gist-widget-mount { position: fixed; bottom: 0; right: 0; pointer-events: none; z-index: 2147483646; }
  ` + popoverStyles + "\n" + overlayStyles + "\n" + widgetStyles;
  shadowRoot.appendChild(style);

  const mountPoint = document.createElement("div");
  mountPoint.id = "gist-mount";
  shadowRoot.appendChild(mountPoint);

  const widgetMountPoint = document.createElement("div");
  widgetMountPoint.id = "gist-widget-mount";
  shadowRoot.appendChild(widgetMountPoint);

  reactRoot = createRoot(mountPoint);
  widgetReactRoot = createRoot(widgetMountPoint);
  renderPopover({ state: "IDLE" });
  renderWidget();
}

export function mountCaptureOverlay(): void {
  console.log("[Gist ShadowHost] mountCaptureOverlay called");
  if (!shadowHost) mountPopover();
  if (!reactRoot) {
    console.error("[Gist ShadowHost] reactRoot not initialized");
    return;
  }

  reactRoot.render(
    React.createElement(CaptureOverlay, {
      onCapture: (rect) => {
        if (captureFinalizedCallback) captureFinalizedCallback(rect);
      },
      onCancel: () => {
        renderPopover({ state: "IDLE" });
      },
    })
  );
}

export function updatePopover(update: PopoverUpdate): void {
  if (!reactRoot) return;

  if (update.state === "LOADING") {
    // If it's a fresh Gist (not a follow-up), clear history and reset diagram
    if (!update.chunk) {
      messages = [];
      accumulatedText = "";
      currentImageData = update.imageData;
      if (update.originalText !== undefined) currentOriginalText = update.originalText;
      if (update.pageContext !== undefined) currentPageContext = update.pageContext;
      saveStatus = "unsaved";
      diagramSvg = undefined;
      diagramSource = undefined;
      diagramState = "idle";
      currentErrorCode = undefined;
    }
    if (update.mode) currentMode = update.mode;
    if (update.position) currentPosition = update.position;

    isVisible = true;
    renderPopover({ state: "LOADING" });
    return;
  }

  if (update.state === "STREAMING") {
    accumulatedText += update.chunk ?? "";
    renderPopover({ state: "STREAMING", text: accumulatedText });
    return;
  }

  if (update.state === "DONE") {
    // Commit the accumulated text to history
    if (accumulatedText) {
      messages.push({ role: "model", content: accumulatedText });
      accumulatedText = "";
    }
    renderPopover({ state: "DONE" });
    return;
  }

  if (update.state === "ERROR") {
    currentErrorCode = update.errorCode;
    renderPopover({ state: "ERROR", error: update.error, errorCode: update.errorCode });
    return;
  }

  renderPopover({ state: "IDLE" });
}

/**
 * Drill into a nested gist (progressive disclosure).
 * Pushes the term onto the drilling stack and shows breadcrumbs.
 */
export function drillIntoGist(term: string, definition: string): void {
  if (!reactRoot) return;

  // Cap drilling depth to prevent infinite loops
  if (drillingStack.length >= MAX_DRILLING_DEPTH) return;

  const level: DrillLevel = {
    term,
    definition,
    level: drillingStack.length + 1,
  };
  drillingStack.push(level);

  accumulatedText = "";
  messages = [{ role: "model", content: definition }];
  currentOriginalText = term;
  saveStatus = "unsaved";
  isVisible = true;
  renderPopover({ state: "DONE" });
}

/**
 * Jump back to a specific drilling level via breadcrumb click.
 */
export function jumpToDrillingLevel(levelIndex: number): void {
  if (levelIndex < 0 || levelIndex >= drillingStack.length) return;

  const level = drillingStack[levelIndex];
  accumulatedText = "";
  messages = [{ role: "model", content: level.definition }];
  currentOriginalText = level.term;
  drillingStack = drillingStack.slice(0, levelIndex + 1);
  saveStatus = "unsaved";
  renderPopover({ state: "DONE" });
}

/**
 * Clear the drilling stack (return to root explanation).
 */
export function clearDrillingStack(): void {
  drillingStack = [];
  messages = [];
  accumulatedText = "";
  currentOriginalText = "";
  saveStatus = "unsaved";
  renderPopover({ state: "IDLE" });
}

export function getDrillingStack(): DrillLevel[] {
  return drillingStack;
}

export function unmountPopover(): void {
  if (reactRoot) {
    accumulatedText = "";
    messages = [];
    currentMode = "standard";
    currentImageData = undefined;

    // Force reset sidebar mode if it was active
    if (isSidebarMode && shadowHost) {
      shadowHost.style.pointerEvents = "none";
      shadowHost.style.width = "100vw";
      shadowHost.style.left = "0";
      shadowHost.style.right = "auto";
    }
    isSidebarMode = false;
    isVisible = false;

    renderPopover({ state: "IDLE" });
  }
}

export function toggleSidebar(): void {
  isSidebarMode = !isSidebarMode;
  if (!shadowHost) mountPopover();

  if (shadowHost) {
    if (isSidebarMode) {
      isVisible = true;
      shadowHost.style.pointerEvents = "auto";
      shadowHost.style.width = "400px";
      shadowHost.style.left = "auto";
      shadowHost.style.right = "0";
    } else {
      shadowHost.style.pointerEvents = "none";
      shadowHost.style.width = "100vw";
      shadowHost.style.left = "0";
      shadowHost.style.right = "auto";

      if (!currentPosition) {
        currentPosition = new DOMRect(window.innerWidth / 2 - 200, window.innerHeight / 2 - 150, 400, 300);
      }
    }
  }
  renderPopover({ state: lastState });
}

export function updateSaveResult(success: boolean): void {
  saveStatus = success ? "saved" : "error";
  renderPopover({ state: lastState });
}

// Stable references
const stableOnClose = () => unmountPopover();
const stableOnSendMessage = (query: string) => {
  messages.push({ role: "user", content: query });
  updatePopover({ state: "LOADING", chunk: "follow-up" });
  if (sendMessageCallback) {
    sendMessageCallback(query, messages);
  }
};
const stableOnOpenLibrary = () => {
  chrome.runtime.sendMessage({ type: "OPEN_LIBRARY", payload: {} }, (response) => {
    if (response?.success) {
      console.log("[Gist] Library opened");
    }
  });
};

const stableOnSaveGist = (explanation: string) => {
  saveStatus = "saving";
  renderPopover({ state: lastState });
  chrome.runtime.sendMessage({
    type: "SAVE_GIST",
    payload: {
      selectedText: currentOriginalText,
      explanation,
      complexityLevel: currentMode,
      pageContext: currentPageContext,
      gist_type: currentImageData ? "visual" : "text",
      imageData: currentImageData ?? undefined,
    },
  });
};

// ── Visualize (Mermaid diagram) ───────────────────────────────────────────────

export function updateDiagram(update: { state: "done" | "error"; svg?: string; source?: string }): void {
  if (update.state === "done") {
    diagramSvg = update.svg;        // may be undefined when mermaid.ink failed
    diagramSource = update.source;  // raw Mermaid code — always present as fallback
    diagramState = "done";
  } else {
    diagramSvg = undefined;
    diagramSource = undefined;
    diagramState = "error";
  }
  renderPopover({ state: lastState });
}

// ── AutoGist widget exports ───────────────────────────────────────────────────

export function setWidgetEnabled(enabled: boolean): void {
  widgetEnabled = enabled;
  if (enabled) {
    // Reset dismissed state so the widget reappears when re-enabled
    widgetDismissed = false;
    widgetState = "idle";
    widgetTakeaways = [];
  }
  renderWidget();
}

export function setWidgetLoading(): void {
  if (!widgetEnabled || widgetDismissed) return;
  widgetState = "loading";
  renderWidget();
}

export function setWidgetIdle(): void {
  if (!widgetEnabled || widgetDismissed) return;
  widgetState = "idle";
  widgetTakeaways = [];
  renderWidget();
}

export function updateWidget(takeaways: string[]): void {
  if (!widgetEnabled || widgetDismissed) return;
  widgetTakeaways = takeaways;
  widgetState = "ready";
  renderWidget();
}

function renderWidget(): void {
  if (!widgetReactRoot) return;
  if (!widgetEnabled || widgetDismissed) {
    widgetReactRoot.render(React.createElement(React.Fragment, null));
    return;
  }
  widgetReactRoot.render(
    React.createElement(AutoGistWidget, {
      state: widgetState,
      takeaways: widgetTakeaways,
      onDismiss: () => {
        widgetDismissed = true;
        chrome.storage.local.set({ autoGistEnabled: false });
        renderWidget();
      },
    })
  );
}

// ── Popover render helpers ────────────────────────────────────────────────────

interface RenderOptions {
  state: PopoverState;
  text?: string;
  error?: string;
  errorCode?: string;
}

function renderPopover({ state, text = "", error, errorCode }: RenderOptions): void {
  if (!reactRoot) return;
  lastState = state;

  reactRoot.render(
    React.createElement(Popover, {
      state,
      text,
      messages,
      error,
      errorCode: errorCode ?? currentErrorCode,
      position: currentPosition,
      mode: currentMode,
      imageData: currentImageData,
      isSidebarMode,
      isVisible,
      saveStatus,
      drillingStack: drillingStack.map((level) => ({ term: level.term, level: level.level })),
      onToggleSidebar: toggleSidebar,
      onOpenLibrary: stableOnOpenLibrary,
      onClose: stableOnClose,
      onModeChange: modeChangeCallback ?? undefined,
      onSendMessage: stableOnSendMessage,
      onSaveGist: stableOnSaveGist,
      diagramSvg,
      diagramSource,
      diagramState,
      onVisualize: (text: string) => {
        diagramState = "loading";
        renderPopover({ state: lastState });
        chrome.runtime.sendMessage({
          type: "VISUALIZE_REQUEST",
          payload: { text, pageContext: currentPageContext },
        });
      },
      onDrill: (term: string) => {
        if (drillingStack.length >= MAX_DRILLING_DEPTH) return;
        // Content script will send NESTED_GIST_REQUEST to background
        chrome.runtime.sendMessage({
          type: "NESTED_GIST_REQUEST",
          payload: { term, parentContext: currentOriginalText || currentPageContext },
        });
      },
      onJumpToDrillingLevel: (levelIndex: number) => {
        if (levelIndex === -1) {
          drillingStack = [];
          messages = [];
          accumulatedText = "";
          currentOriginalText = "";
          renderPopover({ state: "IDLE" });
        } else if (levelIndex >= 0 && levelIndex < drillingStack.length) {
          jumpToDrillingLevel(levelIndex);
        }
      },
    })
  );
}
