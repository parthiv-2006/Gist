// src/content/components/Mermaid.tsx
// Renders mermaid diagram source as a styled code block.
// The mermaid JS library is intentionally NOT imported here — bundling it
// pulls in KaTeX which injects unpaired UTF-16 surrogates and an internal BOM
// into the output, causing Chrome to reject content.js as non-UTF-8.

interface MermaidProps {
  chart: string;
}

export const Mermaid = ({ chart }: MermaidProps) => (
  <pre
    style={{
      background: "hsla(240,10%,5%,0.6)",
      border: "1px solid hsla(240,10%,30%,0.4)",
      borderRadius: "6px",
      padding: "10px 12px",
      fontSize: "0.82em",
      fontFamily: "'Fira Code', monospace",
      overflowX: "auto",
      margin: "10px 0",
      whiteSpace: "pre",
      color: "var(--gist-text-secondary)",
    }}
  >
    {chart}
  </pre>
);
