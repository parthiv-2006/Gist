import { buildGistRequest, isGistMessage, type GistMessage, type ChatMessage } from "../utils/messages";

// Backend URL is selected automatically by Vite at build time.
// `vite build` (production) → Render URL
// `vite build --watch` / `vite` (dev) → localhost
const BACKEND_URL = import.meta.env.DEV
  ? "http://localhost:8000/api/v1/simplify"
  : "https://gist-vc8m.onrender.com/api/v1/simplify";

const LIBRARY_SAVE_URL = import.meta.env.DEV
  ? "http://localhost:8000/library/save"
  : "https://gist-vc8m.onrender.com/library/save";

const AUTOGIST_URL = import.meta.env.DEV
  ? "http://localhost:8000/autogist"
  : "https://gist-vc8m.onrender.com/autogist";

const LENS_SCAN_URL = import.meta.env.DEV
  ? "http://localhost:8000/api/v1/scan-terms"
  : "https://gist-vc8m.onrender.com/api/v1/scan-terms";

// Per-tab rate limit: at most 1 auto-gist request every 8 seconds.
const _lastAutoGistTime = new Map<number, number>();
const AUTOGIST_COOLDOWN_MS = 8_000;

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
    const { selectedText, explanation, complexityLevel, pageContext } = message.payload;
    if (!selectedText || !explanation) return;
    saveGistToLibrary(tabId, selectedText, explanation, complexityLevel ?? "standard", pageContext ?? "");
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
  } else if (message.type === "LENS_SCAN_REQUEST") {
    const { textChunk, pageContext } = message.payload;
    if (!textChunk) return;
    console.log("[Gist BG] LENS_SCAN_REQUEST", { tabId, chars: textChunk.length });
    fetchLensTerms(tabId, textChunk, pageContext ?? "");
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
  console.log("[Gist BG] fetch →", BACKEND_URL);
  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  url: string
): Promise<void> {
  try {
    const response = await fetch(LIBRARY_SAVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ original_text: selectedText, explanation, mode, url }),
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
  try {
    const response = await fetch(AUTOGIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

async function fetchLensTerms(tabId: number, textChunk: string, pageContext: string): Promise<void> {
  try {
    const response = await fetch(LENS_SCAN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_content: textChunk, page_context: pageContext }),
    });

    if (!response.ok) {
      console.warn("[Gist BG] LensScan non-OK:", response.status);
      chrome.tabs.sendMessage(tabId, { type: "LENS_SCAN_ERROR", payload: {} });
      return;
    }

    const data = await response.json() as { terms?: Array<{ term: string; definition: string }> };
    if (!Array.isArray(data.terms) || data.terms.length === 0) return;

    const msg: GistMessage = {
      type: "LENS_SCAN_RESPONSE",
      payload: { terms: data.terms },
    };
    chrome.tabs.sendMessage(tabId, msg);
  } catch (err) {
    console.warn("[Gist BG] LensScan fetch error:", err);
    chrome.tabs.sendMessage(tabId, { type: "LENS_SCAN_ERROR", payload: {} });
  }
}

// Re-export for type usage in tests
export { buildGistRequest };
