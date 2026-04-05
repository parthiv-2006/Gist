// src/utils/dom-walker.ts
// DOM TreeWalker utilities for Gist Lens term highlighting.
// Splits text nodes in-place and wraps matched terms in <span class="gist-lens-term">.

import type { LensTerm } from "./messages";

export const LENS_CLASS = "gist-lens-term";

// Tags whose text content must never be highlighted.
const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT",
  "CODE", "PRE", "KBD", "SAMP", "VAR",
]);

/**
 * Collect all visible, non-empty text nodes under `root`, skipping
 * script/style blocks and already-highlighted spans.
 */
export function walkTextNodes(root: Node): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node: Node): number {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        // Skip nodes already inside a lens highlight
        if (parent.closest(`span.${LENS_CLASS}`)) return NodeFilter.FILTER_REJECT;
        // Skip empty / whitespace-only nodes
        if (!(node.nodeValue ?? "").trim()) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    nodes.push(node as Text);
  }
  return nodes;
}

/**
 * Highlight all occurrences of each term in `terms` under `root` by
 * splitting text nodes and inserting <span class="gist-lens-term"> elements.
 *
 * Safe to call multiple times — already-highlighted nodes are skipped by
 * walkTextNodes so terms are never double-wrapped.
 */
export function highlightTerms(terms: LensTerm[], root: Node): void {
  if (terms.length === 0) return;

  // Sort longest-first so "machine learning" matches before "learning"
  const sorted = [...terms].sort((a, b) => b.term.length - a.term.length);

  const pattern = sorted.map((t) => escapeRegex(t.term)).join("|");
  const regex = new RegExp(`(?<![\\w-])(${pattern})(?![\\w-])`, "gi");

  // O(1) lookup: lowercase term → definition
  const defMap = new Map(terms.map((t) => [t.term.toLowerCase(), t.definition]));

  // Snapshot nodes before mutation — modifying the DOM invalidates live iterators
  const textNodes = walkTextNodes(root);

  for (const textNode of textNodes) {
    const text = textNode.nodeValue ?? "";

    // Quick check before running the full regex
    if (!regex.test(text)) {
      regex.lastIndex = 0;
      continue;
    }
    regex.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      // Prepend any plain text before this match
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const span = document.createElement("span");
      span.className = LENS_CLASS;
      span.textContent = match[0];
      span.dataset["term"] = match[0];
      span.dataset["def"] = defMap.get(match[0].toLowerCase()) ?? "";
      fragment.appendChild(span);

      lastIndex = match.index + match[0].length;
    }

    // Append any trailing plain text
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  }
}

/**
 * Remove all lens highlight spans under `root`, restoring the original text nodes.
 */
export function removeLensHighlights(root: Node): void {
  if (!(root instanceof Element)) return;
  const spans = root.querySelectorAll(`span.${LENS_CLASS}`);
  for (const span of spans) {
    const parent = span.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(span.textContent ?? ""), span);
    // Merge adjacent text nodes created by the replacement
    parent.normalize();
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
