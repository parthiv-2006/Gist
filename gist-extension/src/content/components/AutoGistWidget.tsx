// src/content/components/AutoGistWidget.tsx
// Ghost UI ambient reading assistant — shows 3 key takeaways from the current viewport.
// Nearly invisible at rest; reveals on hover.

import React from "react";
import styles from "./AutoGistWidget.module.css";

export type WidgetState = "idle" | "loading" | "ready";

export interface AutoGistWidgetProps {
  state: WidgetState;
  takeaways: string[];
  onDismiss: () => void;
}

export function AutoGistWidget({ state, takeaways, onDismiss }: AutoGistWidgetProps) {
  const widgetClass = [
    styles.widget,
    state === "loading" ? styles.loading : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={widgetClass}>
      <div className={styles.card}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.brand}>
            <div className={`${styles.dot}${state === "loading" ? ` ${styles.pulsing}` : ""}`} />
            <span className={styles.label}>AutoGist</span>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onDismiss}
            title="Dismiss AutoGist"
            aria-label="Dismiss AutoGist"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        {state === "idle" && (
          <p className={styles.hint}>Scroll to auto-summarize</p>
        )}

        {state === "loading" && (
          <div className={styles.loadingSkeleton}>
            <div className={styles.skeletonBar} />
            <div className={styles.skeletonBar} />
            <div className={styles.skeletonBar} />
          </div>
        )}

        {state === "ready" && takeaways.length > 0 && (
          <div className={styles.takeaways}>
            {takeaways.map((point, i) => (
              <div key={i} className={styles.takeaway} style={{ animationDelay: `${i * 60}ms` }}>
                <div className={styles.bullet} />
                <p className={styles.takeawayText}>{point}</p>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
