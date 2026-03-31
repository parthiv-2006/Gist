/**
 * src/content/loader.ts
 * 
 * This is a "classic" script that serves as a bridge to load our
 * modern ES module content script. Chrome Manifest V3 does not
 * support ES modules directly in the content_scripts.js array,
 * so we use this dynamic import pattern.
 */

(async () => {
  const src = chrome.runtime.getURL("content.js");
  await import(src);
})();
