// src/content/shadow-host.ts
// Mounts the React Popover into an isolated Shadow DOM attached to document.body.
// This prevents host-page CSS from bleeding into the extension UI.

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { Popover, type PopoverState } from "./components/Popover";
import { CaptureOverlay } from "./components/CaptureOverlay";
import type { ComplexityLevel, ChatMessage } from "../utils/messages";
import popoverStyles from "./components/Popover.module.css?inline";
import overlayStyles from "./components/CaptureOverlay.module.css?inline";

let shadowHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let reactRoot: Root | null = null;

// Internal accumulated text (builds up as STREAMING chunks arrive)
let accumulatedText = "";
let messages: ChatMessage[] = [];
let currentMode: ComplexityLevel = "standard";
let currentPosition: DOMRect | undefined = undefined;
let currentImageData: string | undefined = undefined;

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
  position?: DOMRect;
  mode?: ComplexityLevel;
  imageData?: string;
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

  const fontLink = document.createElement("link");
  fontLink.rel = "stylesheet";
  fontLink.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap";
  shadowRoot.appendChild(fontLink);

  const style = document.createElement("style");
  style.textContent = popoverStyles + "\n" + overlayStyles;
  shadowRoot.appendChild(style);

  const mountPoint = document.createElement("div");
  mountPoint.style.cssText = "pointer-events: none; width: 100%; height: 100%;";
  shadowRoot.appendChild(mountPoint);

  reactRoot = createRoot(mountPoint);
  renderPopover({ state: "IDLE" });
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
    // If it's a fresh Gist (not a follow-up), clear history
    if (!update.chunk) {
      messages = [];
      accumulatedText = "";
      currentImageData = update.imageData;
    }
    if (update.mode) currentMode = update.mode;
    if (update.position) currentPosition = update.position;
    
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
    renderPopover({ state: "ERROR", error: update.error });
    return;
  }

  renderPopover({ state: "IDLE" });
}

export function unmountPopover(): void {
  if (reactRoot) {
    accumulatedText = "";
    messages = [];
    currentMode = "standard";
    currentImageData = undefined;
    renderPopover({ state: "IDLE" });
  }
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

interface RenderOptions {
  state: PopoverState;
  text?: string;
  error?: string;
}

function renderPopover({ state, text = "", error }: RenderOptions): void {
  if (!reactRoot) return;

  reactRoot.render(
    React.createElement(Popover, {
      state,
      text,
      messages,
      error,
      position: currentPosition,
      mode: currentMode,
      imageData: currentImageData,
      onClose: stableOnClose,
      onModeChange: modeChangeCallback ?? undefined,
      onSendMessage: stableOnSendMessage,
    })
  );
}
