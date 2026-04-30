import { buildGistRequest, isGistMessage, type GistMessage, type ChatMessage } from "../utils/messages";

const LOCAL_BASE  = "http://localhost:8000";
const RENDER_BASE = "https://gist-vc8m.onrender.com";

// Resolve the backend base URL once at startup: try localhost (600 ms timeout),
// fall back to Render. Result is cached for the lifetime of the service worker.
let _resolvedBase: string | null = null;
async function resolveBase(): Promise<string> {
  if (_resolvedBase) return _resolvedBase;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 600);
    const r = await fetch(`${LOCAL_BASE}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) { _resolvedBase = LOCAL_BASE; return LOCAL_BASE; }
  } catch { /* local server not running */ }
  _resolvedBase = RENDER_BASE;
  return RENDER_BASE;
}

async function getStoredApiKey(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["geminiApiKey"], (res) => {
      resolve(res["geminiApiKey"] || null);
    });
  });
}

// Per-tab rate limit: at most 1 auto-gist request every 8 seconds.
const _lastAutoGistTime = new Map<number, number>();
const AUTOGIST_COOLDOWN_MS = 8_000;

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: "gist-this",
    title: "Gist this",
    contexts: ["selection"],
  });

  // On first install: open the onboarding walkthrough tab
  if (details.reason === "install") {
    chrome.storage.local.get(["onboardingComplete"], (result) => {
      if (!result["onboardingComplete"]) {
        chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
      }
    });
  }

  // Warm up the backend (also seeds the _resolvedBase cache)
  resolveBase().then(base => fetch(`${base}/health`).catch(() => {}));
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "gist-this" || !tab?.id) return;
  await ensureContentScript(tab.id);
  chrome.tabs.sendMessage(tab.id, { type: "GIST_CONTEXT_MENU_TRIGGERED", payload: {} });
});

chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;
    await ensureContentScript(tab.id);

    if (command === "trigger-gist") {
      chrome.tabs.sendMessage(tab.id, { type: "GIST_SHORTCUT_TRIGGERED", payload: {} });
    } else if (command === "capture-gist") {
      chrome.tabs.sendMessage(tab.id, { type: "GIST_CAPTURE_START", payload: {} });
    }
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

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Only accept messages from our own extension (content scripts, popup)
  if (sender.id !== chrome.runtime.id) return;
  if (!isGistMessage(message)) return;

  if (message.type === "CAPTURE_VISIBLE_TAB") {
    chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, { format: "png" }, (dataUrl) => {
      sendResponse({ dataUrl });
    });
    return true; // Keep channel open for async response
  }

  const tabId = sender.tab?.id;
  if (!tabId) return;

  if (message.type === "GIST_REQUEST") {
    const { selectedText, pageContext, complexityLevel, imageData, imageMimeType } = message.payload;
    // We allow selectedText to be empty if imageData is present
    if (!selectedText && !imageData) return;

    console.log("[Gist BG] GIST_REQUEST received", {
      tabId,
      hasText: !!selectedText,
      hasImage: !!imageData,
    });
    streamFromBackend(
      tabId,
      selectedText ?? "",
      pageContext ?? "",
      complexityLevel ?? "standard",
      undefined,
      imageData,
      imageMimeType
    );
  } else if (message.type === "GIST_FOLLOW_UP") {
    const { pageContext, messages, complexityLevel } = message.payload;
    console.log("[Gist BG] GIST_FOLLOW_UP received", { tabId, historyLength: messages?.length });
    streamFromBackend(tabId, "", pageContext ?? "", complexityLevel ?? "standard", messages);
  } else if (message.type === "OPEN_LIBRARY") {
    // chrome.action.openPopup() requires a direct user gesture and silently fails
    // when triggered from a content script message. Open as a tab instead.
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") + "#library" });
    sendResponse({ success: true });
    return true;
  } else if (message.type === "SAVE_GIST") {
    const { selectedText, explanation, complexityLevel, pageContext, gist_type } = message.payload;
    if (!explanation) return;
    saveGistToLibrary(tabId, selectedText ?? "", explanation, complexityLevel ?? "standard", pageContext ?? "", gist_type ?? "text");
    return true;
  } else if (message.type === "AUTOGIST_REQUEST") {
    const { textChunk, url } = message.payload;
    if (!textChunk) return;

    const now = Date.now();
    const last = _lastAutoGistTime.get(tabId) ?? 0;
    if (now - last < AUTOGIST_COOLDOWN_MS) {
      console.log("[Gist BG] AUTOGIST_REQUEST rate-limited for tab", tabId);
      return;
    }
    _lastAutoGistTime.set(tabId, now);

    console.log("[Gist BG] AUTOGIST_REQUEST", { tabId, chars: textChunk.length });
    fetchAutoGist(tabId, textChunk, url ?? "");
  } else if (message.type === "NESTED_GIST_REQUEST") {
    const { term, parentContext } = message.payload;
    if (!term) return;
    console.log("[Gist BG] NESTED_GIST_REQUEST", { tabId, term });
    fetchNestedGist(tabId, term, parentContext ?? "");
  } else if (message.type === "VISUALIZE_REQUEST") {
    const { text, pageContext } = message.payload;
    if (!text) return;
    console.log("[Gist BG] VISUALIZE_REQUEST", { tabId, chars: text.length });
    fetchVisualize(tabId, text, pageContext ?? "");
  }
});

async function streamFromBackend(
  tabId: number,
  selectedText: string,
  pageContext: string,
  complexityLevel: string,
  messages?: ChatMessage[],
  imageData?: string,
  imageMimeType?: string
) {
  const base = await resolveBase();
  const url = `${base}/api/v1/simplify`;
  console.log("[Gist BG] fetch →", url);
  const apiKey = await getStoredApiKey();
  const streamHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) streamHeaders["X-Gemini-Api-Key"] = apiKey;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: streamHeaders,
      body: JSON.stringify({
        selected_text: selectedText || undefined,
        page_context: pageContext,
        complexity_level: complexityLevel,
        messages: messages,
        image_data: imageData,
        image_mime_type: imageMimeType,
      }),
    });

    console.log("[Gist BG] fetch response status:", response.status);

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: null, code: null }));
      console.warn("[Gist BG] non-OK response:", response.status, err);
      let userMessage: string;
      if (err.error) {
        userMessage = err.error;
      } else if (response.status === 400) {
        userMessage = "Invalid request. Try selecting different text.";
      } else if (response.status === 429) {
        userMessage = "Too many requests — please wait a moment before trying again.";
      } else if (response.status === 503) {
        userMessage = "AI service is temporarily unavailable. Try again shortly.";
      } else {
        userMessage = `Something went wrong (${response.status}). Please try again.`;
      }
      const errorMsg: GistMessage = {
        type: "GIST_ERROR",
        payload: { error: userMessage },
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

async function saveGistToLibrary(
  tabId: number,
  selectedText: string,
  explanation: string,
  mode: string,
  url: string,
  gist_type: string = "text"
): Promise<void> {
  const base = await resolveBase();
  const apiKey = await getStoredApiKey();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["X-Gemini-Api-Key"] = apiKey;
    const response = await fetch(`${base}/library/save`, {
      method: "POST",
      headers,
      body: JSON.stringify({ original_text: selectedText, explanation, mode, url, gist_type }),
    });
    const success = response.ok;
    const resultMsg: GistMessage = { type: "SAVE_GIST_RESULT", payload: { success } };
    chrome.tabs.sendMessage(tabId, resultMsg);
  } catch {
    const resultMsg: GistMessage = { type: "SAVE_GIST_RESULT", payload: { success: false } };
    chrome.tabs.sendMessage(tabId, resultMsg);
  }
}

async function fetchAutoGist(tabId: number, textChunk: string, url: string): Promise<void> {
  const base = await resolveBase();
  const apiKey = await getStoredApiKey();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["X-Gemini-Api-Key"] = apiKey;
  try {
    const response = await fetch(`${base}/autogist`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text_chunk: textChunk, url }),
    });

    if (!response.ok) {
      console.warn("[Gist BG] AutoGist non-OK:", response.status);
      chrome.tabs.sendMessage(tabId, { type: "AUTOGIST_ERROR", payload: {} });
      return;
    }

    const data = await response.json() as { takeaways?: string[] };
    if (!Array.isArray(data.takeaways) || data.takeaways.length === 0) return;

    const msg: GistMessage = {
      type: "AUTOGIST_RESPONSE",
      payload: { takeaways: data.takeaways },
    };
    chrome.tabs.sendMessage(tabId, msg);
  } catch (err) {
    // AutoGist is best-effort — silently fail so it never disrupts the user, but tell UI to reset
    console.warn("[Gist BG] AutoGist fetch error:", err);
    chrome.tabs.sendMessage(tabId, { type: "AUTOGIST_ERROR", payload: {} });
  }
}

async function fetchNestedGist(tabId: number, term: string, parentContext: string): Promise<void> {
  const base = await resolveBase();
  const apiKey = await getStoredApiKey();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["X-Gemini-Api-Key"] = apiKey;
  try {
    const response = await fetch(`${base}/api/v1/nested-gist`, {
      method: "POST",
      headers,
      body: JSON.stringify({ term, parent_context: parentContext }),
    });

    if (!response.ok) {
      console.warn("[Gist BG] NestedGist non-OK:", response.status);
      chrome.tabs.sendMessage(tabId, { type: "NESTED_GIST_ERROR", payload: {} });
      return;
    }

    const data = await response.json() as { definition?: string };
    if (!data.definition) {
      chrome.tabs.sendMessage(tabId, { type: "NESTED_GIST_ERROR", payload: {} });
      return;
    }

    const msg: GistMessage = {
      type: "NESTED_GIST_RESPONSE",
      payload: { term, definition: data.definition },
    };
    chrome.tabs.sendMessage(tabId, msg);
  } catch (err) {
    console.warn("[Gist BG] NestedGist fetch error:", err);
    chrome.tabs.sendMessage(tabId, { type: "NESTED_GIST_ERROR", payload: {} });
  }
}

async function fetchVisualize(tabId: number, text: string, pageContext: string): Promise<void> {
  const base = await resolveBase();
  const apiKey = await getStoredApiKey();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["X-Gemini-Api-Key"] = apiKey;
  try {
    const response = await fetch(`${base}/api/v1/visualize`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text, page_context: pageContext }),
    });

    if (!response.ok) {
      console.warn("[Gist BG] Visualize non-OK:", response.status);
      chrome.tabs.sendMessage(tabId, { type: "VISUALIZE_ERROR", payload: {} });
      return;
    }

    const data = await response.json() as { svg?: string | null; mermaid_source?: string };
    // svg may be null when mermaid.ink is unavailable — still send VISUALIZE_RESPONSE
    // so the extension can fall back to showing the raw Mermaid source as a code block.
    if (!data.svg && !data.mermaid_source) {
      chrome.tabs.sendMessage(tabId, { type: "VISUALIZE_ERROR", payload: {} });
      return;
    }

    const msg: GistMessage = {
      type: "VISUALIZE_RESPONSE",
      payload: {
        diagramSvg: data.svg ?? undefined,
        diagramSource: data.mermaid_source,
      },
    };
    chrome.tabs.sendMessage(tabId, msg);
  } catch (err) {
    console.warn("[Gist BG] Visualize fetch error:", err);
    chrome.tabs.sendMessage(tabId, { type: "VISUALIZE_ERROR", payload: {} });
  }
}

// Re-export for type usage in tests
export { buildGistRequest };
