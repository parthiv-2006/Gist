// Loader script — injected as a classic (non-module) content script.
// Chrome MV3 does not support "type: module" in content_scripts, but it does
// support dynamic import() in classic scripts. This tiny file is the only
// entry point Chrome injects; it in turn loads the real ESM bundle from the
// extension package via chrome.runtime.getURL so the module graph resolves
// correctly against web_accessible_resources.
import(chrome.runtime.getURL('content.js'));
