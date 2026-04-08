import React from "react";
import styles from "./ToggleSwitch.module.css";

interface ToggleSwitchProps {
  enabled: boolean;
  onToggle: () => void;
  ariaLabel: string;
}

export function ToggleSwitch({ enabled, onToggle, ariaLabel }: ToggleSwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={`${styles.toggle} ${enabled ? styles.toggleOn : styles.toggleOff}`}
    >
      <span className={`${styles.thumb} ${enabled ? styles.thumbOn : styles.thumbOff}`} />
    </button>
  );
}
