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
