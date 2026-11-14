"use client";

import { X } from "lucide-react";
import { activePaymentChips, type PaymentFilters } from "../_lib/payments";

/**
 * Removable chips for every active column filter, plus Clear-all — the same
 * pattern and styling as Admin → Orders' FilterChips. Renders nothing when no
 * column filters are active (the date window is shown by the preset chips).
 */
export function PaymentFilterChips({
  filters,
  onChange,
  onClearAll,
}: {
  filters: PaymentFilters;
  onChange: (next: PaymentFilters) => void;
  onClearAll: () => void;
}) {
  const chips = activePaymentChips(filters);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.clear(filters))}
          className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10"
        >
          {c.label}
          <X className="h-3 w-3" />
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="rounded-full px-2.5 py-1 text-[11px] font-bold text-on-surface-variant hover:text-red-600"
      >
        Clear all
      </button>
    </div>
  );
}
