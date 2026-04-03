// src/content/observer.ts
// Viewport text extractor with scroll debounce for the Auto-Gist feature.
// Extracts readable text currently visible in the browser window,
// filtering out navigation, ads, and other UI chrome.

const EXTRACTION_DELAY_MS = 2000;  // wait 2s after last scroll event
const INITIAL_DELAY_MS    = 4000;  // wait 4s after page load before first extraction
const MIN_TEXT_CHARS      = 100;   // minimum chars to bother sending
const MAX_TEXT_CHARS      = 1500;  // hard cap — keeps payloads small
const MIN_WORD_COUNT      = 5;     // ignore very short elements

const EXCLUDED_TAGS = new Set([
  "NAV", "HEADER", "FOOTER", "ASIDE", "SCRIPT", "STYLE", "NOSCRIPT",
  "BUTTON", "INPUT", "SELECT", "TEXTAREA", "FORM",
]);

// Class/ID patterns that indicate non-content UI regions
const EXCLUDED_PATTERN =
  /\b(nav|navbar|sidebar|menu|footer|header|banner|advertisement|ad-|cookie|popup|modal|overlay|toast|snackbar|toolbar|breadcrumb)\b/i;

function isExcluded(el: HTMLElement): boolean {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    if (EXCLUDED_TAGS.has(node.tagName)) return true;
    const combined = (node.className ?? "") + " " + (node.id ?? "");
    if (EXCLUDED_PATTERN.test(combined)) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * Extract the text currently visible in the viewport.
 * Returns a single string of up to MAX_TEXT_CHARS characters.
 */
export function extractViewportText(): string {
  const viewH = window.innerHeight;
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>("p, h1, h2, h3, h4, li, blockquote")
  );

  const chunks: string[] = [];
  let totalChars = 0;

  for (const el of elements) {
    if (totalChars >= MAX_TEXT_CHARS) break;
    if (isExcluded(el)) continue;

    const rect = el.getBoundingClientRect();
    // Element must overlap with the visible viewport
    if (rect.bottom < 0 || rect.top > viewH) continue;

    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const wordCount = text.split(" ").length;
    if (wordCount < MIN_WORD_COUNT) continue;

    const remaining = MAX_TEXT_CHARS - totalChars;
    chunks.push(text.slice(0, remaining));
    totalChars += text.length;
  }

  return chunks.join(" ").slice(0, MAX_TEXT_CHARS);
}

/**
 * Start observing scroll events and call onText when the user settles on
 * a section with enough readable content.
 *
 * Returns a cleanup function that removes the listener and cancels any
 * pending timer.
 */
export function startObserver(onText: (text: string) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tryExtract = () => {
    const text = extractViewportText();
    if (text.length >= MIN_TEXT_CHARS) {
      onText(text);
    }
  };

  const onScroll = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(tryExtract, EXTRACTION_DELAY_MS);
  };

  window.addEventListener("scroll", onScroll, { passive: true });

  // Initial extraction — gives the page time to fully render
  timer = setTimeout(tryExtract, INITIAL_DELAY_MS);

  return () => {
    window.removeEventListener("scroll", onScroll);
    if (timer !== null) clearTimeout(timer);
  };
}
