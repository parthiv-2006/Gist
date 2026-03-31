import { buildGistRequest, isGistMessage, type GistMessage, type ChatMessage } from "../utils/messages";

// Backend URL is selected automatically by Vite at build time.
// `vite build` (production) → Render URL
// `vite build --watch` / `vite` (dev) → localhost
const BACKEND_URL = import.meta.env.DEV
  ? "http://localhost:8000/api/v1/simplify"
  : "https://gist-vc8m.onrender.com/api/v1/simplify";

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
  const tabId = sender.tab?.id;
  if (!tabId) return;

  if (message.type === "GIST_REQUEST") {
    const { selectedText, pageContext, complexityLevel } = message.payload;
    if (!selectedText) return;
    console.log("[Gist BG] GIST_REQUEST received", { tabId, selectedText: selectedText.slice(0, 50) });
    streamFromBackend(tabId, selectedText, pageContext ?? "", complexityLevel ?? "standard");
  } else if (message.type === "GIST_FOLLOW_UP") {
    const { pageContext, messages, complexityLevel } = message.payload;
    console.log("[Gist BG] GIST_FOLLOW_UP received", { tabId, historyLength: messages?.length });
    streamFromBackend(tabId, "", pageContext ?? "", complexityLevel ?? "standard", messages);
  }
});

async function streamFromBackend(
  tabId: number,
  selectedText: string,
  pageContext: string,
  complexityLevel: string,
  messages?: ChatMessage[]
) {
  console.log("[Gist BG] fetch →", BACKEND_URL);
  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selected_text: selectedText,
        page_context: pageContext,
        complexity_level: complexityLevel,
        messages: messages,
      }),
    });

    console.log("[Gist BG] fetch response status:", response.status);

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Request failed" }));
      console.warn("[Gist BG] non-OK response:", err);
      const errorMsg: GistMessage = {
        type: "GIST_ERROR",
        payload: { error: err.error ?? "Something went wrong. Please try again." },
      };
      chrome.tabs.sendMessage(tabId, errorMsg);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      console.error("[Gist BG] response.body is null — cannot stream");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let chunkCount = 0;

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
          console.log("[Gist BG] stream complete — chunks received:", chunkCount);
          const completeMsg: GistMessage = { type: "GIST_COMPLETE", payload: {} };
          chrome.tabs.sendMessage(tabId, completeMsg);
          return;
        }

        try {
          const parsed = JSON.parse(data) as { chunk: string };
          chunkCount++;
          console.log("[Gist BG] GIST_CHUNK #" + chunkCount + ":", parsed.chunk.slice(0, 30));
          const chunkMsg: GistMessage = { type: "GIST_CHUNK", payload: { chunk: parsed.chunk } };
          chrome.tabs.sendMessage(tabId, chunkMsg);
        } catch {
          // skip malformed lines
        }
      }
    }

    console.log("[Gist BG] stream ended without [DONE] — chunks received:", chunkCount);
    const completeMsg: GistMessage = { type: "GIST_COMPLETE", payload: {} };
    chrome.tabs.sendMessage(tabId, completeMsg);
  } catch (err) {
    console.error("[Gist BG] fetch error:", err);
    const errorMsg: GistMessage = {
      type: "GIST_ERROR",
      payload: { error: "Network error. Check your connection and try again." },
    };
    chrome.tabs.sendMessage(tabId, errorMsg);
  }
}

// Re-export for type usage in tests
export { buildGistRequest };
