// src/popup/App.tsx

import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";

// Try local dev server first (600 ms timeout); fall back to Render.
const BACKEND_BASE: Promise<string> = (async () => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 600);
    const r = await fetch("http://localhost:8000/health", { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) return "http://localhost:8000";
  } catch { /* no local server */ }
  return "https://gist-vc8m.onrender.com";
})();

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'Space Mono', 'Fira Code', monospace";

// ── Design Tokens ──────────────────────────────────────────────────────────────
const T = {
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
};

const CATEGORY_COLORS: Record<string, string> = {
  Code:    "#60a5fa",
  Legal:   "#f59e0b",
  Medical: "#f87171",
  Finance: "#a78bfa",
  Science: "#34d399",
  General: "#666666",
};

// ── SVG Icon Components ────────────────────────────────────────────────────────

const IconCapture = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconSidebar = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <path d="M15 3v18" />
  </svg>
);

const IconEye = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconCaptureTab = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconLibraryTab = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconX = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconChevron = ({ open }: { open: boolean }) => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ display: "block", transition: "transform 150ms ease", transform: open ? "rotate(180deg)" : "none" }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const IconEmptyLibrary = () => (
  <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const IconSparkle = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
  </svg>
);

const IconGrip = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    {([3, 7] as const).map(cx =>
      ([2, 5.5, 9] as const).map(cy => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.1" fill="currentColor" />
      ))
    )}
  </svg>
);

// ── Types ──────────────────────────────────────────────────────────────────────

interface GistItem {
  original_text: string;
  explanation:   string;
  mode:          string;
  url:           string;
  category:      string;
  created_at:    string;
  score?:        number;
}

interface AskResult {
  answer:  string;
  sources: GistItem[];
}

// ── GistCard ───────────────────────────────────────────────────────────────────

function GistCard({
  item,
  expanded,
  onToggle,
}: {
  item: GistItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = CATEGORY_COLORS[item.category] ?? T.textMuted;
  const date  = new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const bg     = expanded ? T.bgHover : hovered ? "#131313" : T.bgElevated;
  const border = expanded ? T.borderMid : hovered ? T.border : "#191919";

  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: "8px",
        padding: "10px 12px",
        cursor: "pointer",
        transition: "border-color 120ms ease, background 120ms ease",
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{
            fontSize: "9px", fontWeight: 700, letterSpacing: "0.07em",
            textTransform: "uppercase" as const,
            color,
            background: `${color}14`,
            border: `1px solid ${color}32`,
            borderRadius: "4px",
            padding: "1.5px 5px",
          }}>
            {item.category}
          </span>
          <span style={{ fontSize: "9.5px", color: T.textMuted, fontFamily: MONO, letterSpacing: "0.02em" }}>
            {item.mode}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span style={{ fontSize: "9.5px", color: T.textMuted }}>{date}</span>
          <span style={{ color: T.textMuted, display: "flex" }}>
            <IconChevron open={expanded} />
          </span>
        </div>
      </div>

      {/* Preview */}
      <p style={{
        margin: 0,
        fontSize: "11.5px",
        color: T.textSub,
        lineHeight: 1.5,
        overflow: "hidden",
        display: "-webkit-box",
        WebkitLineClamp: expanded ? undefined : 2,
        WebkitBoxOrient: "vertical" as const,
      }}>
        {item.original_text}
      </p>

      {/* Expanded */}
      {expanded && (
        <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${T.border}` }}>
          <p style={{ margin: "0 0 8px", fontSize: "12px", color: T.text, lineHeight: 1.65 }}>
            {item.explanation}
          </p>
          {item.url && item.url !== "Unknown page" && (
            <p style={{
              margin: 0, fontSize: "10px", color: T.textMuted,
              fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {item.url}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Library View ───────────────────────────────────────────────────────────────

type AskState = "idle" | "searching" | "done" | "error";

function LibraryView() {
  const [items, setItems]         = useState<GistItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [expanded, setExpanded]   = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const [query, setQuery]         = useState("");
  const [askState, setAskState]   = useState<AskState>("idle");
  const [askResult, setAskResult] = useState<AskResult | null>(null);
  const [askError, setAskError]   = useState<string | null>(null);
  const [srcExpanded, setSrcExpanded] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    BACKEND_BASE.then((base) => {
      if (cancelled) return;
      fetch(`${base}/library`)
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({})) as { error?: string };
            throw new Error(body.error ?? (r.status === 503
              ? "Library unavailable — is the backend running?"
              : `Failed to load library (${r.status}).`));
          }
          return r.json();
        })
        .then((data) => { if (!cancelled) { setItems(data.items ?? []); setLoading(false); } })
        .catch((e: Error) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    });
    return () => { cancelled = true; };
  }, [retryCount]);

  const handleAsk = async () => {
    const q = query.trim();
    if (!q || askState === "searching") return;
    setAskState("searching");
    setAskResult(null);
    setAskError(null);
    setSrcExpanded(null);
    const base = await BACKEND_BASE;
    fetch(`${base}/library/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Search failed (${r.status}).`);
        }
        return r.json();
      })
      .then((data: AskResult) => { setAskResult(data); setAskState("done"); })
      .catch((e: Error) => { setAskError(e.message); setAskState("error"); });
  };

  const handleClearAsk = () => {
    setQuery("");
    setAskState("idle");
    setAskResult(null);
    setAskError(null);
  };

  const searchBar = (
    <div style={{ padding: "12px 14px 0" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        background: T.bgElevated,
        border: `1px solid ${askState === "searching" ? T.accentBorder : T.border}`,
        borderRadius: "8px",
        padding: "8px 10px",
        transition: "border-color 200ms ease, box-shadow 200ms ease",
        boxShadow: askState === "searching" ? `0 0 0 3px ${T.accentDim}` : "none",
      }}>
        <span style={{ color: askState === "searching" ? T.accent : T.textMuted, display: "flex", flexShrink: 0, transition: "color 200ms ease" }}>
          <IconSearch />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAsk(); }}
          placeholder="Ask your library…"
          style={{
            flex: 1, background: "none", border: "none", outline: "none",
            fontSize: "12px", color: T.text, fontFamily: FONT, padding: 0,
          }}
        />
        {askState === "searching" && (
          <div style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: T.accent, flexShrink: 0,
            animation: "gistPulse 1s ease-in-out infinite",
          }} />
        )}
        {(askState === "done" || askState === "error") && (
          <button
            onClick={handleClearAsk}
            style={{ background: "none", border: "none", cursor: "pointer", color: T.textMuted, padding: 0, display: "flex" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = T.textSub; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = T.textMuted; }}
          >
            <IconX />
          </button>
        )}
        {askState === "idle" && query.trim() && (
          <button onClick={handleAsk} style={{
            background: T.accent, border: "none", borderRadius: "5px",
            color: "#000", fontSize: "9px", fontWeight: 700, fontFamily: FONT,
            padding: "3px 7px", cursor: "pointer", flexShrink: 0,
            letterSpacing: "0.06em", textTransform: "uppercase" as const,
          }}>
            ASK
          </button>
        )}
      </div>
      <style>{`@keyframes gistPulse{0%,100%{opacity:1}50%{opacity:0.25}}`}</style>
    </div>
  );

  // Ask results
  if (askState === "done" && askResult) {
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        {searchBar}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "10px 14px" }}>
          <div style={{
            background: T.accentDim,
            border: `1px solid ${T.accentBorder}`,
            borderRadius: "8px",
            padding: "12px 14px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
              <span style={{ color: T.accent, display: "flex" }}><IconSparkle /></span>
              <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase" as const, color: T.accent }}>
                Answer
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "12px", color: T.text, lineHeight: 1.65 }}>
              {askResult.answer}
            </p>
          </div>

          {askResult.sources.length > 0 && (
            <div>
              <p style={{ margin: "0 0 6px", fontSize: "9px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.textMuted }}>
                Sources · {askResult.sources.length}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {askResult.sources.map((src, i) => (
                  <GistCard key={i} item={src} expanded={srcExpanded === i} onToggle={() => setSrcExpanded(srcExpanded === i ? null : i)} />
                ))}
              </div>
            </div>
          )}

          {askResult.sources.length === 0 && (
            <p style={{ textAlign: "center", padding: "10px 0", fontSize: "11.5px", color: T.textMuted, margin: 0 }}>
              No matching gists — save more content to build your library.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (askState === "error") {
    return (
      <div>
        {searchBar}
        <div style={{ padding: "10px 14px" }}>
          <div style={{
            background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.18)",
            borderLeft: "2px solid #f87171", borderRadius: "7px",
            padding: "10px 12px", fontSize: "12px", color: "#f87171", lineHeight: 1.5,
          }}>
            {askError ?? "Search failed."}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        {searchBar}
        <div style={{ padding: "40px 16px", textAlign: "center", color: T.textMuted, fontSize: "12px" }}>
          Loading…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        {searchBar}
        <div style={{ padding: "10px 14px" }}>
          <div style={{
            background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.18)",
            borderLeft: "2px solid #f87171", borderRadius: "7px",
            padding: "12px 14px", fontSize: "12px", color: "#f87171", lineHeight: 1.5,
          }}>
            <div style={{ marginBottom: "10px" }}>{error}</div>
            <button
              onClick={() => setRetryCount((n) => n + 1)}
              style={{
                background: "none", border: "1px solid rgba(248,113,113,0.35)",
                borderRadius: "5px", color: "#f87171", fontSize: "11px",
                padding: "4px 10px", cursor: "pointer", fontFamily: FONT,
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div>
        {searchBar}
        <div style={{ padding: "36px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <span style={{ color: T.textMuted, opacity: 0.45, display: "flex" }}>
            <IconEmptyLibrary />
          </span>
          <div style={{ fontSize: "12px", color: T.textMuted, lineHeight: 1.7 }}>
            Your library is empty.
            <br />
            <span style={{ color: T.textSub }}>Highlight text on any page to save your first gist.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {searchBar}
      <div style={{ display: "flex", flexDirection: "column", gap: "5px", padding: "10px 14px" }}>
        {items.map((item, i) => (
          <GistCard key={i} item={item} expanded={expanded === i} onToggle={() => setExpanded(expanded === i ? null : i)} />
        ))}
      </div>
    </div>
  );
}

// ── Feature Card ───────────────────────────────────────────────────────────────

function FeatureCard({
  icon,
  title,
  subtitle,
  rightSlot,
  onClick,
  accent = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  rightSlot?: React.ReactNode;
  onClick?: () => void;
  accent?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const isClickable = !!onClick;

  const border = accent
    ? T.accentBorder
    : hovered && isClickable ? T.borderMid : T.border;

  const iconBg = accent
    ? T.accentDim
    : hovered && isClickable ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.015)";

  const iconBorder = accent ? T.accentBorder : T.border;
  const iconColor  = accent ? T.accent : hovered && isClickable ? T.textSub : T.textMuted;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: T.bgElevated,
        border: `1px solid ${border}`,
        borderRadius: "8px",
        padding: "10px 12px",
        cursor: isClickable ? "pointer" : "default",
        transition: "border-color 150ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
        <div style={{
          width: "30px", height: "30px", borderRadius: "7px",
          background: iconBg,
          border: `1px solid ${iconBorder}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: iconColor,
          transition: "all 150ms ease",
          flexShrink: 0,
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: "12px", fontWeight: 600, color: T.text, lineHeight: 1.2, marginBottom: "2px" }}>
            {title}
          </div>
          <div style={{ fontSize: "10.5px", color: T.textSub, lineHeight: 1.3 }}>
            {subtitle}
          </div>
        </div>
      </div>
      {rightSlot && <div style={{ flexShrink: 0 }}>{rightSlot}</div>}
    </div>
  );
}

// ── Capture View ───────────────────────────────────────────────────────────────

function CaptureView() {
  const [autoGistEnabled, setAutoGistEnabled] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(["autoGistEnabled"], (result) => {
      setAutoGistEnabled(result["autoGistEnabled"] === true);
    });
  }, []);

  const handleAutoGistToggle = () => {
    const next = !autoGistEnabled;
    setAutoGistEnabled(next);
    chrome.storage.local.set({ autoGistEnabled: next });
  };

  const Toggle = () => (
    <button
      onClick={(e) => { e.stopPropagation(); handleAutoGistToggle(); }}
      aria-label={autoGistEnabled ? "Disable AutoGist" : "Enable AutoGist"}
      style={{
        width: "34px", height: "19px", borderRadius: "10px",
        background: autoGistEnabled ? T.accent : T.bgActive,
        border: `1px solid ${autoGistEnabled ? T.accent : T.borderMid}`,
        cursor: "pointer", position: "relative",
        transition: "all 200ms ease", padding: 0, outline: "none",
      }}
    >
      <div style={{
        position: "absolute", top: "2px",
        left: autoGistEnabled ? "15px" : "2px",
        width: "13px", height: "13px", borderRadius: "50%",
        background: "#fff", transition: "left 200ms ease",
        boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
      }} />
    </button>
  );

  const KbdSet = ({ keys }: { keys: string[] }) => (
    <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
      {keys.map((key, i) => (
        <React.Fragment key={key}>
          {i > 0 && <span style={{ fontSize: "9px", color: T.textMuted, margin: "0 1px" }}>+</span>}
          <kbd style={{
            background: T.bgActive,
            border: `1px solid ${T.borderStrong}`,
            borderBottomWidth: "2px",
            borderRadius: "4px",
            padding: "2px 5px",
            fontSize: "10px",
            fontFamily: MONO,
            color: T.text,
            fontWeight: 600,
            lineHeight: 1.5,
            display: "inline-block",
          }}>{key}</kbd>
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <main style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "7px" }}>

      <p style={{ margin: "0 0 5px", fontSize: "12px", color: T.textSub, lineHeight: 1.6 }}>
        Highlight text on any page for an instant AI&#8209;powered explanation.
      </p>

      <FeatureCard
        icon={<IconCapture />}
        title="Visual Capture"
        subtitle="Drag to select any area"
        rightSlot={<KbdSet keys={["Alt", "⇧", "G"]} />}
        onClick={() => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab?.id) {
              chrome.tabs.sendMessage(tab.id, { type: "GIST_CAPTURE_START", payload: {} });
              window.close();
            }
          });
        }}
      />

      <FeatureCard
        icon={<IconSidebar />}
        title="Sidebar Mode"
        subtitle="Persistent panel on the right"
        onClick={() => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab?.id) {
              chrome.tabs.sendMessage(tab.id, { type: "GIST_SIDEBAR_TOGGLE", payload: {} });
              window.close();
            }
          });
        }}
      />

      <FeatureCard
        icon={<IconEye />}
        title="AutoGist"
        subtitle="Ambient scroll summary"
        accent={autoGistEnabled}
        rightSlot={<Toggle />}
      />

      {/* Keyboard shortcut */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: T.bgElevated, border: `1px solid ${T.border}`,
        borderRadius: "8px", padding: "9px 12px",
      }}>
        <span style={{ fontSize: "11.5px", color: T.textSub, fontWeight: 500 }}>Quick text gist</span>
        <KbdSet keys={["Ctrl", "⇧", "E"]} />
      </div>

      {/* Tip */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: "9px",
        background: T.bgElevated, border: `1px solid ${T.border}`,
        borderRadius: "8px", padding: "9px 12px",
      }}>
        <span style={{ color: T.textMuted, display: "flex", flexShrink: 0, marginTop: "1px" }}>
          <IconGrip />
        </span>
        <p style={{ margin: 0, fontSize: "11.5px", color: T.textSub, lineHeight: 1.55 }}>
          The panel is <strong style={{ color: T.text, fontWeight: 600 }}>draggable</strong> and{" "}
          <strong style={{ color: T.text, fontWeight: 600 }}>resizable</strong> — grab the header or corner.
        </p>
      </div>

    </main>
  );
}

// ── App Shell ──────────────────────────────────────────────────────────────────

type Tab = "capture" | "library";

function GistLogo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div style={{
        width: "22px", height: "22px",
        borderRadius: "6px",
        background: T.accentDim,
        border: `1px solid ${T.accentBorder}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {/* Text-distillation mark: three lines of descending width */}
        <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
          <rect x="0" y="0"   width="12" height="2" rx="1" fill={T.accent} opacity="0.45" />
          <rect x="0" y="4"   width="9"  height="2" rx="1" fill={T.accent} />
          <rect x="0" y="8"   width="6"  height="2" rx="1" fill={T.accent} opacity="0.45" />
        </svg>
      </div>
      <span style={{
        fontSize: "13px", fontWeight: 700, letterSpacing: "0.01em", color: T.text,
      }}>
        Gist
      </span>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>(() =>
    window.location.hash === "#library" ? "library" : "capture"
  );

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "capture", label: "Capture", icon: <IconCaptureTab /> },
    { id: "library", label: "Library", icon: <IconLibraryTab /> },
  ];

  return (
    <div style={{
      fontFamily: FONT,
      background: T.bg,
      color: T.text,
      width: "340px",
      display: "flex",
      flexDirection: "column",
      margin: 0,
      boxSizing: "border-box",
    }}>

      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 14px",
        borderBottom: `1px solid ${T.border}`,
      }}>
        <GistLogo />
        <span style={{
          fontSize: "10px", color: T.textMuted, fontFamily: MONO,
          padding: "2px 6px",
          background: T.bgElevated,
          border: `1px solid ${T.border}`,
          borderRadius: "4px",
          letterSpacing: "0.03em",
        }}>
          v1.0
        </span>
      </header>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${T.border}` }}>
        {tabs.map(({ id, label, icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                flex: 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
                background: "none", border: "none",
                borderBottom: active ? `2px solid ${T.accent}` : "2px solid transparent",
                padding: "8px 0",
                fontSize: "11.5px",
                fontWeight: active ? 600 : 500,
                color: active ? T.text : T.textMuted,
                cursor: "pointer",
                transition: "color 120ms ease",
                fontFamily: FONT,
                letterSpacing: "0.01em",
              }}
            >
              <span style={{
                color: active ? T.accent : T.textMuted,
                display: "flex",
                transition: "color 120ms ease",
              }}>
                {icon}
              </span>
              {label}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div style={{ overflowY: "auto", maxHeight: "500px" }}>
        {activeTab === "capture" ? <CaptureView /> : <LibraryView />}
      </div>

      {/* Footer */}
      <footer style={{
        padding: "9px 14px",
        borderTop: `1px solid ${T.border}`,
        fontSize: "10.5px",
        color: T.textMuted,
        textAlign: "center" as const,
        letterSpacing: "0.01em",
      }}>
        {activeTab === "capture" ? "Select text on any page to begin" : "Your personal knowledge base"}
      </footer>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  document.body.style.margin = "0";
  document.body.style.background = T.bg;
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
