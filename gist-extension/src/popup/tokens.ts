// Gist design tokens — warm paper-dark, sage accent, JetBrains Mono + Inter

export const BACKEND_BASE: Promise<string> = (async () => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 600);
    const r = await fetch("http://localhost:8000/health", { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const data = await r.json().catch(() => null);
      // Only use local backend when DB is also connected — avoids routing
      // library requests to a local server that can't reach MongoDB Atlas.
      if (data?.db?.connected !== false) return "http://localhost:8000";
    }
  } catch { /* no local server or DB unavailable */ }
  return "https://gist-vc8m.onrender.com";
})();

export const FONT = '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
export const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

export const T = {
  // Surfaces — warm paper-dark (not blue-black)
  bg:           "oklch(0.16 0.004 120)",
  bgElevated:   "oklch(0.20 0.005 120)",
  bgHover:      "oklch(0.23 0.005 120)",
  bgActive:     "oklch(0.27 0.006 120)",
  // Borders
  border:       "oklch(0.30 0.006 120)",
  borderMid:    "oklch(0.36 0.008 120)",
  borderStrong: "oklch(0.36 0.008 120)",
  // Ink
  text:         "oklch(0.95 0.005 95)",
  textSub:      "oklch(0.78 0.006 95)",
  textMuted:    "oklch(0.58 0.008 95)",
  textDim:      "oklch(0.42 0.008 95)",
  // Accent — sage/moss (not glowy emerald)
  accent:       "oklch(0.75 0.11 150)",
  accentDim:    "oklch(0.55 0.09 150)",
  accentBg:     "oklch(0.30 0.05 150 / 0.3)",
  accentInk:    "oklch(0.22 0.03 150)",
  accentBorder: "oklch(0.55 0.09 150 / 0.4)",
  accentGlow:   "oklch(0.75 0.11 150 / 0.25)",
  // Secondary — warm ochre
  ochre:        "oklch(0.78 0.11 80)",
  ochreBg:      "oklch(0.30 0.04 80 / 0.3)",
} as const;

export const CATEGORY_COLORS: Record<string, string> = {
  Code:    "oklch(0.72 0.10 230)",
  Legal:   "oklch(0.74 0.10 30)",
  General: "oklch(0.72 0.02 150)",
  Media:   "oklch(0.74 0.10 300)",
  Science: "oklch(0.74 0.10 180)",
  Medical: "oklch(0.74 0.10 10)",
  Finance: "oklch(0.74 0.10 270)",
};
