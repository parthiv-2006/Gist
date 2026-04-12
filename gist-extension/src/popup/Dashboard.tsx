import React, { useEffect, useState } from "react";
import { DashboardRoute, GistItem } from "./types";
import { IconHome, IconLibraryTab, IconRecall, IconSettings, IconSynapse } from "./icons";
import { BACKEND_BASE } from "./tokens";
import { HomeView } from "./views/HomeView";
import { LibraryView } from "./views/LibraryView";
import { RecallView } from "./views/RecallView";
import { SettingsView } from "./views/SettingsView";
import { SynapseView } from "./views/SynapseView";
import styles from "./Dashboard.module.css";

// ── GistLogo ─────────────────────────────────────────────────────────────────

function GistLogo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
        <rect width="28" height="28" rx="7" fill="#10b981" />
        <path d="M8 14.5C8 11.46 10.46 9 13.5 9H16v2.5h-2.5a2.5 2.5 0 0 0 0 5H16V19h-2.5C10.46 19 8 16.54 8 13.5z" fill="white" />
        <path d="M14 14h6v2.5h-6V14z" fill="white" />
      </svg>
      <span style={{ fontSize: "15px", fontWeight: 700, color: "#f0f0f0", letterSpacing: "-0.01em" }}>
        Gist
      </span>
    </div>
  );
}

// ── Recall queue helpers ──────────────────────────────────────────────────────

interface ReviewRecord { reviewedAt: number; score: "good" | "again" }

const DAYS7  = 7  * 24 * 3600_000;
const DAYS14 = 14 * 24 * 3600_000;
const DAYS1  = 1  * 24 * 3600_000;

function countRecallDue(items: GistItem[], stored: Record<string, unknown>): number {
  const now = Date.now();
  return items.filter((item) => {
    if (!item.id) return false;
    const age = now - new Date(item.created_at).getTime();
    if (age < DAYS7) return false;
    const rev = stored[`recall_${item.id}`] as ReviewRecord | undefined;
    if (!rev) return true;
    if (rev.score === "again") return now - rev.reviewedAt > DAYS1;
    return now - rev.reviewedAt > DAYS14;
  }).length;
}

// ── Nav config ────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: DashboardRoute; label: string; icon: React.ReactNode }[] = [
  { id: "home",     label: "Overview",  icon: <IconHome /> },
  { id: "library",  label: "Library",   icon: <IconLibraryTab /> },
  { id: "synapse",  label: "Synapse",   icon: <IconSynapse /> },
  { id: "recall",   label: "Recall",    icon: <IconRecall /> },
  { id: "settings", label: "Settings",  icon: <IconSettings /> },
];

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const [route, setRoute]         = useState<DashboardRoute>("home");
  const [pendingTag, setPendingTag] = useState<string | null>(null);
  const [recallDue, setRecallDue] = useState(0);

  const refreshRecallBadge = () => {
    BACKEND_BASE.then((base) =>
      fetch(`${base}/library`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then(({ items }: { items: GistItem[] }) => {
          chrome.storage.local.get(null, (stored) => {
            setRecallDue(countRecallDue(items, stored as Record<string, unknown>));
          });
        })
        .catch(() => {})
    );
  };

  // Compute badge on mount
  useEffect(() => { refreshRecallBadge(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTagClick = (tag: string) => {
    setPendingTag(tag);
    setRoute("library");
  };

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <GistLogo />
        </div>

        <nav className={styles.navList}>
          {NAV_ITEMS.map(({ id, label, icon }) => (
            <button
              key={id}
              className={`${styles.navItem} ${route === id ? styles.navItemActive : styles.navItemInactive}`}
              onClick={() => setRoute(id)}
            >
              <span className={styles.navIcon}>{icon}</span>
              {label}
              {id === "recall" && recallDue > 0 && (
                <span className={styles.navBadge}>
                  {recallDue > 9 ? "9+" : recallDue}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className={styles.sidebarFooter} style={{ fontFamily: "'Space Mono', 'Fira Code', monospace" }}>
          v1.0 · gist
        </div>
      </aside>

      {/* Content area */}
      <main className={styles.content}>
        {route === "home"     && (
          <HomeView
            onTagClick={handleTagClick}
            onRecallClick={() => setRoute("recall")}
            recallDue={recallDue}
          />
        )}
        {route === "library"  && (
          <LibraryView
            initialTag={pendingTag}
            onTagConsumed={() => setPendingTag(null)}
          />
        )}
        {route === "synapse"  && <SynapseView />}
        {route === "recall"   && (
          <RecallView onQueueSize={(n) => setRecallDue(n)} />
        )}
        {route === "settings" && <SettingsView />}
      </main>
    </div>
  );
}
