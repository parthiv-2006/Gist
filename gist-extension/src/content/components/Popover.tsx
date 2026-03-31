// src/content/components/Popover.tsx
import React, { useEffect } from "react";
import styles from "./Popover.module.css";

export type PopoverState = "IDLE" | "LOADING" | "STREAMING" | "DONE" | "ERROR";

export interface PopoverProps {
  state: PopoverState;
  text: string;
  error?: string;
  position?: DOMRect;
  onClose: () => void;
}

export function Popover({ state, text, error, position, onClose }: PopoverProps) {
  // Close on Escape key
  useEffect(() => {
    if (state === "IDLE") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [state, onClose]);

  // Close on click outside
  useEffect(() => {
    if (state === "IDLE") return;

    const handleClickOutside = (e: MouseEvent) => {
      const host = document.getElementById("gist-shadow-host");
      if (host && !host.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [state, onClose]);

  if (state === "IDLE") return null;

  const style: React.CSSProperties = position
    ? {
        top: `${getPopoverTop(position)}px`,
        left: `${getPopoverLeft(position)}px`,
      }
    : { top: "20px", left: "20px" };

  return (
    <div
      className={styles.popover}
      role="dialog"
      aria-label="Gist explanation"
      aria-live="polite"
      style={style}
    >
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.brand}>GIST</span>
        <button
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      {state === "LOADING" && (
        <div className={styles.skeleton} data-testid="gist-skeleton" aria-label="Loading explanation">
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLine} />
        </div>
      )}

      {(state === "STREAMING" || state === "DONE") && (
        <p className={`${styles.explanation} ${state === "STREAMING" ? styles.streaming : ""}`}>
          {text}
        </p>
      )}

      {state === "ERROR" && (
        <div className={styles.errorCard} role="alert">
          <p>{error ?? "Something went wrong."}</p>
          <p className={styles.errorHint}>Try highlighting a shorter passage.</p>
        </div>
      )}
    </div>
  );
}

// ─── Positioning helpers ─────────────────────────────────────────────────────

const POPOVER_WIDTH = 320;
const POPOVER_EST_HEIGHT = 200;
const MARGIN = 12;

function getPopoverTop(rect: DOMRect): number {
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < POPOVER_EST_HEIGHT + MARGIN) {
    // Flip above
    return rect.top + window.scrollY - POPOVER_EST_HEIGHT - MARGIN;
  }
  return rect.bottom + window.scrollY + MARGIN;
}

function getPopoverLeft(rect: DOMRect): number {
  const left = rect.left + window.scrollX;
  const clamped = Math.min(left, window.innerWidth - POPOVER_WIDTH - MARGIN);
  return Math.max(MARGIN, clamped);
}
