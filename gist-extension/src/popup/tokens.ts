// Shared design tokens and constants for the popup/dashboard UI.

export const BACKEND_BASE: Promise<string> = (async () => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 600);
    const r = await fetch("http://localhost:8000/health", { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) return "http://localhost:8000";
  } catch { /* no local server */ }
  return "https://gist-vc8m.onrender.com";
})();

export const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const MONO = "'Space Mono', 'Fira Code', monospace";

export const T = {
  bg:           "#080808",
  bgElevated:   "#0f0f0f",
  bgHover:      "#161616",
  bgActive:     "#1d1d1d",
  border:       "#1e1e1e",
  borderMid:    "#2a2a2a",
  borderStrong: "#353535",
  text:         "#f0f0f0",
  textSub:      "#888888",
  textMuted:    "#484848",
  accent:       "#10b981",
  accentDim:    "rgba(16,185,129,0.09)",
  accentBorder: "rgba(16,185,129,0.20)",
  accentGlow:   "rgba(16,185,129,0.30)",
} as const;

export const CATEGORY_COLORS: Record<string, string> = {
  Code:    "#60a5fa",
  Legal:   "#f59e0b",
  Medical: "#f87171",
  Finance: "#a78bfa",
  Science: "#34d399",
  General: "#666666",
};
