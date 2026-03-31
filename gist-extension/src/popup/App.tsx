// src/popup/App.tsx
// Placeholder settings page for the extension popup (MVP — minimal)

import React from "react";
import ReactDOM from "react-dom/client";

function App() {
  return (
    <div
      style={{
        fontFamily: "'Inter', -apple-system, sans-serif",
        background: "hsl(240, 15%, 8%)",
        color: "hsl(220, 30%, 96%)",
        padding: "20px",
        minWidth: "220px",
        minHeight: "120px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: "15px",
          fontWeight: 600,
          color: "hsl(265, 89%, 78%)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        Gist
      </h1>
      <p style={{ margin: 0, fontSize: "12px", color: "hsl(220, 15%, 65%)", lineHeight: 1.5 }}>
        Highlight text on any page, then press{" "}
        <kbd
          style={{
            background: "hsla(240, 15%, 18%, 1)",
            border: "1px solid hsla(265, 50%, 60%, 0.3)",
            borderRadius: "4px",
            padding: "1px 5px",
            fontSize: "11px",
          }}
        >
          Ctrl+Shift+E
        </kbd>{" "}
        or right-click → <em>Gist this</em>.
      </p>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
