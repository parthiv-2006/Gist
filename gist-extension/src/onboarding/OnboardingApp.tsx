import React, { useState } from "react";
import { WelcomeStep } from "./steps/WelcomeStep";
import { HighlightStep } from "./steps/HighlightStep";
import { AutoGistStep } from "./steps/AutoGistStep";
import { FeaturesStep } from "./steps/FeaturesStep";
import { DoneStep } from "./steps/DoneStep";
import styles from "./OnboardingApp.module.css";

const STEPS = ["welcome", "highlight", "autogist", "features", "done"] as const;
type StepId = (typeof STEPS)[number];

const STEP_LABELS: Record<StepId, string> = {
  welcome:   "Welcome",
  highlight: "Highlight",
  autogist:  "AutoGist",
  features:  "Features",
  done:      "Done",
};

export function OnboardingApp() {
  const [stepIdx, setStepIdx]   = useState(0);
  const [animOut, setAnimOut]   = useState(false);

  const step = STEPS[stepIdx];

  const goNext = () => {
    setAnimOut(true);
    setTimeout(() => {
      setAnimOut(false);
      setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
    }, 280);
  };

  // Progress: show for steps 1–3 (exclude welcome and done)
  const showProgress = stepIdx > 0 && stepIdx < STEPS.length - 1;
  const progressPct  = (stepIdx / (STEPS.length - 1)) * 100;

  return (
    <div className={styles.root}>
      {/* Ambient background glow */}
      <div className={styles.bgGlow} />

      {/* Top progress bar */}
      {showProgress && (
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* Step breadcrumb dots */}
      {showProgress && (
        <div className={styles.dots}>
          {STEPS.slice(1, -1).map((s, i) => {
            const realIdx = i + 1; // index in STEPS array
            return (
              <div
                key={s}
                title={STEP_LABELS[s]}
                className={`${styles.dot} ${
                  stepIdx > realIdx
                    ? styles.dotDone
                    : stepIdx === realIdx
                    ? styles.dotActive
                    : styles.dotPending
                }`}
              />
            );
          })}
        </div>
      )}

      {/* Step content */}
      <div className={`${styles.stepWrap} ${animOut ? styles.exitAnim : styles.enterAnim}`}>
        {step === "welcome"   && <WelcomeStep   onNext={goNext} />}
        {step === "highlight" && <HighlightStep onNext={goNext} />}
        {step === "autogist"  && <AutoGistStep  onNext={goNext} />}
        {step === "features"  && <FeaturesStep  onNext={goNext} />}
        {step === "done"      && <DoneStep />}
      </div>
    </div>
  );
}
