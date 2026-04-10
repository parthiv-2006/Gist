import React, { useState } from "react";
import { DashboardRoute } from "./types";
import { IconHome, IconLibraryTab, IconSettings, IconSynapse } from "./icons";
import { HomeView } from "./views/HomeView";
import { LibraryView } from "./views/LibraryView";
import { SettingsView } from "./views/SettingsView";
import { SynapseView } from "./views/SynapseView";
import styles from "./Dashboard.module.css";

// Inline GistLogo to avoid circular dependency with App.tsx
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

const NAV_ITEMS: { id: DashboardRoute; label: string; icon: React.ReactNode }[] = [
  { id: "home",     label: "Overview",  icon: <IconHome /> },
  { id: "library",  label: "Library",   icon: <IconLibraryTab /> },
  { id: "synapse",  label: "Synapse",   icon: <IconSynapse /> },
  { id: "settings", label: "Settings",  icon: <IconSettings /> },
];

export function Dashboard() {
  const [route, setRoute] = useState<DashboardRoute>("home");

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
            </button>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>v1.0 · gist</div>
      </aside>

      {/* Content area — unmount/remount on route change triggers viewEnter animation */}
      <main className={styles.content}>
        {route === "home"     && <HomeView />}
        {route === "library"  && <LibraryView />}
        {route === "synapse"  && <SynapseView />}
        {route === "settings" && <SettingsView />}
      </main>
    </div>
  );
}
