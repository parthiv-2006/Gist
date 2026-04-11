import React, { useEffect, useState } from "react";
import styles from "./WelcomeStep.module.css";

const FEATURES = [
  { icon: "✦", label: "Highlight any text for an instant explanation" },
  { icon: "✦", label: "Save insights to your personal knowledge library" },
  { icon: "✦", label: "Discover connections in a live knowledge graph" },
];

export function WelcomeStep({ onNext }: { onNext: () => void }) {
  const [visible, setVisible] = useState(false);

  // Stagger the entrance animation
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`${styles.root} ${visible ? styles.visible : ""}`}>
      {/* Logo mark */}
      <div className={styles.logoWrap}>
        <svg className={styles.logoRing} viewBox="0 0 80 80" fill="none">
          <circle cx="40" cy="40" r="36" stroke="rgba(16,185,129,0.18)" strokeWidth="1" />
          <circle cx="40" cy="40" r="28" stroke="rgba(16,185,129,0.10)" strokeWidth="1" />
          {/* Orbiting dot */}
          <circle cx="40" cy="4" r="3" fill="#10b981" opacity="0.8" />
        </svg>
        <div className={styles.logoGlyph}>G</div>
      </div>

      {/* Headline */}
      <h1 className={styles.headline}>
        Welcome to{" "}
        <span className={styles.brandName}>Gist</span>
      </h1>

      <p className={styles.tagline}>
        Turn any text on the web into instant, plain-English understanding.
      </p>

      {/* Feature bullets */}
      <ul className={styles.features}>
        {FEATURES.map((f, i) => (
          <li
            key={i}
            className={styles.featureItem}
            style={{ animationDelay: `${0.35 + i * 0.1}s` }}
          >
            <span className={styles.featureIcon}>{f.icon}</span>
            <span>{f.label}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button className={styles.cta} onClick={onNext}>
        Take the tour
        <svg className={styles.ctaArrow} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="8" x2="13" y2="8" />
          <polyline points="9,4 13,8 9,12" />
        </svg>
      </button>

      <p className={styles.skip}>
        Already familiar?{" "}
        <button
          className={styles.skipLink}
          onClick={() => {
            try { chrome.storage.local.set({ onboardingComplete: true }); } catch { /* non-extension env */ }
            window.close();
          }}
        >
          Skip intro
        </button>
      </p>
    </div>
  );
}
