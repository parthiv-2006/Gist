import React from "react";
import styles from "./FeaturesStep.module.css";

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="2" width="14" height="16" rx="2" />
        <line x1="7" y1="7" x2="13" y2="7" />
        <line x1="7" y1="10" x2="13" y2="10" />
        <line x1="7" y1="13" x2="10" y2="13" />
      </svg>
    ),
    color: "#10b981",
    name: "Library",
    desc: "Every gist you save is stored, searchable, and organized by topic — your personal knowledge base.",
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="10" r="3" />
        <line x1="10" y1="2" x2="10" y2="5" />
        <line x1="10" y1="15" x2="10" y2="18" />
        <line x1="2" y1="10" x2="5" y2="10" />
        <line x1="15" y1="10" x2="18" y2="10" />
        <line x1="4.2" y1="4.2" x2="6.3" y2="6.3" />
        <line x1="13.7" y1="13.7" x2="15.8" y2="15.8" />
        <line x1="15.8" y1="4.2" x2="13.7" y2="6.3" />
        <line x1="4.2" y1="15.8" x2="6.3" y2="13.7" />
      </svg>
    ),
    color: "#6366f1",
    name: "Gist Lens",
    desc: "Toggle Lens mode and every complex term on the page gets a subtle highlight with an instant definition.",
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="5"  r="2.5" />
        <circle cx="4"  cy="15" r="2.5" />
        <circle cx="16" cy="15" r="2.5" />
        <line x1="10" y1="7.5" x2="4"  y2="12.5" />
        <line x1="10" y1="7.5" x2="16" y2="12.5" />
        <line x1="6.5" y1="15" x2="13.5" y2="15" />
      </svg>
    ),
    color: "#f59e0b",
    name: "Synapse",
    desc: "See how your saved gists connect via a live knowledge graph — discover hidden links between ideas.",
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 5a2 2 0 012-2h10a2 2 0 012 2v7a2 2 0 01-2 2H7l-4 3V5z" />
        <line x1="7" y1="8" x2="13" y2="8" />
        <line x1="7" y1="11" x2="10" y2="11" />
      </svg>
    ),
    color: "#ec4899",
    name: "Chat Mode",
    desc: "Ask follow-up questions on any explanation. Gist remembers the context so every answer makes sense.",
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 4h5v5H4z" />
        <path d="M11 4h5v5h-5z" />
        <path d="M4 11h5v5H4z" />
        <path d="M11 11h5v5h-5z" />
      </svg>
    ),
    color: "#06b6d4",
    name: "Multi-mode",
    desc: "Switch between Standard, Simple (ELI5), Legal, and Academic modes to match any content type.",
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="2" width="16" height="12" rx="2" />
        <line x1="2" y1="16" x2="18" y2="16" />
        <line x1="10" y1="14" x2="10" y2="16" />
        <circle cx="10" cy="7" r="2" />
        <line x1="7"  y1="11" x2="13" y2="11" />
      </svg>
    ),
    color: "#8b5cf6",
    name: "Visual Capture",
    desc: "Drag to capture any image or diagram on screen — Gist reads and explains charts, screenshots, and more.",
  },
];

export function FeaturesStep({ onNext }: { onNext: () => void }) {
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.stepBadge}>Step 3 of 3</span>
        <h2 className={styles.title}>Everything in your toolkit</h2>
        <p className={styles.subtitle}>
          Six ways to make the web easier to understand — use as many or as few as you like.
        </p>
      </div>

      <div className={styles.grid}>
        {FEATURES.map((f, i) => (
          <div
            key={f.name}
            className={styles.card}
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            <div className={styles.cardIcon} style={{ color: f.color, borderColor: `${f.color}22` }}>
              {f.icon}
            </div>
            <div>
              <div className={styles.cardName} style={{ color: f.color }}>{f.name}</div>
              <div className={styles.cardDesc}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <button className={styles.nextBtn} onClick={onNext}>
        Let's go
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="8" x2="13" y2="8" />
          <polyline points="9,4 13,8 9,12" />
        </svg>
      </button>
    </div>
  );
}
