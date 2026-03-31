// src/popup/App.tsx

import React from "react";
import ReactDOM from "react-dom/client";

function App() {
  return (
    <div
      style={{
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        background: "#0a0a0a", /* Exact match to gist-bg */
        color: "#ededed",       /* Exact match to gist-text-primary */
        padding: "16px",
        minWidth: "260px",
        minHeight: "140px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        margin: 0,
        boxSizing: "border-box"
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: "12px",
          borderBottom: "1px solid #2a2a2a", /* gist-border */
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#10b981", /* Precise active green */
              boxShadow: "0 0 8px rgba(16, 185, 129, 0.4)"
            }}
          />
          <h1
            style={{
              margin: 0,
              fontSize: "13px",
              fontWeight: 600,
              color: "#ffffff",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Gist
          </h1>
        </div>
        <span
          style={{
            fontSize: "10px",
            color: "#888888",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            padding: "2px 6px",
            background: "#1a1a1a",
            borderRadius: "4px",
            border: "1px solid #2a2a2a"
          }}
        >
          v1.0.0
        </span>
      </header>

      <main style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            color: "#a0a0a0",
            lineHeight: 1.5,
            fontWeight: 400
          }}
        >
          Highlight text on any webpage to generate an instant, contextual explanation.
        </p>

        <div
          style={{
            marginTop: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#141414",
            border: "1px solid #2a2a2a",
            borderRadius: "6px",
            padding: "8px 10px",
          }}
        >
          <span style={{ fontSize: "12px", color: "#888888", fontWeight: 500 }}>
            Quick Trigger
          </span>
          <div style={{ display: "flex", gap: "4px" }}>
            {["Ctrl", "Shift", "E"].map((key) => (
              <kbd
                key={key}
                style={{
                  background: "#1a1a1a",
                  border: "1px solid #3a3a3a",
                  borderBottomWidth: "2px",
                  borderRadius: "4px",
                  padding: "2px 6px",
                  fontSize: "10px",
                  fontFamily: "'Space Mono', 'Fira Code', monospace",
                  color: "#ededed",
                  fontWeight: 600
                }}
              >
                {key}
              </kbd>
            ))}
          </div>
        </div>
      </main>

      <footer
        style={{
          marginTop: "auto",
          paddingTop: "12px",
          fontSize: "11px",
          color: "#555555",
          textAlign: "center"
        }}
      >
        Waiting for highlights...
      </footer>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  // Add a global body reset on mount using a side-effect, as we don't have an external CSS
  document.body.style.margin = "0";
  document.body.style.background = "#0a0a0a";
  
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
