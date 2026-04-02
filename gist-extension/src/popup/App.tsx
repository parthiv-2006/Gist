// src/popup/App.tsx

import React from "react";
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

function App() {
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
          {/* Active indicator */}
          <span style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: c.accent,
            boxShadow: `0 0 7px ${c.accentGlow}`,
            display: "inline-block",
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase" as const,
            color: "#ffffff",
          }}>
            Gist
          </span>
        </div>

        <span style={{
          fontSize: "10px",
          color: c.textMuted,
          fontFamily: MONO,
          fontWeight: 500,
          padding: "2px 7px",
          background: c.bgCard,
          border: `1px solid ${c.border}`,
          borderRadius: "4px",
          letterSpacing: "0.02em",
        }}>
          v1.0.0
        </span>
      </header>

      {/* ── Body ────────────────────────────────────────────── */}
      <main style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "14px" }}>

        {/* Description */}
        <p style={{
          margin: 0,
          fontSize: "13px",
          color: "#b0b0b0",
          lineHeight: 1.55,
        }}>
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
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: c.bgCard,
            border: `1px solid ${c.border}`,
            borderRadius: "6px",
            padding: "10px 12px",
            cursor: "pointer",
            textAlign: "left",
            width: "100%",
            transition: "all 150ms ease",
            outline: "none",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = c.accent;
            e.currentTarget.style.background = c.bg;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = c.border;
            e.currentTarget.style.background = c.bgCard;
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "32px",
              height: "32px",
              borderRadius: "6px",
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: c.accent,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 12V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h7" />
                <polyline points="9 9 12 12 9 15" />
                <path d="M12 12h9" />
                <circle cx="18" cy="12" r="3" />
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
                 background: "#1a1a1a",
                 border: `1px solid ${c.borderStrong}`,
                 borderRadius: "3px",
                 padding: "1px 4px",
                 fontSize: "9px",
                 fontFamily: MONO,
                 color: c.textSecondary
               }}>{k}</kbd>
             ))}
          </div>
        </button>

        {/* Keyboard shortcut text */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: c.bgCard,
          border: `1px solid ${c.border}`,
          borderRadius: "6px",
          padding: "9px 12px",
        }}>
          <span style={{ fontSize: "11px", color: c.textSecondary, fontWeight: 500 }}>
            Quick text trigger
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
            {["Ctrl", "Shift", "E"].map((key, i) => (
              <React.Fragment key={key}>
                {i > 0 && (
                  <span style={{ fontSize: "9px", color: c.textMuted, margin: "0 1px" }}>+</span>
                )}
                <kbd style={{
                  background: "#1a1a1a",
                  border: `1px solid ${c.borderStrong}`,
                  borderBottomWidth: "2px",
                  borderRadius: "4px",
                  padding: "2px 6px",
                  fontSize: "10px",
                  fontFamily: MONO,
                  color: c.textPrimary,
                  fontWeight: 600,
                  lineHeight: 1.6,
                  display: "inline-block",
                }}>
                  {key}
                </kbd>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Tip: drag & resize */}
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "8px",
          background: c.bgCard,
          border: `1px solid ${c.border}`,
          borderRadius: "6px",
          padding: "9px 12px",
        }}>
          {/* Drag icon */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
            style={{ flexShrink: 0, marginTop: "1px", color: c.textMuted }}>
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
          <p style={{
            margin: "0 0 8px 0",
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
            color: c.textMuted,
          }}>
            Explanation Modes
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            {MODES.map(({ label, desc }) => (
              <div key={label} style={{
                background: c.bgCard,
                border: `1px solid ${c.border}`,
                borderRadius: "5px",
                padding: "8px 10px",
              }}>
                <div style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: c.textPrimary,
                  marginBottom: "3px",
                }}>
                  {label}
                </div>
                <div style={{
                  fontSize: "10px",
                  color: c.textSecondary,
                  lineHeight: 1.4,
                }}>
                  {desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer style={{
        padding: "10px 16px",
        borderTop: `1px solid ${c.border}`,
        fontSize: "11px",
        color: c.textMuted,
        textAlign: "center" as const,
      }}>
        Select text on any page to begin
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
