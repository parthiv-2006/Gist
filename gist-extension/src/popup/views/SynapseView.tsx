import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SynapseNode, SynapseResponse } from "../types";
import { getBackendBase } from "../tokens";
import styles from "./SynapseView.module.css";

// 12-color palette for clusters
const CLUSTER_PALETTE = [
  "#10b981", "#6366f1", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
  "#84cc16", "#14b8a6", "#a855f7", "#3b82f6",
];
const clColor = (id: number) => CLUSTER_PALETTE[id % CLUSTER_PALETTE.length];

interface Txfm { x: number; y: number; scale: number }

export function SynapseView() {
  const [data, setData]         = useState<SynapseResponse | null>(null);
  const [noCache, setNoCache]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Pan / zoom
  const [txfm, setTxfm]         = useState<Txfm>({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ mx: 0, my: 0, tx: 0, ty: 0 });

  // Interaction
  const [hovered, setHovered]       = useState<SynapseNode | null>(null);
  const [mousePos, setMousePos]     = useState({ x: 0, y: 0 });
  const [focusCluster, setFocus]    = useState<number | null>(null);
  const [textFilter, setTextFilter] = useState("");
  const [timeRange, setTimeRange]   = useState<[number, number]>([0, 100]);

  const containerRef = useRef<HTMLDivElement>(null);

  // ── Fetch cached graph ──────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNoCache(false);
    (async () => {
      try {
        const base = await getBackendBase();
        const r = await fetch(`${base}/synapse/graph`);
        if (r.status === 404) {
          if (!cancelled) { setNoCache(true); setLoading(false); }
          return;
        }
        if (!r.ok) {
          const b = await r.json().catch(() => ({})) as { error?: string };
          throw new Error(b.error ?? `Server error (${r.status})`);
        }
        const d = await r.json() as SynapseResponse;
        if (!cancelled) { setData(d); setLoading(false); }
      } catch (e) {
        if (!cancelled) { setError((e as Error).message); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Compute graph ───────────────────────────────────────────────────────────

  const handleCompute = useCallback(async () => {
    setComputing(true);
    setError(null);
    try {
      const base = await getBackendBase();
      const r = await fetch(`${base}/synapse/compute`, { method: "POST" });
      const b = await r.json() as { graph?: SynapseResponse["graph"]; meta?: SynapseResponse["meta"]; retry_after?: number; error?: string };
      if (!r.ok) {
        setError(
          r.status === 429
            ? `Rate limited — retry in ${Math.ceil(b.retry_after ?? 60)}s`
            : (b.error ?? "Compute failed.")
        );
      } else {
        setData({ graph: b.graph!, meta: b.meta!, stale: false });
        setNoCache(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setComputing(false);
    }
  }, []);

  // ── Derived data ────────────────────────────────────────────────────────────

  const nodeById = useMemo(() => {
    const m = new Map<string, SynapseNode>();
    (data?.graph?.nodes ?? []).forEach((n) => m.set(n.id, n));
    return m;
  }, [data]);

  const { minTs, maxTs } = useMemo(() => {
    const ns = data?.graph?.nodes ?? [];
    if (!ns.length) return { minTs: 0, maxTs: 1 };
    const ts = ns.map((n) => new Date(n.created_at).getTime());
    return { minTs: Math.min(...ts), maxTs: Math.max(...ts) };
  }, [data]);

  const activeIds = useMemo(() => {
    const ns = data?.graph?.nodes ?? [];
    const span = maxTs - minTs || 1;
    const loTs = minTs + (timeRange[0] / 100) * span;
    const hiTs = minTs + (timeRange[1] / 100) * span;
    const q = textFilter.toLowerCase();
    return new Set(
      ns
        .filter((n) => {
          const ts = new Date(n.created_at).getTime();
          return (
            ts >= loTs && ts <= hiTs &&
            (focusCluster === null || n.cluster_id === focusCluster) &&
            (!q ||
              n.title.toLowerCase().includes(q) ||
              n.snippet.toLowerCase().includes(q) ||
              n.category.toLowerCase().includes(q))
          );
        })
        .map((n) => n.id)
    );
  }, [data, timeRange, minTs, maxTs, textFilter, focusCluster]);

  // ── Pan / zoom handlers ─────────────────────────────────────────────────────

  // Non-passive wheel listener — React's synthetic onWheel is passive by default
  // in React 17+, making e.preventDefault() a no-op and allowing page scroll.
  // Attaching a native listener with { passive: false } gives us real prevention.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      setTxfm((p) => ({ ...p, scale: Math.max(0.1, Math.min(6, p.scale * factor)) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      dragRef.current = { mx: e.clientX, my: e.clientY, tx: txfm.x, ty: txfm.y };
    },
    [txfm]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      if (!dragging) return;
      setTxfm((p) => ({
        ...p,
        x: dragRef.current.tx + (e.clientX - dragRef.current.mx),
        y: dragRef.current.ty + (e.clientY - dragRef.current.my),
      }));
    },
    [dragging]
  );

  const stopDrag = useCallback(() => setDragging(false), []);

  // ── Loading / empty / error states ─────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.centerState}>
          <div className={styles.spinner} />
          <p className={styles.stateText}>Loading knowledge graph…</p>
        </div>
      </div>
    );
  }

  if (noCache) {
    return (
      <div className={styles.container}>
        <div className={styles.centerState}>
          <svg className={styles.emptyIllus} viewBox="0 0 120 120" fill="none">
            <circle cx="60" cy="22" r="10" stroke="#10b981" strokeWidth="1.5" />
            <circle cx="20" cy="95" r="10" stroke="#10b981" strokeWidth="1.5" />
            <circle cx="100" cy="95" r="10" stroke="#10b981" strokeWidth="1.5" />
            <circle cx="60" cy="65" r="7"  stroke="#6366f1" strokeWidth="1.5" />
            <line x1="60" y1="32" x2="60" y2="58"  stroke="#10b981" strokeOpacity=".4" strokeWidth="1" />
            <line x1="60" y1="32" x2="20" y2="85"  stroke="#10b981" strokeOpacity=".3" strokeWidth="1" />
            <line x1="60" y1="32" x2="100" y2="85" stroke="#10b981" strokeOpacity=".3" strokeWidth="1" />
            <line x1="60" y1="72" x2="20" y2="85"  stroke="#6366f1" strokeOpacity=".25" strokeWidth="1" />
            <line x1="60" y1="72" x2="100" y2="85" stroke="#6366f1" strokeOpacity=".25" strokeWidth="1" />
            <line x1="30" y1="95" x2="90" y2="95"  stroke="#10b981" strokeOpacity=".2" strokeWidth="1" />
          </svg>
          <p className={styles.emptyTitle}>No knowledge graph yet</p>
          <p className={styles.emptySubtext}>
            Build a graph to discover how your saved gists connect by semantic similarity.
          </p>
          <button className={styles.computeBtn} onClick={handleCompute} disabled={computing}>
            {computing ? <><span className={styles.spinnerInline} />Computing…</> : "Build Knowledge Graph"}
          </button>
          {error && <p className={styles.errorText}>{error}</p>}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={styles.container}>
        <div className={styles.centerState}>
          <p className={styles.errorText}>{error}</p>
          <button className={styles.computeBtn} onClick={handleCompute}>
            Retry Compute
          </button>
        </div>
      </div>
    );
  }

  // ── Graph render ────────────────────────────────────────────────────────────

  const { graph, meta, stale } = data!;
  const { nodes, edges, clusters, canvas } = graph;
  const PAD = 60;
  const svgW = canvas.width  + PAD * 2;
  const svgH = canvas.height + PAD * 2;
  const VB   = `${-PAD} ${-PAD} ${svgW} ${svgH}`;

  const containerW = containerRef.current?.clientWidth ?? 600;

  return (
    <div className={styles.container}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.title}>Synapse</h2>
          <div className={styles.metaRow}>
            <span className={styles.metaBadge}>{meta.rendered_count} nodes</span>
            <span className={styles.metaBadge}>{meta.edge_count} edges</span>
            <span className={styles.metaBadge}>{meta.cluster_count} clusters</span>
            {stale && <span className={styles.staleBadge}>Stale · recompute recommended</span>}
          </div>
        </div>
        <button className={styles.computeBtn} onClick={handleCompute} disabled={computing}>
          {computing ? <><span className={styles.spinnerInline} />Computing…</> : "Recompute"}
        </button>
      </header>

      {/* ── Controls ── */}
      <div className={styles.controls}>
        <div className={styles.filterWrap}>
          <svg className={styles.filterIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="6.5" cy="6.5" r="4.5" />
            <line x1="10" y1="10" x2="14" y2="14" />
          </svg>
          <input
            className={styles.filterInput}
            type="text"
            placeholder="Filter nodes…"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
          />
          {textFilter && (
            <button className={styles.clearX} onClick={() => setTextFilter("")} aria-label="Clear filter">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" />
              </svg>
            </button>
          )}
        </div>

        {minTs !== maxTs && (
          <div className={styles.timeline}>
            <span className={styles.tlLabel}>
              {new Date(minTs + (timeRange[0] / 100) * (maxTs - minTs)).toLocaleDateString(undefined, { month: "short", year: "2-digit" })}
            </span>
            <div className={styles.sliderStack}>
              <input
                type="range"
                className={styles.tlSlider}
                min={0} max={100} value={timeRange[0]}
                onChange={(e) => setTimeRange((prev) => [Math.min(+e.target.value, prev[1] - 1), prev[1]])}
              />
              <input
                type="range"
                className={styles.tlSlider}
                min={0} max={100} value={timeRange[1]}
                onChange={(e) => setTimeRange((prev) => [prev[0], Math.max(+e.target.value, prev[0] + 1)])}
              />
            </div>
            <span className={styles.tlLabel}>
              {new Date(minTs + (timeRange[1] / 100) * (maxTs - minTs)).toLocaleDateString(undefined, { month: "short", year: "2-digit" })}
            </span>
          </div>
        )}
      </div>

      {/* ── Canvas ── */}
      <div
        className={`${styles.canvasWrap} ${dragging ? styles.canvasDragging : ""}`}
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
      >
        {/* Transformed SVG layer */}
        <div
          className={styles.svgInner}
          style={{
            transform: `translate(calc(-50% + ${txfm.x}px), calc(-50% + ${txfm.y}px)) scale(${txfm.scale})`,
            width: svgW,
            height: svgH,
          }}
        >
          <svg
            width={svgW}
            height={svgH}
            viewBox={VB}
            className={styles.svg}
          >
            <defs>
              <filter id="syn-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Edges */}
            {edges.map((edge, i) => {
              const src = nodeById.get(edge.source);
              const tgt = nodeById.get(edge.target);
              if (!src || !tgt) return null;
              const active = activeIds.has(src.id) && activeIds.has(tgt.id);
              return (
                <line
                  key={i}
                  x1={src.x} y1={src.y}
                  x2={tgt.x} y2={tgt.y}
                  stroke={active ? clColor(src.cluster_id) : "#ffffff"}
                  strokeOpacity={active ? Math.max(0.07, edge.weight * 0.2) : 0.022}
                  strokeWidth={active ? 1 : 0.5}
                />
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const active  = activeIds.has(node.id);
              const isHov   = hovered?.id === node.id;
              const color   = clColor(node.cluster_id);
              const r       = isHov ? 8 : (active ? 5.5 : 4);
              return (
                <g key={node.id}>
                  {isHov && (
                    <circle
                      cx={node.x} cy={node.y} r={16}
                      fill={color} fillOpacity={0.1}
                      style={{ pointerEvents: "none" }}
                      filter="url(#syn-glow)"
                    />
                  )}
                  <circle
                    cx={node.x} cy={node.y} r={r}
                    fill={color}
                    fillOpacity={active ? (isHov ? 1 : 0.82) : 0.16}
                    stroke={active ? color : "transparent"}
                    strokeWidth={isHov ? 2 : 0.5}
                    strokeOpacity={isHov ? 1 : 0.35}
                    style={{ cursor: "pointer", transition: "r 100ms ease, fill-opacity 180ms ease" }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onMouseEnter={(e) => {
                      setHovered(node);
                      const rect = containerRef.current?.getBoundingClientRect();
                      if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                    }}
                    onMouseMove={(e) => {
                      const rect = containerRef.current?.getBoundingClientRect();
                      if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                    }}
                    onMouseLeave={() => setHovered(null)}
                  />
                </g>
              );
            })}

            {/* Cluster centroid labels */}
            {clusters.map((cl) => {
              const faded = focusCluster !== null && focusCluster !== cl.id;
              return (
                <text
                  key={cl.id}
                  x={cl.centroid.x}
                  y={cl.centroid.y - 24}
                  textAnchor="middle"
                  fill={clColor(cl.id)}
                  fillOpacity={faded ? 0.18 : 0.6}
                  fontSize={9}
                  fontWeight={700}
                  letterSpacing="0.05em"
                  style={{
                    pointerEvents: "none",
                    userSelect: "none",
                    fontFamily: "'Inter', -apple-system, sans-serif",
                    textTransform: "uppercase",
                  }}
                >
                  {cl.label}
                </text>
              );
            })}
          </svg>
        </div>

        {/* Hover tooltip */}
        {hovered && (
          <div
            className={styles.tooltip}
            style={{
              left: Math.min(mousePos.x + 16, containerW - 220),
              top: Math.max(mousePos.y - 90, 8),
            }}
          >
            <div className={styles.ttCategory} style={{ color: clColor(hovered.cluster_id) }}>
              {hovered.category} · {hovered.mode}
            </div>
            <div className={styles.ttTitle}>{hovered.title}</div>
            <div className={styles.ttSnippet}>{hovered.snippet}</div>
            <div className={styles.ttDate}>
              {new Date(hovered.created_at).toLocaleDateString(undefined, {
                month: "short", day: "numeric", year: "numeric",
              })}
            </div>
          </div>
        )}

        {/* Zoom controls */}
        <div className={styles.zoomCtrl}>
          <button className={styles.zBtn} title="Zoom in"  aria-label="Zoom in"  onClick={() => setTxfm((p) => ({ ...p, scale: Math.min(6, p.scale * 1.25) }))}>+</button>
          <button className={styles.zBtn} title="Zoom out" aria-label="Zoom out" onClick={() => setTxfm((p) => ({ ...p, scale: Math.max(0.1, p.scale * 0.8) }))}>−</button>
          <button className={styles.zBtn} title="Reset view" aria-label="Reset view" onClick={() => setTxfm({ x: 0, y: 0, scale: 1 })}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="9" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Cluster legend ── */}
      <div className={styles.legend}>
        <button
          className={`${styles.legendChip} ${focusCluster === null ? styles.legendChipActive : ""}`}
          onClick={() => setFocus(null)}
        >
          All
        </button>
        {clusters.map((cl) => (
          <button
            key={cl.id}
            className={`${styles.legendChip} ${focusCluster === cl.id ? styles.legendChipActive : ""}`}
            onClick={() => setFocus((prev) => (prev === cl.id ? null : cl.id))}
          >
            <span className={styles.legendDot} style={{ background: clColor(cl.id) }} />
            {cl.label}
            <span className={styles.legendSz}>{cl.size}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
