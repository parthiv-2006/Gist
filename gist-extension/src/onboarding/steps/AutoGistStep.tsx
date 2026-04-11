import React, { useEffect, useState } from "react";
import styles from "./AutoGistStep.module.css";

type Phase = "reading" | "detecting" | "widget" | "takeaway" | "done";

const TAKEAWAY =
  "CRISPR-Cas9 enables precise DNA editing with major medical and agricultural potential, " +
  "but heritable germline modifications raise unresolved ethical questions worldwide.";

export function AutoGistStep({ onNext }: { onNext: () => void }) {
  const [phase, setPhase] = useState<Phase>("reading");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("detecting"), 1800);
    const t2 = setTimeout(() => setPhase("widget"),    2800);
    const t3 = setTimeout(() => setPhase("takeaway"),  4200);
    const t4 = setTimeout(() => setPhase("done"),      6000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  return (
    <div className={styles.root}>
      {/* Step header */}
      <div className={styles.header}>
        <span className={styles.stepBadge}>Step 2 of 3</span>
        <h2 className={styles.title}>AutoGist watches as you read</h2>
        <p className={styles.subtitle}>
          While you scroll through a page, AutoGist quietly detects key
          content and surfaces a one-line takeaway — no clicks needed.
        </p>
      </div>

      {/* Simulated browser viewport */}
      <div className={styles.viewport}>
        {/* Fake browser chrome */}
        <div className={styles.browserBar}>
          <div className={styles.browserDots}>
            <span /><span /><span />
          </div>
          <div className={styles.browserUrl}>nature.com/articles/d41586</div>
        </div>

        {/* Page content */}
        <div className={styles.pageContent}>
          <div className={styles.articleHeader}>
            <div className={styles.articleTag}>Biology</div>
            <h3 className={styles.articleTitle}>
              CRISPR-Cas9: Rewriting the Code of Life
            </h3>
          </div>

          <p className={styles.articleBody}>
            The discovery of CRISPR-Cas9 as a precision gene editing tool has
            profound implications for both medicine and agriculture. Scientists can
            now modify DNA sequences with unprecedented accuracy, opening pathways
            to eliminate hereditary diseases, engineer drought-resistant crops, and
            potentially revive extinct species.
          </p>

          <p className={`${styles.articleBody} ${styles.articleBodyFaded}`}>
            However, ethical concerns around germline editing — modifications that
            are heritable by future generations — have prompted intense international
            debate among researchers, bioethicists, and policymakers.
          </p>

          {/* Scroll indicator lines (fake content) */}
          <div className={styles.skeletonLines}>
            {[0.9, 0.7, 0.85, 0.6, 0.75].map((w, i) => (
              <div
                key={i}
                className={styles.skeletonLine}
                style={{ width: `${w * 100}%` }}
              />
            ))}
          </div>
        </div>

        {/* AutoGist scroll indicator */}
        {(phase === "detecting" || phase === "widget" || phase === "takeaway" || phase === "done") && (
          <div className={styles.scrollIndicator}>
            <div className={styles.scrollDot} />
            Gist detected content
          </div>
        )}

        {/* AutoGist floating widget */}
        {(phase === "widget" || phase === "takeaway" || phase === "done") && (
          <div className={`${styles.widget} ${phase !== "widget" ? styles.widgetExpanded : ""}`}>
            <div className={styles.widgetHeader}>
              <span className={styles.widgetIcon}>⚡</span>
              <span className={styles.widgetLabel}>AutoGist</span>
              {phase === "widget" && (
                <div className={styles.widgetSpinner}>
                  <div className={styles.spinnerRing} />
                </div>
              )}
            </div>

            {(phase === "takeaway" || phase === "done") && (
              <p className={styles.widgetTakeaway}>{TAKEAWAY}</p>
            )}
          </div>
        )}
      </div>

      {/* Next button */}
      {phase === "done" && (
        <button className={styles.nextBtn} onClick={onNext}>
          Next: All features
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="8" x2="13" y2="8" />
            <polyline points="9,4 13,8 9,12" />
          </svg>
        </button>
      )}
    </div>
  );
}
