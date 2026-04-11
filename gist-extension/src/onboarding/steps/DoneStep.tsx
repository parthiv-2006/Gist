import React, { useEffect, useState } from "react";
import styles from "./DoneStep.module.css";

export function DoneStep() {
  const [checkVisible, setCheckVisible] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setCheckVisible(true), 100);
    const t2 = setTimeout(() => setContentVisible(true), 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const handleStart = () => {
    try {
      chrome.storage.local.set({ onboardingComplete: true });
    } catch { /* non-extension context */ }
    window.close();
  };

  return (
    <div className={styles.root}>
      {/* Animated checkmark */}
      <div className={`${styles.checkWrap} ${checkVisible ? styles.checkVisible : ""}`}>
        <svg
          className={styles.checkCircle}
          viewBox="0 0 80 80"
          fill="none"
        >
          <circle
            cx="40" cy="40" r="36"
            stroke="#10b981"
            strokeWidth="2"
            className={styles.circleAnim}
          />
          <polyline
            points="24,40 35,52 56,28"
            stroke="#10b981"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={styles.checkmarkAnim}
          />
        </svg>
        <div className={styles.glowRing} />
      </div>

      {/* Content */}
      <div className={`${styles.content} ${contentVisible ? styles.contentVisible : ""}`}>
        <h2 className={styles.title}>You're all set!</h2>
        <p className={styles.subtitle}>
          Start reading anything on the web. Gist is ready whenever you need it.
        </p>

        {/* Keyboard shortcut callout */}
        <div className={styles.shortcutCard}>
          <div className={styles.shortcutLabel}>Quick access</div>
          <div className={styles.shortcutRow}>
            <kbd className={styles.key}>Ctrl</kbd>
            <span className={styles.keyPlus}>+</span>
            <kbd className={styles.key}>Shift</kbd>
            <span className={styles.keyPlus}>+</span>
            <kbd className={styles.key}>E</kbd>
            <span className={styles.shortcutDesc}>Gist selected text</span>
          </div>
          <div className={styles.shortcutRow}>
            <kbd className={styles.key}>Alt</kbd>
            <span className={styles.keyPlus}>+</span>
            <kbd className={styles.key}>Shift</kbd>
            <span className={styles.keyPlus}>+</span>
            <kbd className={styles.key}>G</kbd>
            <span className={styles.shortcutDesc}>Capture an area</span>
          </div>
          <p className={styles.shortcutNote}>
            Or right-click any selection → <strong>Gist this</strong>
          </p>
        </div>

        {/* CTA */}
        <button className={styles.startBtn} onClick={handleStart}>
          Start reading
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="8" x2="13" y2="8" />
            <polyline points="9,4 13,8 9,12" />
          </svg>
        </button>

        <p className={styles.tip}>
          Open the extension icon anytime to access your Library and settings.
        </p>
      </div>
    </div>
  );
}
