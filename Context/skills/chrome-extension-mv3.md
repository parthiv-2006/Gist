---
name: chrome-extension-mv3
description: >
  How to scaffold and configure a Chrome Extension using Manifest V3.
  Covers the correct manifest.json structure, permission declarations,
  the three isolated execution contexts (content script, background worker, popup),
  and the chrome.runtime message-passing pattern between them.
  Use this skill whenever building or modifying any part of a Chrome Extension.
---

## Overview

A Chrome Extension (Manifest V3) runs code in **three strictly isolated contexts**. They cannot share memory or call each other's functions directly. All communication goes through `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`.

```
Content Script   ←──── chrome.runtime ────→   Background Service Worker
     ↑                                                    ↑
     │                                                    │
  Injected into                                    Single instance,
  every page tab.                                  no DOM access,
  Has DOM access.                                  owns all fetch() calls.
  No direct fetch (CSP).

Popup (popup.html)  ←── chrome.runtime ──→  Background Service Worker
  Shown when user clicks
  the extension icon.
```

---

## 1. `manifest.json` — Required Fields for Gist

```json
{
  "manifest_version": 3,
  "name": "Gist",
  "version": "0.1.0",
  "description": "Highlight any text to get an instant plain-language explanation.",
  "permissions": [
    "contextMenus",
    "activeTab",
    "scripting",
    "storage"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "dist/background/index.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["dist/content/index.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "commands": {
    "_execute_action": {},
    "trigger-gist": {
      "suggested_key": {
        "default": "Ctrl+Shift+E",
        "mac": "Command+Shift+E"
      },
      "description": "Gist the selected text"
    }
  }
}
```

### Permission Notes

| Permission | Why Gist Needs It |
|---|---|
| `contextMenus` | Register "Gist this" in the right-click menu |
| `activeTab` | Access the current tab's selected text without broad host access |
| `scripting` | Programmatically inject scripts if needed |
| `storage` | V2: persist history to `chrome.storage.local` |
| `host_permissions: <all_urls>` | Content script must run on any page the user visits |

---

## 2. Background Service Worker (`src/background/index.ts`)

The service worker is the central router. It:
- Registers the context menu item on `chrome.runtime.onInstalled`
- Listens for keyboard shortcuts via `chrome.commands.onCommand`
- Receives `GIST_REQUEST` from the content script
- Makes all outbound `fetch()` calls (avoids CORS issues in content scripts)
- Relays response chunks back to the content script

```typescript
// src/background/index.ts
import { GistMessage } from "../utils/messages";

// Register context menu on first install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "gist-this",
    title: "Gist this",
    contexts: ["selection"],
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "gist-this" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: "GIST_CONTEXT_MENU_TRIGGERED",
    });
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "trigger-gist" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: "GIST_SHORTCUT_TRIGGERED",
    });
  }
});

// Handle incoming GIST_REQUEST from content script
chrome.runtime.onMessage.addListener(
  (message: GistMessage, sender, sendResponse) => {
    if (message.type === "GIST_REQUEST") {
      handleGistRequest(message, sender.tab?.id);
      return true; // keep the channel open for async response
    }
  }
);

async function handleGistRequest(message: GistMessage, tabId?: number) {
  // All fetch() calls live here — not in the content script
  // See: fastapi-sse-streaming skill for the streaming implementation
}
```

---

## 3. Content Script (`src/content/index.ts`)

The content script:
- Runs in the context of every webpage
- Reads `window.getSelection()` to get highlighted text
- Sends `GIST_REQUEST` to the background worker
- Listens for `GIST_CHUNK` / `GIST_COMPLETE` / `GIST_ERROR` responses

```typescript
// src/content/index.ts
import { buildGistRequest, GistMessage } from "../utils/messages";
import { mountPopover, updatePopoverState } from "./shadow-host";

// Listen for trigger signals from the background worker
chrome.runtime.onMessage.addListener((message: GistMessage) => {
  if (
    message.type === "GIST_CONTEXT_MENU_TRIGGERED" ||
    message.type === "GIST_SHORTCUT_TRIGGERED"
  ) {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";

    if (!text) return;

    // Mount the popover immediately in LOADING state
    mountPopover(selection);

    // Send the request to the background worker
    const request = buildGistRequest(text, document.title);
    chrome.runtime.sendMessage(request);
  }

  if (message.type === "GIST_CHUNK" && message.payload.chunk) {
    updatePopoverState("STREAMING", message.payload.chunk);
  }

  if (message.type === "GIST_COMPLETE") {
    updatePopoverState("DONE");
  }

  if (message.type === "GIST_ERROR" && message.payload.error) {
    updatePopoverState("ERROR", message.payload.error);
  }
});
```

---

## 4. Typed Message Schema (`src/utils/messages.ts`)

Define this ONCE. Import it in all three contexts. Never use raw strings.

```typescript
// src/utils/messages.ts

export type MessageType =
  | "GIST_REQUEST"
  | "GIST_CONTEXT_MENU_TRIGGERED"
  | "GIST_SHORTCUT_TRIGGERED"
  | "GIST_CHUNK"
  | "GIST_COMPLETE"
  | "GIST_ERROR";

export interface GistMessage {
  type: MessageType;
  payload: {
    selectedText?: string;
    pageContext?: string;
    chunk?: string;
    error?: string;
  };
}

export function buildGistRequest(
  selectedText: string,
  pageContext: string
): GistMessage {
  return {
    type: "GIST_REQUEST",
    payload: { selectedText, pageContext },
  };
}

export function isGistMessage(value: unknown): value is GistMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "payload" in value
  );
}
```

---

## 5. Loading the Extension in Chrome for Development

1. Run `npm run build` to produce the `dist/` folder
2. Open `chrome://extensions`
3. Enable **Developer Mode** (toggle, top right)
4. Click **Load unpacked** and select the project root (where `manifest.json` lives)
5. To see background service worker logs: click **"service worker"** link on the extension card
6. To hot-reload: after rebuilding, click the refresh icon on the extension card

> **Tip:** Install the `crxjs/vite-plugin` to get hot module replacement directly in the browser without manual rebuild.

---

## 6. Common Pitfalls

| Pitfall | Fix |
|---|---|
| `fetch()` in content script blocked by host CSP | Move ALL fetch calls to the background service worker |
| `chrome.runtime.sendMessage` returns undefined | Add `return true` in the `onMessage` listener to keep the channel async |
| Service worker goes idle and loses state | Service workers are ephemeral. Do NOT store state in module-level variables. Use `chrome.storage.session` instead. |
| Content script CSS leaking from/into host page | Mount all UI inside a Shadow DOM (see: `shadow-dom-react-injection` skill) |
| Context menu item registered multiple times | Only register in `chrome.runtime.onInstalled`, never on every startup |
