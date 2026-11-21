"use client";

import { useEffect, useState } from "react";

export type TabId = "monthly-performance" | "daily-sessions" | "dealers-added" | "status";

const TABS: { id: TabId; label: string }[] = [
  { id: "monthly-performance", label: "Monthly Performance" },
  { id: "daily-sessions", label: "Daily Sessions" },
  { id: "dealers-added", label: "Dealers Added" },
  { id: "status", label: "Status" },
];

const VALID_IDS = new Set<string>(TABS.map((t) => t.id));

function readHash(): TabId {
  if (typeof window === "undefined") return "monthly-performance";
  const raw = window.location.hash.replace(/^#/, "");
  return VALID_IDS.has(raw) ? (raw as TabId) : "monthly-performance";
}

type Props = {
  sessionCount: number;
  dealerCount: number | null; // null = not yet loaded
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
};

export function ExecDetailTabs({ sessionCount, dealerCount, activeTab, onTabChange }: Props) {
  const handleClick = (id: TabId) => {
    window.location.hash = id;
    onTabChange(id);
  };

  return (
    <div className="border-b border-outline-variant/20">
      <div className="flex gap-1">
        {TABS.map((t) => {
          const count =
            t.id === "daily-sessions" ? sessionCount :
            t.id === "dealers-added" ? dealerCount :
            null;
          const isActive = t.id === activeTab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleClick(t.id)}
              className={`flex items-center gap-1.5 pb-2.5 px-1.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                isActive
                  ? "border-b-2 border-primary text-primary"
                  : "text-on-surface-variant hover:text-on-surface border-b-2 border-transparent"
              }`}
            >
              {t.label}
              {count != null && count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isActive ? "bg-primary/10 text-primary" : "bg-surface-container text-on-surface-variant"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Hook that syncs the active tab with the URL hash and handles back/forward. */
export function useHashTab(): [TabId, (tab: TabId) => void] {
  const [active, setActive] = useState<TabId>(readHash);

  useEffect(() => {
    const onHash = () => setActive(readHash());
    window.addEventListener("hashchange", onHash);
    // Sync on mount in case the component re-mounts
    setActive(readHash());
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const setTab = (tab: TabId) => {
    window.location.hash = tab;
    setActive(tab);
  };

  return [active, setTab];
}
