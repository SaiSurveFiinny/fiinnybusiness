"use client";

import { CalendarDays, Store, Route, Clock } from "lucide-react";

export type MonthRow = {
  key: string;
  label: string;
  sessions: number;
  distanceKm: number;
  visits: number;
  workingMinutes: number;
};

function fmtDistance(km: number): string {
  return km > 0 ? `${km.toFixed(1)} km` : "—";
}

function fmtDuration(mins: number): string {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

function MonthStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-container-low px-3 py-2">
      <div className="flex items-center gap-1 mb-0.5">
        {icon}
        <p className="text-[10px] font-semibold uppercase tracking-wider text-outline">{label}</p>
      </div>
      <p className="text-sm font-bold text-on-surface">{value}</p>
    </div>
  );
}

export function MonthlyPerformanceTab({ monthly }: { monthly: MonthRow[] }) {
  if (monthly.length === 0) {
    return (
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-5 py-10 text-center">
        <CalendarDays className="mx-auto mb-2 h-6 w-6 text-outline" />
        <p className="text-sm font-semibold text-on-surface">No activity yet</p>
        <p className="mt-1 text-xs text-on-surface-variant">
          Monthly performance will appear once this executive starts field sessions.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {monthly.map((m) => (
        <div key={m.key} className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
          <p className="text-sm font-bold text-on-surface mb-3">{m.label}</p>
          <div className="grid grid-cols-2 gap-2">
            <MonthStat icon={<CalendarDays className="h-3.5 w-3.5 text-outline" />} label="Sessions" value={String(m.sessions)} />
            <MonthStat icon={<Store className="h-3.5 w-3.5 text-outline" />} label="Visits" value={String(m.visits)} />
            <MonthStat icon={<Route className="h-3.5 w-3.5 text-outline" />} label="Distance" value={fmtDistance(m.distanceKm)} />
            <MonthStat icon={<Clock className="h-3.5 w-3.5 text-outline" />} label="Working" value={fmtDuration(m.workingMinutes)} />
          </div>
        </div>
      ))}
    </div>
  );
}
