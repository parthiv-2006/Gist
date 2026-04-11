import React, { useEffect, useMemo, useRef, useState } from "react";
import { GistItem, AskResult, AskState } from "../types";
import { BACKEND_BASE, CATEGORY_COLORS, MONO } from "../tokens";
import { GistCard } from "../components/GistCard";
import { IconSearch, IconX, IconSparkle, IconEmptyLibrary, IconChevron, IconTrash, IconExternalLink } from "../icons";
import styles from "./LibraryView.module.css";

// ── GistDrawer ────────────────────────────────────────────────────────────────

interface GistDrawerProps {
  item: GistItem | null;
  open: boolean;
  onClose: () => void;
  onDeleted: (item: GistItem) => void;
}

function GistDrawer({ item, open, onClose, onDeleted }: GistDrawerProps) {
  const [originalOpen, setOriginalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Reset internal state when item changes
  useEffect(() => {
    setOriginalOpen(false);
    setDeleteConfirm(false);
    setDeleting(false);
    setDeleteError(null);
  }, [item?.created_at]);

  if (!item) return null;

  const color = CATEGORY_COLORS[item.category] ?? "#666666";
  const date = new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  let domain = "";
  try { domain = new URL(item.url).hostname; } catch { /* ignore */ }
  const hasUrl = item.url && item.url !== "Unknown page" && domain;

  const handleDelete = async () => {
    if (!item.id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const base = await BACKEND_BASE;
      const r = await fetch(`${base}/library/${item.id}`, { method: "DELETE" });
      if (r.ok) {
        onDeleted(item);
        onClose();
      } else {
        setDeleteError("Delete failed — server returned an error.");
        setDeleting(false);
      }
    } catch {
      setDeleteError("Delete failed — check your connection.");
      setDeleting(false);
    }
  };

  return (
    <>
      {open && <div className={styles.drawerBackdrop} onClick={onClose} />}
      <aside className={`${styles.drawer} ${open ? styles.drawerOpen : ""}`}>
        {/* Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.drawerCategory}>
            <span
              className={styles.drawerCategoryBadge}
              style={{ color, background: `${color}14`, border: `1px solid ${color}32` }}
            >
              {item.category}
            </span>
            <span className={styles.drawerMeta} style={{ fontFamily: MONO }}>{item.mode} · {date}</span>
          </div>
          <button className={styles.drawerCloseBtn} onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>

        {/* Body */}
        <div className={styles.drawerBody}>
          {/* Explanation */}
          <div>
            <p className={styles.drawerSectionLabel}>Explanation</p>
            <p className={styles.drawerExplanation}>{item.explanation}</p>
          </div>

          {/* Original text — collapsible */}
          <div>
            <p className={styles.drawerSectionLabel}>Original text</p>
            <div className={styles.collapseWrapper}>
              <button
                className={styles.collapseToggle}
                onClick={() => setOriginalOpen((v) => !v)}
                aria-expanded={originalOpen}
              >
                <span>{originalOpen ? "Hide" : "Show"} original</span>
                <span style={{ display: "flex", transition: "transform 150ms", transform: originalOpen ? "rotate(180deg)" : "none" }}>
                  <IconChevron open={originalOpen} />
                </span>
              </button>
              {originalOpen && (
                <div className={styles.collapseBody}>{item.original_text}</div>
              )}
            </div>
          </div>

          {/* Source URL */}
          {hasUrl && (
            <div>
              <p className={styles.drawerSectionLabel}>Source</p>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.sourceRow}
              >
                <img
                  className={styles.favicon}
                  src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                  alt=""
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
                <span className={styles.sourceUrl} style={{ fontFamily: MONO }}>{domain}</span>
                <span className={styles.externalIcon}><IconExternalLink /></span>
              </a>
            </div>
          )}
        </div>

        {/* Footer — delete */}
        {item.id && (
          <div className={styles.drawerFooter}>
            {deleteConfirm ? (
              <div className={styles.confirmBanner}>
                <p className={styles.confirmText}>Delete this gist? This cannot be undone.</p>
                {deleteError && <p className={styles.deleteErrorText}>{deleteError}</p>}
                <div className={styles.confirmActions}>
                  <button className={styles.confirmYes} onClick={handleDelete} disabled={deleting}>
                    {deleting ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button className={styles.confirmNo} onClick={() => { setDeleteConfirm(false); setDeleteError(null); }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className={styles.deleteBtn} onClick={() => setDeleteConfirm(true)}>
                <IconTrash />
                Delete gist
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard({ tall = false }: { tall?: boolean }) {
  return (
    <div className={styles.skeletonCard}>
      <div className={styles.skeletonTopRow}>
        <div className={`${styles.skeletonLine} ${styles.skeletonBadge}`} />
        <div className={`${styles.skeletonLine} ${styles.skeletonDate}`} />
      </div>
      <div className={`${styles.skeletonLine} ${styles.skeletonTextFull}`} />
      <div className={`${styles.skeletonLine} ${styles.skeletonTextMid}`} />
      {tall && <div className={`${styles.skeletonLine} ${styles.skeletonTextShort}`} />}
    </div>
  );
}

// ── LibraryView ───────────────────────────────────────────────────────────────

const FILTERS = ["All", ...Object.keys(CATEGORY_COLORS)];

export function LibraryView() {
  const [items, setItems]           = useState<GistItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const [query, setQuery]           = useState("");
  const [askState, setAskState]     = useState<AskState>("idle");
  const [askResult, setAskResult]   = useState<AskResult | null>(null);
  const [askError, setAskError]     = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  const [activeFilter, setFilter]   = useState("All");
  const [selectedItem, setSelected] = useState<GistItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch library
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    BACKEND_BASE.then((base) => {
      fetch(`${base}/library`)
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({})) as { error?: string };
            throw new Error(body.error ?? (r.status === 503
              ? "Library unavailable — is the backend running?"
              : `Failed to load library (${r.status}).`));
          }
          return r.json();
        })
        .then((data) => { if (!cancelled) { setItems(data.items ?? []); setLoading(false); } })
        .catch((e: Error) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    });
    return () => { cancelled = true; };
  }, [retryCount]);

  // Filtered display items
  const displayItems = useMemo(() => {
    const base = askResult ? askResult.sources : items;
    return activeFilter === "All" ? base : base.filter((i) => i.category === activeFilter);
  }, [items, askResult, activeFilter]);

  const handleAsk = async () => {
    const q = query.trim();
    if (!q || askState === "searching") return;
    setAskState("searching");
    setAskResult(null);
    setAskError(null);
    const base = await BACKEND_BASE;
    fetch(`${base}/library/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Search failed (${r.status}).`);
        }
        return r.json();
      })
      .then((data: AskResult) => { setAskResult(data); setAskState("done"); })
      .catch((e: Error) => { setAskError(e.message); setAskState("error"); });
  };

  const handleClearAsk = () => {
    setQuery("");
    setAskState("idle");
    setAskResult(null);
    setAskError(null);
  };

  const handleSelect = (item: GistItem) => {
    setSelected(item);
    setDrawerOpen(true);
  };

  const handleDeleted = (deleted: GistItem) => {
    setItems((prev) => prev.filter((i) => i.id !== deleted.id));
    if (selectedItem?.id === deleted.id) {
      setSelected(null);
      setDrawerOpen(false);
    }
  };

  const handleCloseDrawer = () => setDrawerOpen(false);

  // ── Render ──

  const searchBar = (
    <div
      className={`${styles.searchBar} ${searchFocused || askState === "searching" ? styles.searchBarFocused : ""}`}
    >
      <span className={`${styles.searchIcon} ${askState === "searching" ? styles.searchIconActive : ""}`}>
        <IconSearch />
      </span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleAsk(); }}
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
        placeholder="Ask your library…"
        className={styles.searchInput}
      />
      {askState === "searching" && <div className={styles.searchPulse} />}
      {(askState === "done" || askState === "error") && (
        <button onClick={handleClearAsk} className={styles.clearBtn}><IconX /></button>
      )}
      {askState === "idle" && query.trim() && (
        <button onClick={handleAsk} className={styles.askBtn}>ASK</button>
      )}
    </div>
  );

  const filterPills = (
    <div className={styles.filterRow}>
      {FILTERS.map((f) => (
        <button
          key={f}
          className={`${styles.pill} ${activeFilter === f ? styles.pillActive : ""}`}
          onClick={() => setFilter(f)}
        >
          {f}
        </button>
      ))}
    </div>
  );

  const renderContent = () => {
    // Ask results
    if (askState === "done" && askResult) {
      return (
        <>
          <div className={styles.answerCard}>
            <div className={styles.answerHeader}>
              <span style={{ color: "#10b981", display: "flex" }}><IconSparkle /></span>
              <span className={styles.answerLabel}>Answer</span>
            </div>
            <p className={styles.answerText}>{askResult.answer}</p>
          </div>
          {displayItems.length > 0 && (
            <>
              <p className={styles.sourcesLabel}>Sources · {displayItems.length}</p>
              <div className={styles.masonryGrid}>
                {displayItems.map((item, i) => (
                  <div key={item.id ?? i} className={styles.masonryItem}>
                    <GistCard
                      item={item}
                      variant="grid"
                      onSelect={handleSelect}
                      onDelete={() => { setSelected(item); setDrawerOpen(true); }}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      );
    }

    if (askState === "error") {
      return (
        <div className={styles.errorCard}>
          {askError ?? "Search failed."}
        </div>
      );
    }

    if (loading) {
      return (
        <div className={styles.masonryGrid}>
          {([false, true, false, false, true, false] as boolean[]).map((tall, i) => (
            <div key={i} className={styles.masonryItem}>
              <SkeletonCard tall={tall} />
            </div>
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className={styles.errorCard}>
          {error}
          <br />
          <button className={styles.retryBtn} onClick={() => setRetryCount((n) => n + 1)}>
            Retry
          </button>
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}><IconEmptyLibrary /></span>
          <p className={styles.emptyText}>
            Your library is empty.<br />
            <span className={styles.emptySubText}>Highlight text on any page to save your first gist.</span>
          </p>
        </div>
      );
    }

    if (displayItems.length === 0) {
      return (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>
            No <span style={{ color: "#f0f0f0" }}>{activeFilter}</span> gists found.
          </p>
          <button className={styles.pill} onClick={() => setFilter("All")} style={{ marginTop: 4 }}>
            Clear filter
          </button>
        </div>
      );
    }

    return (
      <div className={styles.masonryGrid}>
        {displayItems.map((item, i) => (
          <div key={item.id ?? i} className={styles.masonryItem}>
            <GistCard
              item={item}
              variant="grid"
              onSelect={handleSelect}
              onDelete={() => { setSelected(item); setDrawerOpen(true); }}
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <p className={styles.toolbarTitle}>Library</p>
        {searchBar}
      </div>

      {filterPills}
      <div className={styles.divider} />

      <div className={`${styles.gridArea} ${drawerOpen ? styles.gridAreaDrawerOpen : ""}`}>
        {renderContent()}
      </div>

      <GistDrawer
        item={selectedItem}
        open={drawerOpen}
        onClose={handleCloseDrawer}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
