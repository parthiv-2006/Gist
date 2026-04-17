import React, { useEffect, useState } from "react";
import { BACKEND_BASE } from "../tokens";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { IconExport, IconTrash } from "../icons";
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

export function SettingsView() {
  const [autoGist, setAutoGist]     = useState(false);
  const [sidebarMode, setSidebar]   = useState(false);
  const [clearConfirm, setClear]    = useState(false);
  const [clearing, setClearing]     = useState(false);
  const toast = useToast();

  // Load from storage on mount
  useEffect(() => {
    chrome.storage.local.get(["autoGistEnabled", "sidebarMode"], (res) => {
      setAutoGist(!!res.autoGistEnabled);
      setSidebar(!!res.sidebarMode);
    });
  }, []);

  const toggle = (key: string, val: boolean, setter: (v: boolean) => void) => {
    setter(val);
    chrome.storage.local.set({ [key]: val });
  };

  const handleExport = async () => {
    try {
      const base = await BACKEND_BASE;
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
      const base = await BACKEND_BASE;
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

      {/* ── Appearance ── */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Appearance</p>
        <div className={styles.placeholder}>
          Theme customization coming soon.
        </div>
      </section>

      {/* Toast */}
      {toast.msg && <div className={styles.toast}>{toast.msg}</div>}
    </div>
  );
}
