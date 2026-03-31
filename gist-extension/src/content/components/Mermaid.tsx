// src/content/components/Mermaid.tsx
import { useEffect, useRef } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: true,
  theme: "dark",
  securityLevel: "loose",
  fontFamily: "Inter, sans-serif",
});

interface MermaidProps {
  chart: string;
}

export const Mermaid = ({ chart }: MermaidProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && chart) {
      ref.current.removeAttribute("data-processed");
      mermaid.contentLoaded();
      
      // We need to trigger a re-render/render of the chart
      const renderChart = async () => {
        try {
          const { svg } = await mermaid.render(
            `mermaid-${Math.random().toString(36).substr(2, 9)}`,
            chart
          );
          if (ref.current) {
            ref.current.innerHTML = svg;
          }
        } catch (err) {
          console.error("Mermaid render error:", err);
          if (ref.current) {
            ref.current.innerHTML = `<pre>Error rendering diagram</pre>`;
          }
        }
      };
      renderChart();
    }
  }, [chart]);

  return <div ref={ref} className="mermaid-container" style={{ margin: '10px 0' }} />;
};
