import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./HighlightStep.module.css";

// The simulated explanation streams in character by character
const EXPLANATION =
  "A technique that lets a neural network selectively focus on the most relevant parts of its input — like how you'd zero in on key phrases when skimming a dense paragraph. Each word \"attends\" to every other word and learns which relationships matter most.";

type Phase =
  | "idle"       // Phrase has pulsing hint, waiting for click
  | "selected"   // Phrase is highlighted (selection style)
  | "popover"    // Popover visible, streaming text
  | "saved"      // "Saved ✓" shown
  | "done";      // Next button prominent

export function HighlightStep({ onNext }: { onNext: () => void }) {
  const [phase, setPhase]         = useState<Phase>("idle");
  const [streamed, setStreamed]    = useState("");
  const [showSave, setShowSave]   = useState(false);
  const autoRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-advance if user doesn't click within 3.5 s
  useEffect(() => {
    autoRef.current = setTimeout(() => activateDemoPhase(), 3500);
    return () => { if (autoRef.current) clearTimeout(autoRef.current); };
  }, []);

  const activateDemoPhase = useCallback(() => {
    if (autoRef.current) clearTimeout(autoRef.current);
    setPhase("selected");
    setTimeout(() => setPhase("popover"), 420);
  }, []);

  const handlePhraseClick = () => {
    if (phase !== "idle") return;
    activateDemoPhase();
  };

  // Stream explanation text once popover is visible
  useEffect(() => {
    if (phase !== "popover") return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setStreamed(EXPLANATION.slice(0, i));
      if (i >= EXPLANATION.length) {
        clearInterval(interval);
        setTimeout(() => setShowSave(true), 400);
        setTimeout(() => setPhase("done"), 2800);
      }
    }, 18);
    return () => clearInterval(interval);
  }, [phase]);

  const handleSave = () => {
    if (phase === "saved" || phase === "done") return;
    setPhase("saved");
    setTimeout(() => setPhase("done"), 1200);
  };

  return (
    <div className={styles.root}>
      {/* Step header */}
      <div className={styles.header}>
        <span className={styles.stepBadge}>Step 1 of 3</span>
        <h2 className={styles.title}>Gist any text, instantly</h2>
        <p className={styles.subtitle}>
          {phase === "idle"
            ? "Click the highlighted phrase below to see Gist in action."
            : phase === "selected" || phase === "popover"
            ? "Gist is analyzing the phrase…"
            : phase === "saved"
            ? "Saved to your library!"
            : "That's it — try it on any page."}
        </p>
      </div>

      {/* Fake article */}
      <div className={styles.articleCard}>
        <div className={styles.articleMeta}>
          <div className={styles.faviconDot} />
          <span className={styles.articleSource}>arxiv.org · Research Article</span>
        </div>
        <h3 className={styles.articleTitle}>
          Attention Is All You Need: The Transformer Architecture
        </h3>
        <p className={styles.articleText}>
          Transformer models process language by computing correlation scores across
          every token pair simultaneously.{" "}
          {/* The interactive phrase */}
          <span
            className={`${styles.phrase} ${
              phase === "idle"
                ? styles.phrasePulse
                : phase === "selected" || phase === "popover" || phase === "saved" || phase === "done"
                ? styles.phraseSelected
                : ""
            }`}
            onClick={handlePhraseClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && handlePhraseClick()}
            title="Click to Gist this phrase"
          >
            The attention mechanism
          </span>{" "}
          enables each word to weigh the relevance of all other words in the
          sequence — allowing the model to capture long-range dependencies that
          recurrent networks struggle with. This architectural breakthrough
          enabled training on much larger datasets and paved the way for
          modern large language models.
        </p>

        {/* Simulated popover */}
        {(phase === "popover" || phase === "saved" || phase === "done") && (
          <div className={styles.popover}>
            <div className={styles.popoverHeader}>
              <span className={styles.popoverLogo}>⚡ Gist</span>
              <span className={styles.popoverMode}>Standard</span>
            </div>
            <div className={styles.popoverBody}>
              <p className={styles.popoverText}>
                {streamed}
                {streamed.length < EXPLANATION.length && (
                  <span className={styles.cursor} />
                )}
              </p>
            </div>
            {showSave && (
              <div className={styles.popoverFooter}>
                <button
                  className={`${styles.saveBtn} ${
                    phase === "saved" ? styles.saveBtnDone : ""
                  }`}
                  onClick={handleSave}
                >
                  {phase === "saved" ? (
                    <>
                      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="2,6 5,9 10,3" />
                      </svg>
                      Saved
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2 9V3a1 1 0 011-1h5l2 2v5a1 1 0 01-1 1H3a1 1 0 01-1-1z" />
                        <path d="M8 2v3H4V2" />
                      </svg>
                      Save to Library
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Next button */}
      {phase === "done" && (
        <button className={styles.nextBtn} onClick={onNext}>
          Next: AutoGist
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="8" x2="13" y2="8" />
            <polyline points="9,4 13,8 9,12" />
          </svg>
        </button>
      )}

      {/* Click hint indicator */}
      {phase === "idle" && (
        <div className={styles.clickHint}>
          <span className={styles.clickHintDot} />
          Click the underlined phrase to try it
        </div>
      )}
    </div>
  );
}
