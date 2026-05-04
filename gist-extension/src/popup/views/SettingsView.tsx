import React, { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { getBackendBase } from "../tokens";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { IconExport, IconTrash } from "../icons";
import { useTheme, type ThemePref } from "../hooks/useTheme";
import styles from "./SettingsView.module.css";

// ── Toast helper ──────────────────────────────────────────────────────────────

function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const show = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2500);
  };
  return { msg, show };
}

// ── Settings row with toggle ──────────────────────────────────────────────────

function ToggleRow({ label, sub, enabled, onToggle, ariaLabel }: {
  label: string; sub: string; enabled: boolean; onToggle: () => void; ariaLabel: string;
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowInfo}>
        <div className={styles.rowLabel}>{label}</div>
        <div className={styles.rowSub}>{sub}</div>
      </div>
      <ToggleSwitch enabled={enabled} onToggle={onToggle} ariaLabel={ariaLabel} />
    </div>
  );
}

// ── SettingsView ──────────────────────────────────────────────────────────────

// ── Theme option icons ────────────────────────────────────────────────────────

function IconSun() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function IconMonitor() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <path d="M8 21h8M12 17v4"/>
    </svg>
  );
}

// ── Theme picker ──────────────────────────────────────────────────────────────

const THEME_OPTIONS: { value: ThemePref; label: string; Icon: () => JSX.Element }[] = [
  { value: "light",  label: "Light",  Icon: IconSun     },
  { value: "dark",   label: "Dark",   Icon: IconMoon    },
  { value: "system", label: "System", Icon: IconMonitor },
];

function ThemePicker({ current, onChange }: { current: ThemePref; onChange: (t: ThemePref) => void }) {
  return (
    <div className={styles.themePicker}>
      {THEME_OPTIONS.map(({ value, label, Icon }) => {
        const active = current === value;
        return (
          <button
            key={value}
            className={`${styles.themeOption} ${active ? styles.themeOptionActive : ""}`}
            onClick={() => onChange(value)}
            aria-pressed={active}
            type="button"
          >
            <span className={styles.themeOptionIcon}><Icon /></span>
            <span className={styles.themeOptionLabel}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── SettingsView ──────────────────────────────────────────────────────────────

export function SettingsView() {
  const [autoGist, setAutoGist]     = useState(false);
  const [sidebarMode, setSidebar]   = useState(false);
  const [clearConfirm, setClear]    = useState(false);
  const [clearing, setClearing]     = useState(false);
  const [apiKey, setApiKey]         = useState("");
  const [apiKeyShown, setShown]     = useState(false);
  const [apiKeySaved, setKeySaved]  = useState(false);
  const toast = useToast();
  const { pref: themePref, setTheme } = useTheme();

  // Load from storage on mount
  useEffect(() => {
    chrome.storage.local.get(["autoGistEnabled", "sidebarMode", "geminiApiKey"], (res) => {
      setAutoGist(!!res.autoGistEnabled);
      setSidebar(!!res.sidebarMode);
      setApiKey(res.geminiApiKey || "");
    });
  }, []);

  const handleSaveApiKey = () => {
    chrome.storage.local.set({ geminiApiKey: apiKey.trim() });
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  const toggle = (key: string, val: boolean, setter: (v: boolean) => void) => {
    setter(val);
    chrome.storage.local.set({ [key]: val });
  };

  const handleExport = async () => {
    try {
      const base = await getBackendBase();
      const r = await fetch(`${base}/library`);
      if (!r.ok) throw new Error("Failed to fetch library.");
      const data = await r.json();
      const blob = new Blob([JSON.stringify(data.items, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gist-library-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.show("Library exported as JSON");
    } catch {
      toast.show("Export failed — check backend connection.");
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      const base = await getBackendBase();
      // Fetch all, then delete each by id
      const r = await fetch(`${base}/library`);
      if (!r.ok) throw new Error();
      const data = await r.json();
      const items = data.items ?? [];
      await Promise.all(
        items
          .filter((i: { id?: string }) => i.id)
          .map((i: { id: string }) => fetch(`${base}/library/${i.id}`, { method: "DELETE" }))
      );
      setClear(false);
      toast.show(`Deleted ${items.length} gist${items.length !== 1 ? "s" : ""}`);
    } catch {
      toast.show("Failed to clear library.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className={styles.container}>
      <p className={styles.pageTitle}>Settings</p>

      {/* ── Capture Behavior ── */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Capture behavior</p>
        <ToggleRow
          label="AutoGist"
          sub="Automatically summarize content as you scroll long articles."
          enabled={autoGist}
          onToggle={() => toggle("autoGistEnabled", !autoGist, setAutoGist)}
          ariaLabel="Toggle AutoGist"
        />
      </section>

      {/* ── Layout ── */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Layout</p>
        <ToggleRow
          label="Sidebar mode"
          sub="Dock the explanation panel to the right side of the page instead of a floating popover."
          enabled={sidebarMode}
          onToggle={() => toggle("sidebarMode", !sidebarMode, setSidebar)}
          ariaLabel="Toggle sidebar mode"
        />
      </section>

      {/* ── Data management ── */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Data management</p>

        {/* Export */}
        <div className={styles.actionRow}>
          <div className={styles.rowInfo}>
            <div className={styles.rowLabel}>Export library</div>
            <div className={styles.rowSub}>Download all saved gists as a JSON file.</div>
          </div>
          <button
            className={`${styles.actionBtn} ${styles.actionBtnDefault}`}
            onClick={handleExport}
          >
            <IconExport />
            Export JSON
          </button>
        </div>

        {/* Clear all */}
        {clearConfirm ? (
          <div className={styles.confirmBanner}>
            <p className={styles.confirmText}>
              This will permanently delete all saved gists. This cannot be undone.
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.confirmYes} onClick={handleClearAll} disabled={clearing}>
                {clearing ? "Deleting…" : "Yes, delete all"}
              </button>
              <button className={styles.confirmNo} onClick={() => setClear(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.actionRow}>
            <div className={styles.rowInfo}>
              <div className={styles.rowLabel}>Clear all gists</div>
              <div className={styles.rowSub}>Permanently remove every gist from your library.</div>
            </div>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnDestructive}`}
              onClick={() => setClear(true)}
            >
              <IconTrash />
              Clear all
            </button>
          </div>
        )}
      </section>

      {/* ── API Configuration ── */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>API Configuration</p>
        <div className={styles.row}>
          <div className={styles.rowInfo}>
            <div className={styles.rowLabel}>Gemini API Key</div>
            <div className={styles.rowSub}>Required for production. Get yours at aistudio.google.com.</div>
          </div>
        </div>
        <div className={styles.apiKeyRow}>
          <div className={styles.apiKeyInputWrap}>
            <input
              type={apiKeyShown ? "text" : "password"}
              className={styles.apiKeyInput}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setKeySaved(false); }}
              placeholder="AIza..."
              spellCheck={false}
              autoComplete="off"
            />
            <button
              className={styles.apiKeyVisToggle}
              onClick={() => setShown(v => !v)}
              aria-label={apiKeyShown ? "Hide key" : "Show key"}
              type="button"
            >
              {apiKeyShown ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <button
            className={`${styles.actionBtn} ${apiKeySaved ? styles.actionBtnSaved : styles.actionBtnDefault}`}
            onClick={handleSaveApiKey}
            disabled={!apiKey.trim()}
          >
            {apiKeySaved ? "Saved ✓" : "Save"}
          </button>
        </div>
      </section>

      {/* ── Appearance ── */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Appearance</p>
        <div className={styles.row}>
          <div className={styles.rowInfo}>
            <div className={styles.rowLabel}>Theme</div>
            <div className={styles.rowSub}>Choose how Gist looks. System follows your OS setting.</div>
          </div>
        </div>
        <ThemePicker current={themePref} onChange={setTheme} />
      </section>

      {/* Toast */}
      {toast.msg && <div className={styles.toast}>{toast.msg}</div>}
    </div>
  );
}
