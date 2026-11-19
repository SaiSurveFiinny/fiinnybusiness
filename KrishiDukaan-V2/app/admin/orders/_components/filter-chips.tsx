"use client";

import { X } from "lucide-react";
import { activeFilterChips, type OrderFilters } from "../_lib/order-filters";

/** Removable chips for every active filter, plus a Clear-all. Renders nothing
 *  when no filters are active. */
export function FilterChips({
  filters, onChange, onClearAll, sellerLabel,
}: {
  filters: OrderFilters;
  onChange: (next: OrderFilters) => void;
  onClearAll: () => void;
  sellerLabel?: (key: string) => string;
}) {
  const chips = activeFilterChips(filters, sellerLabel);
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
