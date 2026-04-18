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

// ── GistMark ──────────────────────────────────────────────────────────────────

function GistMark() {
  return <div className={styles.sidebarLogoMark}>g</div>;
}

// ── Search icon ───────────────────────────────────────────────────────────────

function IconSearch() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// ── Streak helpers ────────────────────────────────────────────────────────────

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function computeStreak(items: GistItem[]): { streak: number; last7: boolean[] } {
  const days = new Set(items.map((item) => dayKey(new Date(item.created_at))));
  const now = new Date();
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    return days.has(dayKey(d));
  });
  const todayHasGist = days.has(dayKey(now));
  let streak = 0;
  for (let i = todayHasGist ? 0 : 1; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (days.has(dayKey(d))) { streak++; } else { break; }
  }
  return { streak, last7 };
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
  const [route, setRoute]           = useState<DashboardRoute>("home");
  const [pendingTag, setPendingTag]  = useState<string | null>(null);
  const [recallDue, setRecallDue]    = useState(0);
  const [streak, setStreak]          = useState(0);
  const [last7, setLast7]            = useState<boolean[]>(Array(7).fill(false));

  const refreshData = () => {
    BACKEND_BASE.then((base) =>
      fetch(`${base}/library`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then(({ items }: { items: GistItem[] }) => {
          chrome.storage.local.get(null, (stored) => {
            setRecallDue(countRecallDue(items, stored as Record<string, unknown>));
          });
          const { streak: s, last7: l7 } = computeStreak(items);
          setStreak(s);
          setLast7(l7);
        })
        .catch(() => {})
    );
  };

  useEffect(() => { refreshData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTagClick = (tag: string) => {
    setPendingTag(tag);
    setRoute("library");
  };

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        {/* Logo */}
        <div className={styles.sidebarLogo}>
          <GistMark />
          <div className={styles.sidebarLogoText}>
            <span className={styles.sidebarWordmark}>gist</span>
            <span className={styles.sidebarSubLabel}>knowledge garden</span>
          </div>
        </div>

        {/* Search button */}
        <button className={styles.searchBtn} onClick={() => setRoute("library")}>
          <IconSearch />
          <span className={styles.searchBtnLabel}>Search library…</span>
          <div className={styles.searchBtnKbds}>
            <kbd className={styles.kbd}>⌘</kbd>
            <kbd className={styles.kbd}>K</kbd>
          </div>
        </button>

        {/* Nav */}
        <p className={styles.workspaceLabel}>Workspace</p>
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

        <div className={styles.sidebarSpacer} />

        {/* Streak card */}
        {streak > 0 && (
          <div className={styles.streakCard}>
            <p className={styles.streakLabel}>Streak</p>
            <div className={styles.streakNumber}>
              <span className={styles.streakValue}>{streak}</span>
              <span className={styles.streakUnit}>days</span>
            </div>
            <div className={styles.streakBars}>
              {last7.map((active, i) => (
                <div key={i} className={active ? styles.streakBar : styles.streakBarDim} />
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className={styles.sidebarFooter}>
          <span className={styles.sidebarFooterText}>v1.0 · gist</span>
          <div className={styles.sidebarFooterDot} />
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
