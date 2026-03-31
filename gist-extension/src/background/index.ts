import { buildGistRequest, isGistMessage, type GistMessage } from "../utils/messages";

const BACKEND_URL = "https://gist-vc8m.onrender.com/api/v1/simplify";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "gist-this",
    title: "Gist this",
    contexts: ["selection"],
  });

  // Warm up the backend
  fetch(`${BACKEND_URL.replace("/api/v1/simplify", "/health")}`).catch(() => {});
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "gist-this" || !tab?.id) return;
  await ensureContentScript(tab.id);
  chrome.tabs.sendMessage(tab.id, { type: "GIST_CONTEXT_MENU_TRIGGERED", payload: {} });
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "trigger-gist") return;
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;
    await ensureContentScript(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: "GIST_SHORTCUT_TRIGGERED", payload: {} });
  });
});

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch {
    // Already injected or restricted page (chrome://, extensions page, etc.) — proceed anyway
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, _sendResponse) => {
  if (!isGistMessage(message)) return;
  if (message.type !== "GIST_REQUEST") return;
  const tabId = sender.tab?.id;
  if (!tabId) return;

  const { selectedText, pageContext } = message.payload;
  if (!selectedText) return;

  streamFromBackend(tabId, selectedText, pageContext ?? "");
  // No return true — we use chrome.tabs.sendMessage, never sendResponse
});

async function streamFromBackend(tabId: number, selectedText: string, pageContext: string) {
  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selected_text: selectedText,
        page_context: pageContext,
        complexity_level: "standard",
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Request failed" }));
      const errorMsg: GistMessage = {
        type: "GIST_ERROR",
        payload: { error: err.error ?? "Something went wrong. Please try again." },
      };
      chrome.tabs.sendMessage(tabId, errorMsg);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          const completeMsg: GistMessage = { type: "GIST_COMPLETE", payload: {} };
          chrome.tabs.sendMessage(tabId, completeMsg);
          return;
        }

        try {
          const parsed = JSON.parse(data) as { chunk: string };
          const chunkMsg: GistMessage = { type: "GIST_CHUNK", payload: { chunk: parsed.chunk } };
          chrome.tabs.sendMessage(tabId, chunkMsg);
        } catch {
          // skip malformed lines
        }
      }
    }

    const completeMsg: GistMessage = { type: "GIST_COMPLETE", payload: {} };
    chrome.tabs.sendMessage(tabId, completeMsg);
  } catch {
    const errorMsg: GistMessage = {
      type: "GIST_ERROR",
      payload: { error: "Network error. Check your connection and try again." },
    };
    chrome.tabs.sendMessage(tabId, errorMsg);
  }
}

// Re-export for type usage in tests
export { buildGistRequest };
