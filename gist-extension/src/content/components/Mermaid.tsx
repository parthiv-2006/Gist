// src/content/components/Mermaid.tsx
// Two modes:
//   1. svg prop — renders the pre-rendered SVG string from the /api/v1/visualize backend.
//   2. chart prop — fallback raw code block, used when ReactMarkdown emits a ```mermaid fence
//      (bundling the mermaid JS library crashes Chrome due to KaTeX BOM / UTF-16 surrogate issues).

interface MermaidProps {
  chart?: string;
  svg?: string;
}

export const Mermaid = ({ chart, svg }: MermaidProps) => {
  if (svg) {
    return (
      <div
        style={{
          background: "hsla(240,10%,5%,0.6)",
          border: "1px solid hsla(240,10%,30%,0.4)",
          borderRadius: "6px",
          padding: "10px",
          margin: "10px 0",
          overflowX: "auto",
          textAlign: "center",
        }}
        // SVG from mermaid.ink is server-rendered, not user-supplied HTML.
        // It contains no script tags — only path/rect/text SVG elements.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  return (
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
};
