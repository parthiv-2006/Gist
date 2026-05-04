// src/popup/hooks/useTheme.ts
// Manages theme preference: 'dark' | 'light' | 'system'
// Persists to chrome.storage.local under key 'gistTheme'.
// Applies data-theme="dark"|"light" to document.documentElement so that
// CSS vars in tokens.css (and all CSS modules using var(--*)) react automatically.

import { useEffect, useState } from "react";

export type ThemePref = "dark" | "light" | "system";

/** Resolve the effective rendered theme from a stored preference. */
export function resolveTheme(pref: ThemePref): "dark" | "light" {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return pref;
}

/** Apply a theme preference to <html data-theme="…">. */
export function applyTheme(pref: ThemePref): void {
  const effective = resolveTheme(pref);
  document.documentElement.dataset.theme = effective;
}

/**
 * React hook that reads the stored theme, applies it, and returns
 * the current preference + a setter that saves + applies the new choice.
 */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>("dark");

  useEffect(() => {
    chrome.storage.local.get(["gistTheme"], (res) => {
      const saved = (res.gistTheme as ThemePref) || "dark";
      setPref(saved);
      applyTheme(saved);
    });

    // Keep in sync if another popup window changes the preference
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.gistTheme) {
        const next = (changes.gistTheme.newValue as ThemePref) || "dark";
        setPref(next);
        applyTheme(next);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const setTheme = (next: ThemePref) => {
    setPref(next);
    applyTheme(next);
    chrome.storage.local.set({ gistTheme: next });
  };

  return { pref, setTheme };
}
