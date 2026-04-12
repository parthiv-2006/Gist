import React, { useEffect, useMemo, useState } from "react";
import { GistItem, TagCount } from "../types";
import { BACKEND_BASE, CATEGORY_COLORS, MONO } from "../tokens";
import { IconEmptyLibrary } from "../icons";
import styles from "./HomeView.module.css";

// ── Helpers ────────────────────────────────────────────────────────────────────

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
  if (count === 0) return "#111111";
  if (count <= 2) return "rgba(16,185,129,0.22)";
  if (count <= 5) return "rgba(16,185,129,0.45)";
  if (count <= 9) return "rgba(16,185,129,0.7)";
  return "#10b981";
}

function relativeDay(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const daysAgo = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

// ── HomeView ───────────────────────────────────────────────────────────────────

interface HomeViewProps {
  onTagClick?: (tag: string) => void;
  onRecallClick?: () => void;
  recallDue?: number;
}

export function HomeView({ onTagClick, onRecallClick, recallDue = 0 }: HomeViewProps = {}) {
  const [items, setItems]     = useState<GistItem[]>([]);
  const [topTags, setTopTags] = useState<TagCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    BACKEND_BASE.then((base) => {
      Promise.all([
        fetch(`${base}/library`).then((r) => (r.ok ? r.json() : Promise.reject())),
        fetch(`${base}/library/tags`).then((r) => (r.ok ? r.json() : { tags: [] })),
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

  const heatmap  = useMemo(() => buildHeatmap(items), [items]);
  const topCat   = useMemo(() => topCategoryFrom(items), [items]);
  const recent   = useMemo(() => recentCount(items), [items]);
  const catCount = useMemo(() => new Set(items.map((i) => i.category)).size, [items]);
  const catColor = CATEGORY_COLORS[topCat] ?? "#888888";

  // Category breakdown (sorted by count, max 5)
  const categoryBreakdown = useMemo(() => {
    const freq: Record<string, number> = {};
    items.forEach((i) => { freq[i.category] = (freq[i.category] ?? 0) + 1; });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, count]) => ({
        cat,
        count,
        pct: items.length > 0 ? (count / items.length) * 100 : 0,
      }));
  }, [items]);

  // Last 7 days bar chart data
  const weeklyBars = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().slice(0, 10);
      const count = items.filter((it) => it.created_at.slice(0, 10) === key).length;
      return {
        count,
        label: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1),
        isToday: i === 6,
      };
    });
  }, [items]);

  // Recent saves grouped by relative day (last 8 items)
  const groupedFeed = useMemo(() => {
    const sorted = [...items]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8);
    const groups: { label: string; items: GistItem[] }[] = [];
    sorted.forEach((item) => {
      const label = relativeDay(item.created_at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(item);
      else groups.push({ label, items: [item] });
    });
    return groups;
  }, [items]);

  const maxBarCount = Math.max(...weeklyBars.map((b) => b.count), 1);

  // ── Render ──

  return (
    <div className={styles.container}>

      {/* ── Hero stat ── */}
      <section>
        {loading ? (
          <div className={styles.heroSkeleton}>
            <div className={`${styles.skeletonLine} ${styles.skHeroNum}`} />
            <div className={`${styles.skeletonLine} ${styles.skHeroSub}`} />
            <div className={`${styles.skeletonLine} ${styles.skHeroMeta}`} />
          </div>
        ) : (
          <>
            <div className={styles.heroNumber}>{items.length}</div>
            <div className={styles.heroLabel}>gists saved</div>
            <div className={styles.heroMeta}>
              {recent > 0 && (
                <span className={styles.heroMetaItem}>
                  <span className={styles.heroMetaHi}>{recent}</span> this week
                </span>
              )}
              {catCount > 0 && recent > 0 && <span className={styles.heroMetaDot}>·</span>}
              {catCount > 0 && (
                <span className={styles.heroMetaItem}>
                  <span className={styles.heroMetaHi}>{catCount}</span>{" "}
                  {catCount === 1 ? "category" : "categories"}
                </span>
              )}
              {topCat !== "—" && catCount > 0 && <span className={styles.heroMetaDot}>·</span>}
              {topCat !== "—" && (
                <span className={styles.heroMetaItem}>
                  top:{" "}
                  <span className={styles.heroMetaHi} style={{ color: catColor }}>
                    {topCat}
                  </span>
                </span>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── Recall prompt ── */}
      {!loading && recallDue > 0 && (
        <div className={styles.recallPrompt}>
          <div className={styles.recallDot} />
          <span className={styles.recallText}>
            <span className={styles.recallCount}>{recallDue}</span>{" "}
            {recallDue === 1 ? "gist" : "gists"} ready to review
          </span>
          <button className={styles.recallBtn} onClick={onRecallClick}>
            Review →
          </button>
        </div>
      )}

      {/* ── Category breakdown ── */}
      {!loading && categoryBreakdown.length > 0 && (
        <section>
          <p className={styles.sectionTitle}>Categories</p>
          <div className={styles.catList}>
            {categoryBreakdown.map(({ cat, count, pct }) => {
              const c = CATEGORY_COLORS[cat] ?? "#666";
              return (
                <div key={cat} className={styles.catRow}>
                  <span className={styles.catLabel} style={{ color: c }}>{cat}</span>
                  <div className={styles.catBarTrack}>
                    <div
                      className={styles.catBar}
                      style={{ width: `${pct}%`, background: c }}
                    />
                  </div>
                  <span className={styles.catCount}>{count}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Last 7 days ── */}
      <section>
        <p className={styles.sectionTitle}>Last 7 days</p>
        {loading ? (
          <div className={styles.barsSkeletonRow}>
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className={`${styles.skeletonLine} ${styles.skBar}`}
                style={{ height: `${16 + (i % 3) * 9}px` }}
              />
            ))}
          </div>
        ) : (
          <div className={styles.barsRow}>
            {weeklyBars.map(({ count, label, isToday }, i) => {
              const h = Math.max((count / maxBarCount) * 36, count > 0 ? 5 : 2);
              return (
                <div key={i} className={styles.barCol}>
                  <div className={styles.barOuter}>
                    <div
                      className={`${styles.bar} ${isToday ? styles.barToday : ""}`}
                      style={{ height: `${h}px`, opacity: count > 0 ? 1 : 0.3 }}
                      title={`${count} gist${count !== 1 ? "s" : ""}`}
                    />
                  </div>
                  <span className={`${styles.barLabel} ${isToday ? styles.barLabelToday : ""}`}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Recent saves ── */}
      {!loading && groupedFeed.length > 0 && (
        <section>
          <p className={styles.sectionTitle}>Recent saves</p>
          <div className={styles.feedList}>
            {groupedFeed.map((group) => (
              <div key={group.label} className={styles.feedGroup}>
                <p className={styles.feedDayLabel}>{group.label}</p>
                {group.items.map((item, i) => {
                  const c = CATEGORY_COLORS[item.category] ?? "#666";
                  return (
                    <div key={item.id ?? i} className={styles.feedItem}>
                      <span
                        className={styles.feedCat}
                        style={{ color: c, background: `${c}12` }}
                      >
                        {item.category}
                      </span>
                      <span className={styles.feedSnippet}>
                        {item.explanation.length > 74
                          ? item.explanation.slice(0, 74) + "…"
                          : item.explanation}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Empty state ── */}
      {!loading && items.length === 0 && (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}><IconEmptyLibrary /></span>
          <p className={styles.emptyText}>
            No gists yet.<br />
            <span style={{ color: "#363636" }}>Highlight text on any page to save your first gist.</span>
          </p>
        </div>
      )}

      {/* ── Activity heatmap ── */}
      <section>
        <p className={styles.sectionTitle}>Activity · last 12 months</p>
        <div className={styles.heatmapOuter}>
          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(52, minmax(0,1fr))", gap: "3px" }}>
              {Array.from({ length: 52 * 7 }).map((_, i) => (
                <div key={i} style={{ aspectRatio: "1", borderRadius: "2px", background: "#111" }} />
              ))}
            </div>
          ) : (
            <div className={styles.heatmapGrid}>
              {heatmap.map((week, w) =>
                week.map((count, d) => {
                  const daysAgo = (51 - w) * 7 + (6 - d);
                  const date = new Date();
                  date.setDate(date.getDate() - daysAgo);
                  const dateStr = date.toLocaleDateString(undefined, {
                    month: "short", day: "numeric", year: "numeric",
                  });
                  return (
                    <div
                      key={`${w}-${d}`}
                      className={styles.heatCell}
                      style={{ backgroundColor: heatColor(count) }}
                      title={count > 0 ? `${count} gist${count > 1 ? "s" : ""} · ${dateStr}` : `No gists · ${dateStr}`}
                    />
                  );
                })
              )}
            </div>
          )}
          <div className={styles.heatmapLegend}>
            <span className={styles.legendLabel}>Less</span>
            {["#111", "rgba(16,185,129,0.22)", "rgba(16,185,129,0.45)", "rgba(16,185,129,0.7)", "#10b981"].map((c, i) => (
              <div key={i} className={styles.legendCell} style={{ background: c }} />
            ))}
            <span className={styles.legendLabel}>More</span>
          </div>
        </div>
      </section>

      {/* ── Top Tags ── */}
      {(loading || topTags.length > 0) && (
        <section>
          <p className={styles.sectionTitle}>Top tags</p>
          {loading ? (
            <div className={styles.tagSkeletonRow}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={`${styles.skeletonLine} ${styles.skTagChip}`}
                  style={{ width: `${46 + i * 14}px` }}
                />
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
                  style={{ fontFamily: MONO }}
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
