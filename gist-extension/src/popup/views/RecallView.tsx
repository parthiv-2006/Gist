import React, { useEffect, useRef, useState } from "react";
import { GistItem } from "../types";
import { BACKEND_BASE, CATEGORY_COLORS, MONO } from "../tokens";
import styles from "./RecallView.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReviewRecord {
  reviewedAt: number;
  score: "good" | "again";
}

type Phase = "loading" | "empty" | "session" | "complete";
type CardState = "question" | "answer";

// ── Queue builder ─────────────────────────────────────────────────────────────

const DAYS7  = 7  * 24 * 3600_000;
const DAYS14 = 14 * 24 * 3600_000;
const DAYS1  = 1  * 24 * 3600_000;

function buildQueue(items: GistItem[], stored: Record<string, unknown>): GistItem[] {
  const now = Date.now();
  return items.filter((item) => {
    if (!item.id) return false;
    const age = now - new Date(item.created_at).getTime();
    if (age < DAYS7) return false;
    const rev = stored[`recall_${item.id}`] as ReviewRecord | undefined;
    if (!rev) return true;
    if (rev.score === "again") return now - rev.reviewedAt > DAYS1;
    return now - rev.reviewedAt > DAYS14;
  });
}

// ── RecallView ────────────────────────────────────────────────────────────────

interface RecallViewProps {
  onQueueSize?: (n: number) => void;
}

export function RecallView({ onQueueSize }: RecallViewProps) {
  const [phase, setPhase]           = useState<Phase>("loading");
  const [total, setTotal]           = useState(0);
  const [remaining, setRemaining]   = useState<GistItem[]>([]);
  const [cardState, setCardState]   = useState<CardState>("question");
  const [sessionGood, setSessionGood] = useState(0);
  const [revealed, setRevealed]     = useState(false);

  // Refs for keyboard handler (avoid stale closures)
  const phaseRef     = useRef(phase);
  const cardStateRef = useRef(cardState);
  const handleRef    = useRef<{ showAnswer: () => void; good: () => void; again: () => void } | null>(null);
  phaseRef.current     = phase;
  cardStateRef.current = cardState;

  useEffect(() => {
    BACKEND_BASE.then((base) =>
      fetch(`${base}/library`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then(({ items }: { items: GistItem[] }) => {
          chrome.storage.local.get(null, (stored) => {
            const q = buildQueue(items, stored as Record<string, unknown>);
            setTotal(q.length);
            setRemaining(q);
            onQueueSize?.(q.length);
            setPhase(q.length === 0 ? "empty" : "session");
          });
        })
        .catch(() => {
          setPhase("empty");
          onQueueSize?.(0);
        })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts — registered once, read state via refs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phaseRef.current !== "session") return;
      if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (cardStateRef.current === "question") handleRef.current?.showAnswer();
        else handleRef.current?.good();
      }
      if ((e.key === "r" || e.key === "R") && cardStateRef.current === "answer") {
        handleRef.current?.again();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const card = remaining[0];

  const handleShowAnswer = () => {
    setCardState("answer");
    setRevealed(true);
  };

  const handleGood = () => {
    if (!card?.id) return;
    chrome.storage.local.set({ [`recall_${card.id}`]: { reviewedAt: Date.now(), score: "good" } });
    setSessionGood((n) => n + 1);
    const [, ...rest] = remaining;
    if (rest.length === 0) {
      setPhase("complete");
    } else {
      setRemaining(rest);
      setCardState("question");
      setRevealed(false);
    }
  };

  const handleAgain = () => {
    if (!card?.id) return;
    chrome.storage.local.set({ [`recall_${card.id}`]: { reviewedAt: Date.now(), score: "again" } });
    const [first, ...rest] = remaining;
    setRemaining([...rest, first]);
    setCardState("question");
    setRevealed(false);
  };

  const handleSkip = () => {
    const [, ...rest] = remaining;
    if (rest.length === 0) setPhase("complete");
    else { setRemaining(rest); setCardState("question"); setRevealed(false); }
  };

  handleRef.current = { showAnswer: handleShowAnswer, good: handleGood, again: handleAgain };

  // ── Loading ──
  if (phase === "loading") {
    return (
      <div className={styles.container}>
        <div className={styles.centeredState}>
          <div className={styles.spinner} />
          <p className={styles.stateText}>Loading review queue…</p>
        </div>
      </div>
    );
  }

  // ── Empty ──
  if (phase === "empty") {
    return (
      <div className={styles.container}>
        <div className={styles.centeredState}>
          <div className={styles.stateIcon}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2e2e2e" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74" />
              <path d="M3 3v4h4" />
              <path d="M12 7v5l3 3" />
            </svg>
          </div>
          <p className={styles.stateTitle}>Nothing to review</p>
          <p className={styles.stateSubtext}>
            Gists become reviewable 7 days after saving.<br />
            Come back after you've built your library.
          </p>
        </div>
      </div>
    );
  }

  // ── Complete ──
  if (phase === "complete") {
    return (
      <div className={styles.container}>
        <div className={styles.centeredState}>
          <div className={styles.completeCheck}>
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
              <circle cx="26" cy="26" r="24" stroke="#10b981" strokeWidth="1.5" className={styles.circleAnim} />
              <path d="M15 26l8 8 14-15" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.checkAnim} />
            </svg>
          </div>
          <p className={styles.stateTitle}>Session complete</p>
          <p className={styles.stateSubtext}>
            Reviewed{" "}
            <span className={styles.accentText}>{sessionGood}</span>
            {" "}of{" "}
            <span className={styles.accentText}>{total}</span>
            {" "}gists
          </p>
        </div>
      </div>
    );
  }

  // ── Session ──
  const color = CATEGORY_COLORS[card.category] ?? "#666666";
  const progressPct = total > 0 ? ((total - remaining.length) / total) * 100 : 0;
  const date = new Date(card.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.headerLabel}>Review</span>
        <span className={styles.headerCount} style={{ fontFamily: MONO }}>
          {total - remaining.length + 1} / {total}
        </span>
      </div>

      {/* Progress bar */}
      <div className={styles.progressTrack}>
        <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
      </div>

      {/* Card */}
      <div className={styles.card}>
        <div className={styles.cardMeta}>
          <span
            className={styles.categoryBadge}
            style={{ color, background: `${color}14`, border: `1px solid ${color}28` }}
          >
            {card.category}
          </span>
          <span className={styles.cardMode} style={{ fontFamily: MONO }}>
            {card.mode} · {date}
          </span>
          <button className={styles.skipBtn} onClick={handleSkip}>
            Skip
          </button>
        </div>

        {/* Original text */}
        <div className={styles.cardSection}>
          <p className={styles.sectionLabel}>Original text</p>
          <p className={styles.originalText}>{card.original_text}</p>
        </div>

        {/* Answer section */}
        <div className={styles.answerSection}>
          <div className={styles.answerDivider} />
          {revealed ? (
            <div className={`${styles.cardSection} ${styles.answerReveal}`}>
              <p className={styles.sectionLabel}>Explanation</p>
              <p className={styles.explanationText}>{card.explanation}</p>
            </div>
          ) : (
            <button className={styles.showAnswerBtn} onClick={handleShowAnswer}>
              Show explanation
              <span className={styles.showAnswerArrow}>↓</span>
            </button>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {cardState === "answer" && (
        <div className={styles.actions}>
          <button className={styles.againBtn} onClick={handleAgain}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M3 12a9 9 0 1 0 9-9" /><path d="M3 3v4h4" />
            </svg>
            Review again
          </button>
          <button className={styles.goodBtn} onClick={handleGood}>
            Got it
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Keyboard hint */}
      <p className={styles.hint}>
        {cardState === "question"
          ? "Space or Enter to reveal"
          : "Enter to confirm · R to review again"}
      </p>
    </div>
  );
}
