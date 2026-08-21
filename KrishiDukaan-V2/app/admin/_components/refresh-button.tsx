"use client";

import { RotateCw } from "lucide-react";
import { formatAge } from "../_lib/admin-cache";

/**
 * "Updated 12m ago · Refresh" control. Admin pages now serve cached/snapshotted
 * data instead of re-scanning Firestore on every mount, so this is the explicit
 * way to pull fresh numbers.
 */
export function RefreshButton({
  savedAt,
  refreshing,
  onRefresh,
  label = "Refresh",
}: {
  savedAt: number | null;
  refreshing: boolean;
  onRefresh: () => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-[11px] text-on-surface-variant whitespace-nowrap">
        Updated {formatAge(savedAt)}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-1.5 text-xs font-bold text-on-surface hover:bg-surface-container disabled:opacity-60"
      >
        <RotateCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        {refreshing ? "Refreshing…" : label}
      </button>
    </div>
  );
}
