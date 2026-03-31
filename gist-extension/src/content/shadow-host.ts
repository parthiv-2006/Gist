// src/content/shadow-host.ts
// Mounts the React Popover into an isolated Shadow DOM attached to document.body.
// This prevents host-page CSS from bleeding into the extension UI.

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { Popover, type PopoverState } from "./components/Popover";
import type { ComplexityLevel } from "../utils/messages";

let shadowHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let reactRoot: Root | null = null;

// Internal accumulated text (builds up as STREAMING chunks arrive)
let accumulatedText = "";
// Current explanation mode — updated on LOADING, persisted through STREAMING/DONE
let currentMode: ComplexityLevel = "standard";
// Callback set by content/index.ts to handle mode button clicks
let modeChangeCallback: ((mode: ComplexityLevel) => void) | null = null;

export function setModeChangeHandler(handler: (mode: ComplexityLevel) => void): void {
  modeChangeCallback = handler;
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

  const mountPoint = document.createElement("div");
  shadowRoot.appendChild(mountPoint);

  reactRoot = createRoot(mountPoint);
  renderPopover({ state: "IDLE" });
}

export function updatePopover(update: PopoverUpdate): void {
  if (!reactRoot) return;

  if (update.state === "LOADING") {
    accumulatedText = "";
    if (update.mode) currentMode = update.mode;
    renderPopover({
      state: "LOADING",
      position: update.position,
    });
    return;
  }

  if (update.state === "STREAMING") {
    accumulatedText += update.chunk ?? "";
    renderPopover({ state: "STREAMING", text: accumulatedText });
    return;
  }

  if (update.state === "DONE") {
    renderPopover({ state: "DONE", text: accumulatedText });
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
    currentMode = "standard";
    reactRoot.render(React.createElement(Popover, { state: "IDLE", text: "", onClose: () => {} }));
  }
}

interface RenderOptions {
  state: PopoverState;
  text?: string;
  error?: string;
  position?: DOMRect;
}

function renderPopover({ state, text = "", error, position }: RenderOptions): void {
  if (!reactRoot) return;

  reactRoot.render(
    React.createElement(Popover, {
      state,
      text,
      error,
      position,
      onClose: () => unmountPopover(),
    })
  );
}
