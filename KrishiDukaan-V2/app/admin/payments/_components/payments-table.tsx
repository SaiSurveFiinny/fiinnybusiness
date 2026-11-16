"use client";

import { Eye, Phone } from "lucide-react";
import {
  money,
  CATEGORY_LABEL,
  PLATFORM_LABEL,
  type PaymentRow,
  type Category,
  type PaymentFilters,
  type Platform,
} from "../_lib/payments";
// Reuse the exact Orders column-filter controls — no separate filter system.
import {
  ColumnFilter,
  TextFilter,
  AmountFilter,
  DateFilter,
  MultiSelectFilter,
} from "../../orders/_components/order-column-filters";

export const CATEGORY_BADGE: Record<Category, string> = {
  successful: "bg-green-50 text-green-700",
  abandoned: "bg-amber-50 text-amber-700",
  failed: "bg-red-50 text-red-700",
  refunded: "bg-purple-50 text-purple-700",
  pending: "bg-slate-100 text-slate-600",
  unresolved: "bg-orange-50 text-orange-700",
};

const PLATFORM_OPTIONS: Platform[] = ["app", "web", "razorpay", "unknown"];

/**
 * Compact unified table with per-column header filters (same funnel popovers as
 * Admin → Orders). Filters lift to the page's single PaymentFilters state, which
 * is sent to the server so filtering spans ALL records, not just this page.
 */
export function PaymentsTable({
  rows,
  onView,
  filters,
  onFilters,
  dateFrom,
  dateTo,
  dateActive,
  onDateChange,
  onDateClear,
}: {
  rows: PaymentRow[];
  onView: (r: PaymentRow) => void;
  filters: PaymentFilters;
  onFilters: (f: PaymentFilters) => void;
  dateFrom: number | null;
  dateTo: number | null;
  dateActive: boolean;
  onDateChange: (d: { fromMs: number | null; toMs: number | null }) => void;
  onDateClear: () => void;
}) {
  const patch = (p: Partial<PaymentFilters>) => onFilters({ ...filters, ...p });
  const amountActive = !!(filters.amount.min.trim() || filters.amount.max.trim());

  return (
    <div className="overflow-x-auto rounded-2xl border border-outline/15 bg-white">
      <table className="w-full min-w-[62rem] text-sm">
        <thead className="border-b border-outline/15 bg-surface-container/40 text-left text-xs uppercase tracking-wide text-on-surface-variant">
          <tr>
            <th className="px-3 py-2.5 font-semibold">
              <ColumnFilter label="Date &amp; time" active={dateActive} onClear={onDateClear}>
                <DateFilter fromMs={dateFrom} toMs={dateTo} onChange={onDateChange} />
              </ColumnFilter>
            </th>
            <th className="px-3 py-2.5 font-semibold">
              <ColumnFilter label="Customer" active={!!filters.customerName.trim()} onClear={() => patch({ customerName: "" })}>
                <TextFilter value={filters.customerName} onChange={(v) => patch({ customerName: v })} placeholder="Customer name…" />
              </ColumnFilter>
            </th>
            <th className="px-3 py-2.5 font-semibold">
              <ColumnFilter label="Product" active={!!filters.product.trim()} onClear={() => patch({ product: "" })}>
                <TextFilter value={filters.product} onChange={(v) => patch({ product: v })} placeholder="Product name…" />
              </ColumnFilter>
            </th>
            <th className="px-3 py-2.5 font-semibold">
              <ColumnFilter label="Phone" active={!!filters.phone.trim()} onClear={() => patch({ phone: "" })}>
                <TextFilter value={filters.phone} onChange={(v) => patch({ phone: v })} placeholder="Phone number…" />
              </ColumnFilter>
            </th>
            <th className="px-3 py-2.5 text-right font-semibold">
              <ColumnFilter label="Amount" align="right" active={amountActive} onClear={() => patch({ amount: { op: "range", min: "", max: "" } })}>
                <AmountFilter amount={filters.amount} onChange={(amount) => patch({ amount })} />
              </ColumnFilter>
            </th>
            <th className="px-3 py-2.5 font-semibold">
              <ColumnFilter label="Error / reason" active={!!filters.reason.trim()} onClear={() => patch({ reason: "" })}>
                <TextFilter value={filters.reason} onChange={(v) => patch({ reason: v })} placeholder="Reason / error…" />
              </ColumnFilter>
            </th>
            <th className="px-3 py-2.5 font-semibold">
              <ColumnFilter label="Platform" active={filters.platforms.length > 0} onClear={() => patch({ platforms: [] })}>
                <MultiSelectFilter
                  searchable={false}
                  options={PLATFORM_OPTIONS.map((p) => ({ value: p, label: PLATFORM_LABEL[p] }))}
                  selected={filters.platforms}
                  onChange={(next) => patch({ platforms: next as Platform[] })}
                />
              </ColumnFilter>
            </th>
            <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p = r.payment;
            return (
              <tr key={r.key} className="border-b border-outline/10 align-top transition hover:bg-surface-container/30">
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-on-surface-variant">
                  {r.createdAt ? r.createdAt.toLocaleString("en-IN") : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="max-w-[10rem] truncate font-semibold text-on-surface" title={r.name}>
                      {r.name}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${CATEGORY_BADGE[r.category]}`}>
                      {CATEGORY_LABEL[r.category]}
                    </span>
                    {r.source === "app" && (
                      <span
                        className="shrink-0 rounded-full bg-surface-container px-1.5 py-0.5 text-[9px] font-semibold uppercase text-outline"
                        title="App-only checkout — Razorpay never recorded a payment for this order."
                      >
                        app
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="block max-w-[16rem] truncate text-on-surface-variant" title={r.product}>
                    {r.product}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {r.phone ? (
                    <a href={`tel:${r.phone}`} className="flex items-center gap-1 text-primary hover:underline">
                      <Phone className="h-3 w-3" />
                      {r.phone}
                    </a>
                  ) : (
                    <span className="text-outline">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-on-surface">{money(r.amount)}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={`block max-w-[16rem] truncate text-xs ${
                      r.category === "failed" || r.category === "abandoned" ? "text-red-600" : "text-on-surface-variant"
                    }`}
                    title={r.reason}
                  >
                    {r.reason}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-on-surface-variant">{PLATFORM_LABEL[r.platform]}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <button
                    onClick={() => onView(r)}
                    className="inline-flex items-center gap-1 rounded-lg border border-outline/30 px-2.5 py-1.5 text-xs font-semibold text-on-surface-variant transition hover:bg-surface-container"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
