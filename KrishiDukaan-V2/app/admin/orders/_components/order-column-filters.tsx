"use client";

/**
 * Per-column filter affordances for the Orders table header: a small funnel
 * button beside a column label that opens a popover with the right control for
 * that column (multi-select, text, amount, date). All controls are controlled
 * components — they lift every change to the page's single OrderFilters state,
 * which drives the table, the analytics panel and the CSV export alike.
 */

import { useEffect, useRef, useState } from "react";
import { Filter, Search, X, Check } from "lucide-react";
import type { AmountOp } from "../_lib/order-filters";

const POPOVER =
  "absolute top-full z-40 mt-1 w-[min(84vw,17rem)] rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-3 shadow-xl";

/** Column header label + a funnel button that toggles a popover of `children`. */
export function ColumnFilter({
  label, active, align = "left", children, onClear,
}: {
  label: string;
  active: boolean;
  align?: "left" | "right";
  children: React.ReactNode;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <span className="relative inline-flex items-center gap-1" ref={ref}>
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Filter by ${label}`}
        className={`rounded p-0.5 transition-colors ${active ? "text-primary" : "text-on-surface-variant/50 hover:text-on-surface-variant"}`}
      >
        <Filter className={`h-3 w-3 ${active ? "fill-primary/20" : ""}`} />
      </button>
      {open && (
        <div className={`${POPOVER} ${align === "right" ? "right-0" : "left-0"}`} onClick={(e) => e.stopPropagation()}>
          {children}
          {onClear && active && (
            <button
              type="button"
              onClick={() => { onClear(); }}
              className="mt-2 w-full rounded-lg border border-outline-variant/40 py-1.5 text-[11px] font-bold text-on-surface-variant hover:bg-surface-container"
            >
              Clear this filter
            </button>
          )}
        </div>
      )}
    </span>
  );
}

/** Searchable checkbox list — Product, Seller, Payment, Status. Values combine
 *  with OR. */
export function MultiSelectFilter({
  options, selected, onChange, searchable = true, searchPlaceholder = "Search…",
}: {
  options: Array<{ value: string; label: string; hint?: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [q, setQ] = useState("");
  const shown = q.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()))
    : options;
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <div className="space-y-2">
      {searchable && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-on-surface-variant" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low py-1.5 pl-7 pr-2 text-xs outline-none focus:border-primary"
          />
        </div>
      )}
      <div className="max-h-52 space-y-0.5 overflow-y-auto">
        {shown.length === 0 && <p className="py-2 text-center text-[11px] text-on-surface-variant">No matches.</p>}
        {shown.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-surface-container"
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-primary bg-primary text-white" : "border-outline-variant/60"}`}>
                {on && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-on-surface">{o.label}</span>
              {o.hint && <span className="shrink-0 text-[10px] text-on-surface-variant">{o.hint}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One-line text search — Customer name / phone, Order / Invoice id. */
export function TextFilter({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low py-1.5 pl-2.5 pr-7 text-xs outline-none focus:border-primary"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Two one-line text searches stacked (Customer name + phone). */
export function CustomerFilter({
  name, phone, onName, onPhone,
}: { name: string; phone: string; onName: (v: string) => void; onPhone: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <TextFilter value={name} onChange={onName} placeholder="Customer name…" />
      <TextFilter value={phone} onChange={onPhone} placeholder="Phone number…" />
    </div>
  );
}

const AMOUNT_OPS: Array<{ value: AmountOp; label: string }> = [
  { value: "range", label: "Between" },
  { value: "gt", label: "Greater than" },
  { value: "lt", label: "Less than" },
  { value: "eq", label: "Equal to" },
];

/** Amount comparison — operator + bound(s), applied live. */
export function AmountFilter({
  amount, onChange,
}: {
  amount: { op: AmountOp; min: string; max: string };
  onChange: (next: { op: AmountOp; min: string; max: string }) => void;
}) {
  const set = (patch: Partial<{ op: AmountOp; min: string; max: string }>) => onChange({ ...amount, ...patch });
  return (
    <div className="space-y-2">
      <select
        value={amount.op}
        onChange={(e) => set({ op: e.target.value as AmountOp })}
        className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1.5 text-xs outline-none focus:border-primary"
      >
        {AMOUNT_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <div className="flex items-center gap-2">
        {(amount.op === "range" || amount.op === "gt" || amount.op === "eq") && (
          <input
            type="number" inputMode="decimal"
            value={amount.min}
            onChange={(e) => set({ min: e.target.value })}
            placeholder={amount.op === "eq" ? "Amount ₹" : "Min ₹"}
            className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1.5 text-xs outline-none focus:border-primary"
          />
        )}
        {(amount.op === "range" || amount.op === "lt") && (
          <input
            type="number" inputMode="decimal"
            value={amount.max}
            onChange={(e) => set({ max: e.target.value })}
            placeholder="Max ₹"
            className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1.5 text-xs outline-none focus:border-primary"
          />
        )}
      </div>
    </div>
  );
}

function msToInput(ms: number | null): string {
  if (ms === null) return "";
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Date range (From / To). Either side may be left blank: From-only = start
 *  date, To-only = end date, both equal = a single day, both = a range. */
export function DateFilter({
  fromMs, toMs, onChange,
}: {
  fromMs: number | null;
  toMs: number | null;
  onChange: (next: { fromMs: number | null; toMs: number | null }) => void;
}) {
  const today = msToInput(Date.now());
  return (
    <div className="space-y-2">
      <label className="flex flex-col text-[11px] font-semibold text-on-surface-variant">
        From
        <input
          type="date"
          value={msToInput(fromMs)}
          max={today}
          onChange={(e) => onChange({ fromMs: e.target.value ? new Date(`${e.target.value}T00:00:00`).getTime() : null, toMs })}
          className="mt-1 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1.5 text-xs outline-none focus:border-primary"
        />
      </label>
      <label className="flex flex-col text-[11px] font-semibold text-on-surface-variant">
        To
        <input
          type="date"
          value={msToInput(toMs)}
          max={today}
          onChange={(e) => onChange({ fromMs, toMs: e.target.value ? new Date(`${e.target.value}T23:59:59.999`).getTime() : null })}
          className="mt-1 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1.5 text-xs outline-none focus:border-primary"
        />
      </label>
    </div>
  );
}
