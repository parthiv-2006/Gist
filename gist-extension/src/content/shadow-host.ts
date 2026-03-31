// src/content/shadow-host.ts
// Mounts the React Popover into an isolated Shadow DOM attached to document.body.
// This prevents host-page CSS from bleeding into the extension UI.

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { Popover, type PopoverState } from "./components/Popover";
import type { ComplexityLevel, ChatMessage } from "../utils/messages";

let shadowHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let reactRoot: Root | null = null;

// Internal accumulated text (builds up as STREAMING chunks arrive)
let accumulatedText = "";
let messages: ChatMessage[] = [];
let currentMode: ComplexityLevel = "standard";
let currentPosition: DOMRect | undefined = undefined;

// Callbacks set by content/index.ts
let modeChangeCallback: ((mode: ComplexityLevel) => void) | null = null;
let sendMessageCallback: ((query: string, history: ChatMessage[]) => void) | null = null;

export function setHandlers(
  onModeChange: (mode: ComplexityLevel) => void,
  onSendMessage: (query: string, history: ChatMessage[]) => void
): void {
  modeChangeCallback = onModeChange;
  sendMessageCallback = onSendMessage;
}

export interface PopoverUpdate {
  state: PopoverState;
  chunk?: string;
  error?: string;
  position?: DOMRect;
  mode?: ComplexityLevel;
}

export function mountPopover(): void {
  if (shadowHost) return; // already mounted

  shadowHost = document.createElement("div");
  shadowHost.id = "gist-shadow-host";
  shadowHost.style.cssText = "all: initial; position: fixed; z-index: 2147483647;";
  document.body.appendChild(shadowHost);

  // Inject Inter font inside the shadow DOM
  shadowRoot = shadowHost.attachShadow({ mode: "open" });
  const fontLink = document.createElement("link");
  fontLink.rel = "stylesheet";
  fontLink.href =
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap";
  shadowRoot.appendChild(fontLink);

  // Vite's IIFE build injects all CSS into document.head at bundle execution time.
  // Move it into the shadow root so styles scope correctly and don't pollute the host page.
  const viteStyle = Array.from(document.head.querySelectorAll("style")).find(
    (el) => el.textContent?.includes("--gist-bg")
  );
  if (viteStyle) {
    shadowRoot.appendChild(viteStyle); // appendChild moves an existing node — no clone needed
  }

  // Stop mousedown events that originate inside the shadow DOM from reaching
  // document-level listeners. The popover uses position:fixed inside a 0x0
  // shadow host, so Chrome's hit-testing may not include the host in
  // composedPath(). Stopping propagation at the host level is the reliable
  // fix: inside clicks never reach the document handler, outside clicks do.
  shadowHost.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });

  const mountPoint = document.createElement("div");
  shadowRoot.appendChild(mountPoint);

  reactRoot = createRoot(mountPoint);
  renderPopover({ state: "IDLE" });
}

export function updatePopover(update: PopoverUpdate): void {
  if (!reactRoot) return;

  if (update.state === "LOADING") {
    // If it's a fresh Gist (not a follow-up), clear history
    if (!update.chunk) {
      messages = [];
      accumulatedText = "";
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
    renderPopover({ state: "IDLE" });
  }
}

// Stable references — defined once so React sees the same prop identity on every
// render. This prevents the click-outside useEffect in Popover from re-firing on
// each streaming chunk (which briefly removes/re-adds the mousedown listener and
// creates a race-condition window where clicks incorrectly close the popover).
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
      onClose: stableOnClose,
      onModeChange: modeChangeCallback ?? undefined,
      onSendMessage: stableOnSendMessage,
    })
  );
}
