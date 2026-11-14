"use client";

import { CATEGORY_LABEL, type Category } from "../_lib/payments";

/**
 * Two SVG donut charts driven by the server-computed category counts (not by
 * the loaded rows), so they reflect the full filtered distribution even though
 * the table only holds one page.
 *
 * Chart 1 — Category distribution (full normalized breakdown).
 * Chart 2 — Business outcome: Collected / Refunded / Lost (abandoned + failed).
 */

const COLORS: Record<string, string> = {
  successful: "#16a34a",
  abandoned: "#d97706",
  failed: "#dc2626",
  refunded: "#9333ea",
  pending: "#64748b",
  unresolved: "#ea580c",
  lost: "#dc2626",
};

type Slice = { key: string; label: string; count: number };

export function PaymentPieCharts({ counts }: { counts: Record<Category, number> }) {
  const distribution: Slice[] = (
    ["successful", "abandoned", "failed", "refunded", "pending", "unresolved"] as Category[]
  )
    .map((k) => ({ key: k, label: CATEGORY_LABEL[k], count: counts[k] }))
    .filter((s) => s.count > 0);

  const outcome: Slice[] = [
    { key: "successful", label: "Collected", count: counts.successful },
    { key: "refunded", label: "Refunded", count: counts.refunded },
    { key: "lost", label: "Lost (abandoned + failed)", count: counts.abandoned + counts.failed },
  ].filter((s) => s.count > 0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Donut title="Category distribution" subtitle="Every payment by its normalized category." slices={distribution} />
      <Donut
        title="Business outcome"
        subtitle="Money collected vs refunded vs never collected (abandoned + failed)."
        slices={outcome}
      />
    </div>
  );
}

function Donut({ title, subtitle, slices }: { title: string; subtitle: string; slices: Slice[] }) {
  const total = slices.reduce((s, x) => s + x.count, 0);
  const R = 60;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = slices.map((s) => {
    const frac = total > 0 ? s.count / total : 0;
    const arc = { key: s.key, dash: frac * C, gap: C - frac * C, rotation: (offset / C) * 360 };
    offset += frac * C;
    return arc;
  });

  return (
    <div className="rounded-2xl border border-outline/15 bg-white p-4">
      <p className="text-sm font-bold text-on-surface">{title}</p>
      <p className="mt-0.5 text-xs text-on-surface-variant">{subtitle}</p>

      <div className="mt-3 flex items-center gap-5">
        <div className="relative shrink-0">
          <svg width="150" height="150" viewBox="0 0 150 150">
            <circle cx="75" cy="75" r={R} fill="none" stroke="#f1f5f9" strokeWidth="18" />
            {total > 0 &&
              arcs.map((a) => (
                <circle
                  key={a.key}
                  cx="75"
                  cy="75"
                  r={R}
                  fill="none"
                  stroke={COLORS[a.key]}
                  strokeWidth="18"
                  strokeDasharray={`${a.dash} ${a.gap}`}
                  strokeDashoffset={0}
                  transform={`rotate(${a.rotation - 90} 75 75)`}
                />
              ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-extrabold text-on-surface">{total}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-outline">payments</span>
          </div>
        </div>

        <ul className="min-w-0 flex-1 space-y-1.5">
          {slices.map((s) => {
            const p = total > 0 ? (s.count / total) * 100 : 0;
            return (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: COLORS[s.key] }} />
                <span className="flex-1 truncate text-on-surface-variant">{s.label}</span>
                <span className="font-bold text-on-surface">{s.count}</span>
                <span className="w-12 text-right text-xs text-outline">{p.toFixed(1)}%</span>
              </li>
            );
          })}
        </ul>
      </div>

      {total === 0 && <p className="mt-2 text-center text-xs text-outline">No payments in the selected range.</p>}
    </div>
  );
}
