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
        <svg className={styles.logoGlyph} viewBox="0 0 100 100" fill="none" aria-hidden="true">
          <path d="M 65.2 36.2 A 22 22 0 1 0 65.2 47.8 H 75 V 67 Q 75 82 57.5 82 Q 43 82 42 71" stroke="oklch(0.75 0.11 150)" strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 44 23.5 C 59 29 62 52 44 60.5 C 26 52 29 29 44 23.5 Z" fill="oklch(0.52 0.09 150)" />
          <path d="M 44 26 Q 45.5 42 44 58.5" stroke="oklch(0.32 0.07 150)" strokeWidth="1.3" fill="none" strokeLinecap="round" />
          <path d="M 44 37 Q 53.5 36 57 42.5" stroke="oklch(0.32 0.07 150)" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.85" />
          <path d="M 44 37 Q 34.5 36 31 42.5" stroke="oklch(0.32 0.07 150)" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.85" />
          <path d="M 44 46.5 Q 52 46 55 51.5" stroke="oklch(0.32 0.07 150)" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.6" />
          <path d="M 44 46.5 Q 36 46 33 51.5" stroke="oklch(0.32 0.07 150)" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.6" />
        </svg>
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
