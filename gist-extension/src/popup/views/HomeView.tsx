import React, { useEffect, useMemo, useState } from "react";
import { GistItem, TagCount } from "../types";
import { BACKEND_BASE, CATEGORY_COLORS } from "../tokens";
import { IconEmptyLibrary } from "../icons";
import styles from "./HomeView.module.css";

// ── Heatmap builder ────────────────────────────────────────────────────────────

function buildHeatmap(items: GistItem[]): number[][] {
  const counts: Record<string, number> = {};
  items.forEach((item) => {
    const key = item.created_at.slice(0, 10);
    counts[key] = (counts[key] ?? 0) + 1;
  });
  const matrix = Array.from({ length: 52 }, () => Array(7).fill(0));
  const today = new Date();
  for (let w = 0; w < 52; w++) {
    for (let d = 0; d < 7; d++) {
      const daysAgo = (51 - w) * 7 + (6 - d);
      const date = new Date(today);
      date.setDate(today.getDate() - daysAgo);
      matrix[w][d] = counts[date.toISOString().slice(0, 10)] ?? 0;
    }
  }
  return matrix;
}

function heatColor(count: number): string {
  if (count === 0) return "#1a1a1a";
  if (count <= 2) return "rgba(16,185,129,0.22)";
  if (count <= 5) return "rgba(16,185,129,0.45)";
  if (count <= 9) return "rgba(16,185,129,0.7)";
  return "#10b981";
}

function topCategoryFrom(items: GistItem[]): string {
  if (items.length === 0) return "—";
  const freq: Record<string, number> = {};
  items.forEach((i) => { freq[i.category] = (freq[i.category] ?? 0) + 1; });
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
}

function recentCount(items: GistItem[]): number {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return items.filter((i) => new Date(i.created_at).getTime() > cutoff).length;
}

// ── Metric card ────────────────────────────────────────────────────────────────

function MetricCard({ value, label, sub, accent }: { value: string; label: string; sub?: string; accent?: boolean }) {
  return (
    <div className={styles.metricCard}>
      <div className={`${styles.metricValue} ${accent ? styles.metricValueAccent : ""}`}>{value}</div>
      <div className={styles.metricLabel}>{label}</div>
      {sub && <div className={styles.metricSub}>{sub}</div>}
    </div>
  );
}

function SkeletonMetric() {
  return (
    <div className={styles.skeletonCard}>
      <div className={`${styles.skeletonLine} ${styles.skeletonValue}`} />
      <div className={`${styles.skeletonLine} ${styles.skeletonLabel}`} />
    </div>
  );
}

// ── HomeView ───────────────────────────────────────────────────────────────────

interface HomeViewProps {
  onTagClick?: (tag: string) => void;
}

export function HomeView({ onTagClick }: HomeViewProps = {}) {
  const [items, setItems]     = useState<GistItem[]>([]);
  const [topTags, setTopTags] = useState<TagCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    BACKEND_BASE.then((base) => {
      // Fetch library and top tags in parallel
      Promise.all([
        fetch(`${base}/library`).then((r) => r.ok ? r.json() : Promise.reject()),
        fetch(`${base}/library/tags`).then((r) => r.ok ? r.json() : { tags: [] }),
      ])
        .then(([libData, tagsData]) => {
          if (!cancelled) {
            setItems(libData.items ?? []);
            setTopTags((tagsData.tags ?? []).slice(0, 8));
            setLoading(false);
          }
        })
        .catch(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, []);

  const heatmap   = useMemo(() => buildHeatmap(items), [items]);
  const topCat    = useMemo(() => topCategoryFrom(items), [items]);
  const recent    = useMemo(() => recentCount(items), [items]);
  const catCount  = useMemo(() => new Set(items.map((i) => i.category)).size, [items]);
  const catColor  = CATEGORY_COLORS[topCat] ?? "#888888";

  const dayNames = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className={styles.container}>

      {/* ── Metrics ── */}
      <section>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Overview</span>
        </div>
        <div className={styles.metricsRow}>
          {loading ? (
            <>
              <SkeletonMetric />
              <SkeletonMetric />
              <SkeletonMetric />
            </>
          ) : (
            <>
              <MetricCard
                value={String(items.length)}
                label="Total gists saved"
                sub={`across ${catCount} categor${catCount === 1 ? "y" : "ies"}`}
              />
              <MetricCard
                value={topCat}
                label="Top category"
                accent
              />
              <MetricCard
                value={String(recent)}
                label="Saved this week"
                sub="last 7 days"
              />
            </>
          )}
        </div>
      </section>

      {/* ── Activity heatmap ── */}
      <section>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Activity · last 12 months</span>
        </div>
        <div className={styles.heatmapOuter}>
          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(52, minmax(0,1fr))", gap: "3px" }}>
              {Array.from({ length: 52 * 7 }).map((_, i) => (
                <div key={i} style={{ aspectRatio: "1", borderRadius: "2px", background: "#1a1a1a" }} />
              ))}
            </div>
          ) : (
            <div className={styles.heatmapGrid}>
              {heatmap.map((week, w) =>
                week.map((count, d) => {
                  const daysAgo = (51 - w) * 7 + (6 - d);
                  const date = new Date();
                  date.setDate(date.getDate() - daysAgo);
                  const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
                  const day = dayNames[d];
                  return (
                    <div
                      key={`${w}-${d}`}
                      className={styles.heatCell}
                      style={{ backgroundColor: heatColor(count) }}
                      title={count > 0 ? `${count} gist${count > 1 ? "s" : ""} · ${dateStr} (${day})` : `No gists · ${dateStr}`}
                    />
                  );
                })
              )}
            </div>
          )}
          <div className={styles.heatmapLegend}>
            <span className={styles.legendLabel}>Less</span>
            {["#1a1a1a", "rgba(16,185,129,0.22)", "rgba(16,185,129,0.45)", "rgba(16,185,129,0.7)", "#10b981"].map((c, i) => (
              <div key={i} className={styles.legendCell} style={{ background: c }} />
            ))}
            <span className={styles.legendLabel}>More</span>
          </div>
        </div>
      </section>

      {/* ── Insights ── */}
      <section>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Insights</span>
        </div>
        {loading ? (
          <div className={styles.insightsCard}>
            <div style={{ height: "13px", borderRadius: "4px", background: "linear-gradient(90deg, #1a1a1a 25%, #242424 50%, #1a1a1a 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s linear infinite", marginBottom: "8px", width: "80%" }} />
            <div style={{ height: "13px", borderRadius: "4px", background: "linear-gradient(90deg, #1a1a1a 25%, #242424 50%, #1a1a1a 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s linear infinite", width: "60%" }} />
          </div>
        ) : items.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}><IconEmptyLibrary /></span>
            <p className={styles.emptyText}>
              No gists yet.<br />
              Highlight text on any page to save your first gist.
            </p>
          </div>
        ) : (
          <div className={styles.insightsCard}>
            <div className={styles.insightsHeader}>
              <div className={styles.insightsDot} />
              <span className={styles.insightsTitle}>Library summary</span>
            </div>
            <p className={styles.insightsText}>
              You've saved{" "}
              <span className={styles.insightsTextHighlight}>{items.length} gist{items.length !== 1 ? "s" : ""}</span>
              {" "}across{" "}
              <span className={styles.insightsTextHighlight}>{catCount} categor{catCount === 1 ? "y" : "ies"}</span>.
              {" "}Most researched:{" "}
              <span className={styles.insightsTextHighlight} style={{ color: catColor }}>{topCat}</span>.
              {recent > 0 && (
                <>{" "}You've been active this week with{" "}
                  <span className={styles.insightsTextHighlight}>{recent} new save{recent !== 1 ? "s" : ""}</span>.
                </>
              )}
            </p>
          </div>
        )}
      </section>

      {/* ── Top Tags ── */}
      {(loading || topTags.length > 0) && (
        <section>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Top Tags</span>
          </div>
          {loading ? (
            <div className={styles.tagSkeletonRow}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={`${styles.skeletonLine} ${styles.tagSkeletonChip}`} style={{ width: `${48 + i * 12}px` }} />
              ))}
            </div>
          ) : (
            <div className={styles.tagCloudRow}>
              {topTags.map(({ tag, count }) => (
                <button
                  key={tag}
                  className={styles.tagCloudChip}
                  onClick={() => onTagClick?.(tag)}
                  title={`${count} gist${count !== 1 ? "s" : ""} tagged #${tag}`}
                >
                  #{tag}
                  <span className={styles.tagCloudCount}>{count}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

    </div>
  );
}
