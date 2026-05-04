// Gist design tokens — warm paper-dark, sage accent, JetBrains Mono + Inter

const _LOCAL = "http://localhost:8000";
const _RENDER = "https://gist-vc8m.onrender.com";
let _cachedBase: string | null = null;
let _cachedAt = 0;
const _BASE_TTL = 60_000; // re-probe after 60 s — session can recover if server starts/stops

/**
 * Resolve the backend base URL.
 * Tries localhost:8000/health (800 ms timeout). Uses local only when the
 * server is up AND the DB is connected (db.connected !== false).
 * Result is cached for 60 seconds; call again to get a fresh probe.
 */
export async function getBackendBase(): Promise<string> {
  if (_cachedBase && (Date.now() - _cachedAt) < _BASE_TTL) return _cachedBase;
  try {
    const r = await fetch(`${_LOCAL}/health`, {
      signal: AbortSignal.timeout(800),
    });
    if (r.ok) {
      const data = await r.json().catch(() => null);
      if (data?.db?.connected !== false) {
        _cachedBase = _LOCAL;
        _cachedAt = Date.now();
        return _LOCAL;
      }
    }
  } catch { /* no local server or DB unavailable */ }
  _cachedBase = _RENDER;
  _cachedAt = Date.now();
  return _RENDER;
}

// Backwards-compatible alias: existing `await BACKEND_BASE` callsites still work,
// but they get the initial resolution (no re-probe). Use getBackendBase() for fresh lookups.
export const BACKEND_BASE: Promise<string> = getBackendBase();

export const FONT = '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
export const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

export const T = {
  // Surfaces
  bg:           "var(--bg)",
  bgElevated:   "var(--surface)",
  bgHover:      "var(--surface-2)",
  bgActive:     "var(--surface-3)",
  // Borders
  border:       "var(--hairline)",
  borderMid:    "var(--hairline-2)",
  borderStrong: "var(--hairline-2)",
  // Ink
  text:         "var(--ink)",
  textSub:      "var(--ink-2)",
  textMuted:    "var(--ink-3)",
  textDim:      "var(--ink-4)",
  // Accent — sage/moss
  accent:       "var(--accent)",
  accentDim:    "var(--accent-dim)",
  accentBg:     "var(--accent-bg)",
  accentInk:    "var(--accent-ink)",
  accentBorder: "var(--accent-border)",
  accentGlow:   "var(--accent-glow)",
  // Secondary — warm ochre
  ochre:        "var(--ochre)",
  ochreBg:      "var(--ochre-bg)",
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
