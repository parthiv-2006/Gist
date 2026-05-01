import React, { useState } from "react";
import { GistItem } from "../types";
import { BACKEND_BASE, CATEGORY_COLORS, MONO } from "../tokens";
import { IconChevron } from "../icons";
import styles from "./GistCard.module.css";

interface GistCardProps {
  item: GistItem;
  /** list = popup inline expand; grid = dashboard grid (calls onSelect) */
  variant?: "list" | "grid";
  expanded?: boolean;
  onToggle?: () => void;
  onSelect?: (item: GistItem) => void;
  onDelete?: () => void;
}

type RecallState = "idle" | "loading" | "editing";
type RecallCard = { front: string; back: string; is_custom: boolean; created_at: string };

async function getApiKey(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["geminiApiKey"], (res) => {
      resolve(res["geminiApiKey"] || null);
    });
  });
}

export function GistCard({ item, variant = "list", expanded = false, onToggle, onSelect, onDelete }: GistCardProps) {
  const [hovered, setHovered] = useState(false);
  const [recallCard, setRecallCard] = useState<RecallCard | null>(item.recall_card ?? null);
  const [recallState, setRecallState] = useState<RecallState>("idle");
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [recallError, setRecallError] = useState<string | null>(null);

  const color = CATEGORY_COLORS[item.category] ?? "#666666";
  const date  = new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const handleClick = () => {
    if (variant === "grid") {
      onSelect?.(item);
    } else {
      onToggle?.();
    }
  };

  const handleAutoRecall = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.id) return;
    setRecallState("loading");
    setRecallError(null);
    try {
      const [base, apiKey] = await Promise.all([BACKEND_BASE, getApiKey()]);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["X-Gemini-Api-Key"] = apiKey;
      const res = await fetch(`${base}/library/${item.id}/recall`, { method: "POST", headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setRecallCard(data.recall_card);
    } catch (err) {
      setRecallError(err instanceof Error ? err.message : "Failed to generate card");
    } finally {
      setRecallState("idle");
    }
  };

  const handleSaveCustom = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.id || !editFront.trim() || !editBack.trim()) return;
    setRecallState("loading");
    setRecallError(null);
    try {
      const base = await BACKEND_BASE;
      const res = await fetch(`${base}/library/${item.id}/recall`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front: editFront.trim(), back: editBack.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setRecallCard(data.recall_card);
      setRecallState("idle");
    } catch (err) {
      setRecallError(err instanceof Error ? err.message : "Failed to save card");
      setRecallState("editing");
    }
  };

  const handleDeleteRecall = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.id) return;
    try {
      const base = await BACKEND_BASE;
      await fetch(`${base}/library/${item.id}/recall`, { method: "DELETE" });
      setRecallCard(null);
    } catch { /* silent */ }
  };

  const openEditor = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditFront(recallCard?.front ?? "");
    setEditBack(recallCard?.back ?? "");
    setRecallError(null);
    setRecallState("editing");
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRecallState("idle");
    setRecallError(null);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`${styles.card} ${variant === "list" ? styles.cardList : ""} ${expanded ? styles.cardExpanded : ""} ${hovered ? styles.cardHovered : ""}`}
      style={variant === "list" ? { "--card-accent": color } as React.CSSProperties : undefined}
    >
      {/* Top row */}
      <div className={styles.topRow}>
        <div className={styles.topLeft}>
          <span
            className={styles.categoryBadge}
            style={{
              color,
              background: `${color}14`,
              border: `1px solid ${color}32`,
            }}
          >
            {item.category}
          </span>
          <span className={styles.modeTag} style={{ fontFamily: MONO }}>
            {item.mode}
          </span>
          {item.gist_type === "visual" && (
            <span className={styles.visualBadge} title="Visual capture">Visual</span>
          )}
          {recallCard && (
            <span className={styles.recallBadge} title="Has recall card">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              Card
            </span>
          )}
        </div>
        <div className={styles.topRight}>
          <span className={styles.dateText}>{date}</span>
          {variant === "list" && (
            <span className={styles.chevron}>
              <IconChevron open={expanded} />
            </span>
          )}
          {variant === "grid" && hovered && onDelete && (
            <button
              className={styles.deleteBtn}
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              aria-label="Delete gist"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Preview text */}
      <p className={`${styles.previewText} ${expanded && variant === "list" ? styles.previewExpanded : ""}`}>
        {item.explanation}
      </p>

      {/* Tag chips */}
      {item.tags && item.tags.length > 0 && (
        <div className={styles.tagRow}>
          {item.tags.map((tag) => (
            <span key={tag} className={styles.tagChip}>#{tag}</span>
          ))}
        </div>
      )}

      {/* Expanded body — list mode only */}
      {expanded && variant === "list" && (
        <div className={styles.expandedBody}>
          {/* Original / Screenshot */}
          <p className={styles.originalLabel}>
            {item.gist_type === "visual" ? "Screenshot" : "Original"}
          </p>
          {item.gist_type === "visual" && item.image_data ? (
            <img
              src={`data:image/png;base64,${item.image_data}`}
              alt="Visual capture"
              className={styles.captureImage}
            />
          ) : (
            <p className={styles.explanationText}>{item.original_text}</p>
          )}
          {item.url && item.url !== "Unknown page" && (
            <p className={styles.urlText} style={{ fontFamily: MONO }}>{item.url}</p>
          )}

          {/* ── Recall Card Section ── */}
          <div className={styles.recallSection} onClick={(e) => e.stopPropagation()}>
            <div className={styles.recallSectionHeader}>
              <p className={styles.recallSectionLabel}>Recall Card</p>
              {recallCard?.is_custom && <span className={styles.customTag}>custom</span>}
            </div>

            {recallState === "loading" && (
              <p className={styles.recallLoading}>Generating…</p>
            )}

            {recallState === "editing" && (
              <div className={styles.recallEditor}>
                <label className={styles.recallFieldLabel}>Front — question</label>
                <textarea
                  className={styles.recallTextarea}
                  value={editFront}
                  onChange={(e) => setEditFront(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="What question should this card test?"
                />
                <label className={styles.recallFieldLabel}>Back — answer</label>
                <textarea
                  className={styles.recallTextarea}
                  value={editBack}
                  onChange={(e) => setEditBack(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="What is the answer?"
                />
                {recallError && <p className={styles.recallError}>{recallError}</p>}
                <div className={styles.recallActions}>
                  <button className={styles.recallSaveBtn} onClick={handleSaveCustom}
                    disabled={!editFront.trim() || !editBack.trim()}>
                    Save card
                  </button>
                  <button className={styles.recallCancelBtn} onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            )}

            {recallState === "idle" && recallCard && (
              <div className={styles.recallPreview}>
                <div className={styles.recallQA}>
                  <div className={styles.recallSide}>
                    <span className={styles.recallSideLabel}>Q</span>
                    <p className={styles.recallText}>{recallCard.front}</p>
                  </div>
                  <div className={styles.recallSide}>
                    <span className={styles.recallSideLabel}>A</span>
                    <p className={styles.recallText}>{recallCard.back}</p>
                  </div>
                </div>
                {recallError && <p className={styles.recallError}>{recallError}</p>}
                <div className={styles.recallActions}>
                  <button className={styles.recallEditBtn} onClick={openEditor}>Edit</button>
                  <button className={styles.recallRemoveBtn} onClick={handleDeleteRecall}>Remove card</button>
                </div>
              </div>
            )}

            {recallState === "idle" && !recallCard && (
              <div className={styles.recallEmpty}>
                {recallError && <p className={styles.recallError}>{recallError}</p>}
                <div className={styles.recallActions}>
                  <button className={styles.recallAutoBtn} onClick={handleAutoRecall}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    Auto
                  </button>
                  <button className={styles.recallCustomBtn} onClick={(e) => { e.stopPropagation(); setEditFront(""); setEditBack(""); setRecallError(null); setRecallState("editing"); }}>
                    + Custom
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
