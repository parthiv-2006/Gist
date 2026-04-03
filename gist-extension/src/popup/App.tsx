// src/popup/App.tsx

import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'Space Mono', 'Fira Code', monospace";

const c = {
  bg:           "#0a0a0a",
  bgCard:       "#141414",
  border:       "#2a2a2a",
  borderStrong: "#3a3a3a",
  textPrimary:  "#ededed",
  textSecondary:"#888888",
  textMuted:    "#555555",
  accent:       "#10b981",
  accentGlow:   "rgba(16, 185, 129, 0.35)",
};

const MODES = [
  { label: "Standard", desc: "Clear, balanced explanation" },
  { label: "ELI5",     desc: "Simple, everyday language"  },
  { label: "Legal",    desc: "Precise legal analysis"     },
  { label: "Academic", desc: "Scholarly depth & citations" },
];

const CATEGORY_COLORS: Record<string, string> = {
  Code:    "#60a5fa",
  Legal:   "#f59e0b",
  Medical: "#f87171",
  Finance: "#a78bfa",
  Science: "#34d399",
  General: "#888888",
};

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── Gist Card (shared between library list and search results) ─────────────

function GistCard({ item, index, expanded, onToggle }: {
  item: GistItem;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const color = CATEGORY_COLORS[item.category] ?? c.textMuted;
  const date  = new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div
      onClick={onToggle}
      style={{
        background: c.bgCard,
        border: `1px solid ${expanded ? c.borderStrong : c.border}`,
        borderRadius: "6px",
        padding: "10px 11px",
        cursor: "pointer",
        transition: "border-color 120ms ease",
      }}
      onMouseEnter={(e) => { if (!expanded) e.currentTarget.style.borderColor = c.borderStrong; }}
      onMouseLeave={(e) => { if (!expanded) e.currentTarget.style.borderColor = c.border; }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "5px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{
            fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em",
            textTransform: "uppercase" as const, color,
            background: `${color}18`, border: `1px solid ${color}40`,
            borderRadius: "3px", padding: "1px 5px",
          }}>
            {item.category}
          </span>
          <span style={{ fontSize: "9px", color: c.textMuted, fontFamily: MONO }}>{item.mode}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "9px", color: c.textMuted }}>{date}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
            style={{ color: c.textMuted, transition: "transform 120ms ease", transform: expanded ? "rotate(180deg)" : "none" }}>
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <p style={{
        margin: 0, fontSize: "11px", color: c.textSecondary, lineHeight: 1.45,
        overflow: "hidden", display: "-webkit-box",
        WebkitLineClamp: expanded ? undefined : 2,
        WebkitBoxOrient: "vertical" as const,
      }}>
        {item.original_text}
      </p>
      {expanded && (
        <div style={{ marginTop: "10px", borderTop: `1px solid ${c.border}`, paddingTop: "10px" }}>
          <p style={{ margin: "0 0 8px 0", fontSize: "11px", color: c.textPrimary, lineHeight: 1.6 }}>
            {item.explanation}
          </p>
          {item.url && item.url !== "Unknown page" && (
            <p style={{ margin: 0, fontSize: "10px", color: c.textMuted, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.url}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Library View ───────────────────────────────────────────────────────────

type AskState = "idle" | "searching" | "done" | "error";

function LibraryView() {
  const [items, setItems]         = useState<GistItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [expanded, setExpanded]   = useState<number | null>(null);

  // Search / Ask state
  const [query, setQuery]         = useState("");
  const [askState, setAskState]   = useState<AskState>("idle");
  const [askResult, setAskResult] = useState<AskResult | null>(null);
  const [askError, setAskError]   = useState<string | null>(null);
  const [srcExpanded, setSrcExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/library")
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 503 ? "Library unavailable — start the backend." : `Error ${r.status}`);
        return r.json();
      })
      .then((data) => { setItems(data.items ?? []); setLoading(false); })
      .catch((e)   => { setError(e.message); setLoading(false); });
  }, []);

  const handleAsk = () => {
    const q = query.trim();
    if (!q || askState === "searching") return;
    setAskState("searching");
    setAskResult(null);
    setAskError(null);
    setSrcExpanded(null);

    fetch("http://127.0.0.1:8000/library/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then((data: AskResult) => { setAskResult(data); setAskState("done"); })
      .catch((e) => { setAskError(e.message); setAskState("error"); });
  };

  const handleClearAsk = () => {
    setQuery("");
    setAskState("idle");
    setAskResult(null);
    setAskError(null);
  };

  // ── Search bar (always visible at top) ──────────────────────────────────
  const searchBar = (
    <div style={{ padding: "10px 12px 0" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "6px",
        background: c.bgCard,
        border: `1px solid ${askState === "searching" ? c.accent : c.border}`,
        borderRadius: "7px",
        padding: "6px 9px",
        transition: "border-color 200ms ease",
        boxShadow: askState === "searching" ? `0 0 0 2px ${c.accentGlow}` : "none",
      }}>
        {/* Search icon */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ color: askState === "searching" ? c.accent : c.textMuted, flexShrink: 0, transition: "color 200ms ease" }}>
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAsk(); }}
          placeholder="Ask your library…"
          style={{
            flex: 1, background: "none", border: "none", outline: "none",
            fontSize: "11px", color: c.textPrimary, fontFamily: FONT,
          }}
        />
        {/* Pulse indicator while searching */}
        {askState === "searching" && (
          <div style={{
            width: "7px", height: "7px", borderRadius: "50%",
            background: c.accent, flexShrink: 0,
            animation: "gist-pulse 1s ease-in-out infinite",
          }} />
        )}
        {/* Clear button when results are shown */}
        {(askState === "done" || askState === "error") && (
          <button onClick={handleClearAsk} style={{
            background: "none", border: "none", cursor: "pointer",
            color: c.textMuted, padding: "0", display: "flex", alignItems: "center",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
        {/* Ask button */}
        {askState === "idle" && query.trim() && (
          <button onClick={handleAsk} style={{
            background: c.accent, border: "none", borderRadius: "4px",
            color: "#000", fontSize: "9px", fontWeight: 700, fontFamily: FONT,
            padding: "3px 7px", cursor: "pointer", flexShrink: 0,
            letterSpacing: "0.04em",
          }}>
            ASK
          </button>
        )}
      </div>
      {/* Pulse keyframe injected once */}
      <style>{`@keyframes gist-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );

  // ── Ask results view ─────────────────────────────────────────────────────
  if (askState === "done" && askResult) {
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        {searchBar}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "10px 12px" }}>
          {/* Glassmorphism answer card */}
          <div style={{
            background: "rgba(16, 185, 129, 0.06)",
            border: "1px solid rgba(16, 185, 129, 0.28)",
            borderRadius: "8px",
            padding: "11px 13px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "7px" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: c.accent }}>
                Gist Answer
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "11px", color: c.textPrimary, lineHeight: 1.65 }}>
              {askResult.answer}
            </p>
          </div>

          {/* Source gists */}
          {askResult.sources.length > 0 && (
            <div>
              <p style={{ margin: "0 0 5px 0", fontSize: "9px", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" as const, color: c.textMuted }}>
                Sources ({askResult.sources.length})
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {askResult.sources.map((src, i) => (
                  <GistCard
                    key={i}
                    item={src}
                    index={i}
                    expanded={srcExpanded === i}
                    onToggle={() => setSrcExpanded(srcExpanded === i ? null : i)}
                  />
                ))}
              </div>
            </div>
          )}

          {askResult.sources.length === 0 && (
            <div style={{ textAlign: "center", padding: "12px 0", fontSize: "11px", color: c.textMuted }}>
              No matching gists found — try gisting more content.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (askState === "error") {
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        {searchBar}
        <div style={{ padding: "10px 12px" }}>
          <div style={{
            background: "rgba(248, 113, 113, 0.08)", border: "1px solid rgba(248, 113, 113, 0.25)",
            borderRadius: "6px", padding: "10px 12px", fontSize: "11px", color: "#f87171",
          }}>
            {askError ?? "Search failed. Is the backend running?"}
          </div>
        </div>
      </div>
    );
  }

  // ── Standard library list view ───────────────────────────────────────────
  if (loading) {
    return (
      <div>
        {searchBar}
        <div style={{ padding: "32px 16px", textAlign: "center", color: c.textMuted, fontSize: "12px" }}>
          Loading library…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        {searchBar}
        <div style={{ padding: "10px 12px" }}>
          <div style={{
            background: "rgba(248, 113, 113, 0.08)", border: "1px solid rgba(248, 113, 113, 0.25)",
            borderRadius: "6px", padding: "12px", fontSize: "12px", color: "#f87171", lineHeight: 1.5,
          }}>
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div>
        {searchBar}
        <div style={{ padding: "24px 16px", textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>📚</div>
          <div style={{ fontSize: "12px", color: c.textMuted, lineHeight: 1.6 }}>
            Your library is empty.<br />Highlight text on any page to save your first gist.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {searchBar}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px 12px" }}>
        {items.map((item, i) => (
          <GistCard
            key={i}
            item={item}
            index={i}
            expanded={expanded === i}
            onToggle={() => setExpanded(expanded === i ? null : i)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Capture View (existing content) ────────────────────────────────────────

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

  return (
    <main style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* Description */}
      <p style={{ margin: 0, fontSize: "13px", color: "#b0b0b0", lineHeight: 1.55 }}>
        Highlight any text on a webpage to get an instant AI&#8209;powered explanation — without leaving the page.
      </p>

      {/* Visual Capture trigger */}
      <button
        onClick={() => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab?.id) {
              chrome.tabs.sendMessage(tab.id, { type: "GIST_CAPTURE_START", payload: {} });
              window.close();
            }
          });
        }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: "6px",
          padding: "10px 12px", cursor: "pointer", textAlign: "left", width: "100%",
          transition: "all 150ms ease", outline: "none",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.accent; e.currentTarget.style.background = c.bg; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.background = c.bgCard; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "32px", height: "32px", borderRadius: "6px",
            background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.2)",
            display: "flex", alignItems: "center", justifyContent: "center", color: c.accent,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 12V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h7" />
              <polyline points="9 9 12 12 9 15" />
              <path d="M12 12h9" /><circle cx="18" cy="12" r="3" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: c.textPrimary }}>Visual Gist</div>
            <div style={{ fontSize: "10px", color: c.textSecondary }}>Capture and explain area</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "2px" }}>
          {["Alt", "Shift", "G"].map(k => (
            <kbd key={k} style={{
              background: "#1a1a1a", border: `1px solid ${c.borderStrong}`, borderRadius: "3px",
              padding: "1px 4px", fontSize: "9px", fontFamily: MONO, color: c.textSecondary,
            }}>{k}</kbd>
          ))}
        </div>
      </button>

      {/* Sidebar mode trigger */}
      <button
        onClick={() => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab?.id) {
              chrome.tabs.sendMessage(tab.id, { type: "GIST_SIDEBAR_TOGGLE", payload: {} });
              window.close();
            }
          });
        }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: "6px",
          padding: "10px 12px", cursor: "pointer", textAlign: "left", width: "100%",
          transition: "all 150ms ease", outline: "none",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.accent; e.currentTarget.style.background = c.bg; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.background = c.bgCard; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "32px", height: "32px", borderRadius: "6px",
            background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.2)",
            display: "flex", alignItems: "center", justifyContent: "center", color: c.accent,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: c.textPrimary }}>Sidebar Mode</div>
            <div style={{ fontSize: "10px", color: c.textSecondary }}>Fixed persistent view</div>
          </div>
        </div>
      </button>

      {/* AutoGist toggle */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: c.bgCard, border: `1px solid ${autoGistEnabled ? "rgba(16,185,129,0.3)" : c.border}`,
        borderRadius: "6px", padding: "10px 12px",
        transition: "border-color 200ms ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "32px", height: "32px", borderRadius: "6px",
            background: autoGistEnabled ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${autoGistEnabled ? "rgba(16,185,129,0.2)" : c.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: autoGistEnabled ? c.accent : c.textMuted,
            transition: "all 200ms ease",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: c.textPrimary }}>AutoGist</div>
            <div style={{ fontSize: "10px", color: c.textSecondary }}>Ambient scroll summary</div>
          </div>
        </div>
        {/* Toggle switch */}
        <button
          onClick={handleAutoGistToggle}
          aria-label={autoGistEnabled ? "Disable AutoGist" : "Enable AutoGist"}
          style={{
            width: "36px", height: "20px", borderRadius: "10px",
            background: autoGistEnabled ? c.accent : "#252525",
            border: "none", cursor: "pointer", position: "relative",
            transition: "background 200ms ease", flexShrink: 0, padding: 0,
            outline: "none",
          }}
        >
          <div style={{
            position: "absolute", top: "2px",
            left: autoGistEnabled ? "18px" : "2px",
            width: "16px", height: "16px", borderRadius: "50%",
            background: "#fff", transition: "left 200ms ease",
            boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
          }} />
        </button>
      </div>

      {/* Keyboard shortcut */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: "6px", padding: "9px 12px",
      }}>
        <span style={{ fontSize: "11px", color: c.textSecondary, fontWeight: 500 }}>Quick text trigger</span>
        <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
          {["Ctrl", "Shift", "E"].map((key, i) => (
            <React.Fragment key={key}>
              {i > 0 && <span style={{ fontSize: "9px", color: c.textMuted, margin: "0 1px" }}>+</span>}
              <kbd style={{
                background: "#1a1a1a", border: `1px solid ${c.borderStrong}`, borderBottomWidth: "2px",
                borderRadius: "4px", padding: "2px 6px", fontSize: "10px", fontFamily: MONO,
                color: c.textPrimary, fontWeight: 600, lineHeight: 1.6, display: "inline-block",
              }}>{key}</kbd>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Tip: drag & resize */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: "8px",
        background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: "6px", padding: "9px 12px",
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: "1px", color: c.textMuted }}>
          <circle cx="5"  cy="2"  r="1.2" fill="currentColor" />
          <circle cx="9"  cy="2"  r="1.2" fill="currentColor" />
          <circle cx="5"  cy="7"  r="1.2" fill="currentColor" />
          <circle cx="9"  cy="7"  r="1.2" fill="currentColor" />
          <circle cx="5"  cy="12" r="1.2" fill="currentColor" />
          <circle cx="9"  cy="12" r="1.2" fill="currentColor" />
        </svg>
        <p style={{ margin: 0, fontSize: "11px", color: c.textSecondary, lineHeight: 1.5 }}>
          The explanation panel is <strong style={{ color: c.textPrimary, fontWeight: 600 }}>draggable</strong> and <strong style={{ color: c.textPrimary, fontWeight: 600 }}>resizable</strong>.
        </p>
      </div>

      {/* Explanation modes */}
      <div>
        <p style={{ margin: "0 0 8px 0", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: c.textMuted }}>
          Explanation Modes
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
          {MODES.map(({ label, desc }) => (
            <div key={label} style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: "5px", padding: "8px 10px" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: c.textPrimary, marginBottom: "3px" }}>{label}</div>
              <div style={{ fontSize: "10px", color: c.textSecondary, lineHeight: 1.4 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

// ── App Shell ──────────────────────────────────────────────────────────────

type Tab = "capture" | "library";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("capture");

  return (
    <div style={{
      fontFamily: FONT,
      background: c.bg,
      color: c.textPrimary,
      width: "300px",
      display: "flex",
      flexDirection: "column",
      margin: 0,
      boxSizing: "border-box",
    }}>

      {/* ── Header ──────────────────────────────────────────── */}
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "13px 16px",
        borderBottom: `1px solid ${c.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            width: "7px", height: "7px", borderRadius: "50%",
            background: c.accent, boxShadow: `0 0 7px ${c.accentGlow}`,
            display: "inline-block", flexShrink: 0,
          }} />
          <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "#ffffff" }}>
            Gist
          </span>
        </div>

        <span style={{
          fontSize: "10px", color: c.textMuted, fontFamily: MONO, fontWeight: 500,
          padding: "2px 7px", background: c.bgCard, border: `1px solid ${c.border}`,
          borderRadius: "4px", letterSpacing: "0.02em",
        }}>
          v1.0.0
        </span>
      </header>

      {/* ── Tab bar ─────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        borderBottom: `1px solid ${c.border}`,
      }}>
        {(["capture", "library"] as Tab[]).map((tab) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                borderBottom: active ? `2px solid ${c.accent}` : "2px solid transparent",
                padding: "8px 0",
                fontSize: "11px",
                fontWeight: active ? 700 : 500,
                color: active ? c.accent : c.textMuted,
                cursor: "pointer",
                letterSpacing: "0.04em",
                textTransform: "capitalize" as const,
                transition: "color 120ms ease",
                fontFamily: FONT,
              }}
            >
              {tab === "library" ? "📚 Library" : "Capture"}
            </button>
          );
        })}
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      <div style={{ overflowY: "auto", maxHeight: "460px" }}>
        {activeTab === "capture" ? <CaptureView /> : <LibraryView />}
      </div>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer style={{
        padding: "10px 16px",
        borderTop: `1px solid ${c.border}`,
        fontSize: "11px",
        color: c.textMuted,
        textAlign: "center" as const,
      }}>
        {activeTab === "capture" ? "Select text on any page to begin" : "Your personal knowledge base"}
      </footer>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  document.body.style.margin = "0";
  document.body.style.background = c.bg;
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
