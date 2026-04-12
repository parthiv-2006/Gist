import React, { useState } from "react";
import { GistItem } from "../types";
import { CATEGORY_COLORS, MONO } from "../tokens";
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

export function GistCard({ item, variant = "list", expanded = false, onToggle, onSelect, onDelete }: GistCardProps) {
  const [hovered, setHovered] = useState(false);
  const color = CATEGORY_COLORS[item.category] ?? "#666666";
  const date  = new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const handleClick = () => {
    if (variant === "grid") {
      onSelect?.(item);
    } else {
      onToggle?.();
    }
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

      {/* Preview text — AI explanation is the value; show it first */}
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
          <p className={styles.originalLabel}>Original</p>
          <p className={styles.explanationText}>{item.original_text}</p>
          {item.url && item.url !== "Unknown page" && (
            <p className={styles.urlText} style={{ fontFamily: MONO }}>{item.url}</p>
          )}
        </div>
      )}
    </div>
  );
}
