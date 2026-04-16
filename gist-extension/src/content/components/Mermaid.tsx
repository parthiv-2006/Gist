// src/content/components/Mermaid.tsx
// Two modes:
//   1. svg prop — renders the pre-rendered SVG string from the /api/v1/visualize backend.
//   2. chart prop — fallback raw code block, used when ReactMarkdown emits a ```mermaid fence
//      (bundling the mermaid JS library crashes Chrome due to KaTeX BOM / UTF-16 surrogate issues).
import DOMPurify from "dompurify";

const _SVG_ALLOWED_TAGS = [
  "svg","g","path","rect","text","tspan","circle","ellipse","line",
  "polyline","polygon","defs","marker","use","title","desc","clipPath",
  "linearGradient","radialGradient","stop",
];
const _SVG_ALLOWED_ATTR = [
  "class","id","d","fill","stroke","stroke-width","cx","cy","r","rx","ry",
  "x","y","x1","y1","x2","y2","width","height","transform","viewBox","xmlns",
  "marker-end","marker-start","refX","refY","markerWidth","markerHeight",
  "orient","points","opacity","font-size","font-family","text-anchor",
  "dominant-baseline","gradientUnits","offset","stop-color","preserveAspectRatio",
];

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
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg, { ALLOWED_TAGS: _SVG_ALLOWED_TAGS, ALLOWED_ATTR: _SVG_ALLOWED_ATTR }) }}
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
