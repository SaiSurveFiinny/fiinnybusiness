"use client";

/**
 * Shared presentational building blocks for the "Create order manually" wizards —
 * used by BOTH the admin flow (app/admin/orders/create/page.tsx) and the retailer
 * flow (app/dashboard/orders/create/page.tsx). Pure UI + formatting, no data logic,
 * so the two wizards share one source of truth and can never drift.
 */

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, Check, Loader2, Pencil, Save, MapPin, X,
  AlertTriangle, CheckCircle2, FileText,
} from "lucide-react";

export const inr = (n: number | undefined | null) =>
  `₹${(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Editable customer delivery address, matching the users/{phone} field schema. */
export type CustAddr = { area: string; city: string; district: string; state: string; pincode: string };

/** Structural source for seeding an editable address from a selected customer. */
export type AddrSource = {
  city?: string | null; state?: string | null;
  addressArea?: string | null; addressCity?: string | null; addressDistrict?: string | null;
  addressState?: string | null; addressPincode?: string | null;
};

export const emptyAddr = (): CustAddr => ({ area: "", city: "", district: "", state: "", pincode: "" });
export const addrFromCustomer = (c: AddrSource): CustAddr => ({
  area:     c.addressArea     ?? "",
  city:     c.addressCity     ?? c.city ?? "",
  district: c.addressDistrict ?? "",
  state:    c.addressState    ?? c.state ?? "",
  pincode:  c.addressPincode  ?? "",
});
export const composeAddr = (a: CustAddr): string =>
  [a.area, a.city, a.district, a.state, a.pincode].map((s) => s.trim()).filter(Boolean).join(", ");

export type Pricing = {
  lines: { productId: string; name: string; unitPrice: number; qty: number; lineTotal: number; variantUnit?: string; gstApplicable: boolean; gstRate: number; priceSource: string }[];
  subtotal: number; totalGst: number; totalGstAdded: number; deliveryCharge: number;
  deliveryCalculated: number; deliveryOverridden: boolean;
  deliveryBreakdown: { slab: number; extra: number; free: boolean; waived: number }; deliveryType: string; grandTotal: number;
};

// ── Generic server-backed autocomplete ────────────────────────────────────────
export function AsyncSearch<T extends { id?: string; copyId?: string }>({
  placeholder, fetcher, renderOption, onPick, icon: Icon, minChars = 2, emptyLabel, onError,
}: {
  placeholder: string;
  fetcher: (q: string) => Promise<T[]>;
  renderOption: (item: T) => React.ReactNode;
  onPick: (item: T) => void;
  icon: React.ElementType;
  /** 0 = browse mode: load the full list immediately and filter as you type. */
  minChars?: number;
  emptyLabel?: string;
  /** Surfaced when a fetch fails, so an auth/permission error isn't silently shown
   *  as "No results" (the usual cause of a search that "doesn't work"). */
  onError?: (e: unknown) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (q.trim().length < minChars) { if (minChars > 0) setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetcher(q.trim())
        .then((r) => { if (!cancelled) { setResults(r); setOpen(true); } })
        .catch((e) => { if (!cancelled) { setResults([]); onError?.(e); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, fetcher, minChars, onError]);

  // Browse mode: load the full list once on mount.
  useEffect(() => {
    if (minChars > 0) return;
    let cancelled = false;
    setLoading(true);
    fetcher("")
      .then((r) => { if (!cancelled) setResults(r); })
      .catch((e) => { if (!cancelled) { setResults([]); onError?.(e); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetcher, minChars, onError]);

  return (
    <div ref={wrapRef} className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-outline-variant/40 bg-white pl-9 pr-9 py-2.5 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />}
      {open && (results.length > 0 || (!loading && q.trim().length >= minChars)) && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-outline-variant/40 bg-white shadow-xl overflow-hidden">
          {results.length === 0 ? (
            <p className="px-4 py-4 text-sm text-on-surface-variant text-center">
              {loading ? "Loading…" : q.trim() ? `No results for “${q.trim()}”.` : (emptyLabel ?? "No results.")}
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-outline-variant/10">
              {results.map((item, i) => (
                <li key={(item.id ?? item.copyId ?? String(i))}>
                  <button
                    type="button"
                    onMouseDown={() => { onPick(item); setOpen(false); if (minChars > 0) { setQ(""); setResults([]); } }}
                    className="w-full px-3 py-2.5 text-left hover:bg-surface-container-low transition-colors"
                  >
                    {renderOption(item)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function StepHeader({ steps, step }: { steps: readonly string[]; step: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            i === step ? "bg-primary text-white" : i < step ? "bg-green-100 text-green-700" : "bg-surface-container text-on-surface-variant"
          }`}>
            {i < step ? <Check className="h-3 w-3" /> : <span className="font-black">{i + 1}</span>}
            {label}
          </span>
          {i < steps.length - 1 && <span className="text-on-surface-variant/40">›</span>}
        </div>
      ))}
    </div>
  );
}

export function Banner({ tone, children }: { tone: "error" | "warn" | "ok" | "info"; children: React.ReactNode }) {
  const map = {
    error: "bg-red-50 border-red-200 text-red-800",
    warn: "bg-amber-50 border-amber-200 text-amber-800",
    ok: "bg-green-50 border-green-200 text-green-800",
    info: "bg-blue-50 border-blue-200 text-blue-800",
  } as const;
  const Icon = tone === "ok" ? CheckCircle2 : tone === "error" || tone === "warn" ? AlertTriangle : FileText;
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${map[tone]}`}>
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** One numbered payment option, with a heading. */
export function OptionCard({
  n, title, desc, icon: Icon, accent = "primary", children,
}: {
  n: number; title: string; desc: string; icon: React.ElementType;
  accent?: "primary" | "amber"; children: React.ReactNode;
}) {
  const ring = accent === "amber" ? "border-amber-300" : "border-outline-variant/40";
  const badge = accent === "amber" ? "bg-amber-600" : "bg-primary";
  return (
    <div className={`rounded-2xl border ${ring} bg-surface-container-lowest p-4 space-y-3`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${badge} text-sm font-black text-white`}>{n}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black text-on-surface flex items-center gap-1.5"><Icon className="h-4 w-4" /> {title}</h3>
          <p className="text-sm text-on-surface-variant">{desc}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function NextBtn({ disabled, onClick, label = "Next", icon: Icon = ArrowRight }: { disabled: boolean; onClick: () => void; label?: string; icon?: React.ElementType }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
      {label} <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

export function SelectedCard({ children, icon: Icon, onClear }: { children: React.ReactNode; icon: React.ElementType; onClear: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
      <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">{children}</div>
      <button type="button" onClick={onClear} className="rounded-lg p-1 text-on-surface-variant hover:text-red-600 hover:bg-red-50"><X className="h-4 w-4" /></button>
    </div>
  );
}

/**
 * Customer delivery-address viewer/editor. Saving writes to the customer's record
 * via the parent's onSave.
 */
export function CustomerAddressEditor({
  addr, setAddr, editing, setEditing, onReset, onSave, saving, msg,
}: {
  addr: CustAddr;
  setAddr: (fn: (a: CustAddr) => CustAddr) => void;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onReset: () => void;
  onSave: () => void;
  saving: boolean;
  msg: { ok: boolean; text: string } | null;
}) {
  return (
    <div className="space-y-2">
      {!editing ? (
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-on-surface-variant flex items-start gap-1 min-w-0">
            <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
            {composeAddr(addr) || <span className="text-amber-700 font-semibold">No delivery address saved — add one.</span>}
          </p>
          <button type="button" onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/5 shrink-0">
            <Pencil className="h-3 w-3" /> Edit address
          </button>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <AddrField label="Area / street" value={addr.area} onChange={(v) => setAddr((a) => ({ ...a, area: v }))} />
            <AddrField label="City" value={addr.city} onChange={(v) => setAddr((a) => ({ ...a, city: v }))} />
            <AddrField label="District" value={addr.district} onChange={(v) => setAddr((a) => ({ ...a, district: v }))} />
            <AddrField label="State" value={addr.state} onChange={(v) => setAddr((a) => ({ ...a, state: v }))} />
            <AddrField label="Pincode" value={addr.pincode} onChange={(v) => setAddr((a) => ({ ...a, pincode: v }))} />
          </div>
          <p className="text-[10px] text-on-surface-variant">Used on this order. Changing the state may re-price delivery.</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onSave} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save address
            </button>
            <button type="button" onClick={onReset} disabled={saving}
              className="rounded-lg border border-outline-variant/40 px-3 py-1.5 text-xs font-bold text-on-surface-variant disabled:opacity-50">Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className={`text-[11px] font-semibold ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}

export function AddrField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-semibold text-on-surface-variant">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-outline-variant/40 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
    </label>
  );
}

export function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-on-surface-variant">{label}</span>
      <span className={bold ? "font-black text-on-surface" : "font-semibold text-on-surface"}>{value}</span>
    </div>
  );
}

export function PricingTable({
  pricing, effectiveDelivery, effectiveTotal, overridden, onDeliveryChange, onResetDelivery, readOnly = false,
}: {
  pricing: Pricing;
  effectiveDelivery: number;
  effectiveTotal: number;
  overridden: boolean;
  onDeliveryChange: (raw: string) => void;
  onResetDelivery: () => void;
  /** Delivery is already fixed — render it as a read-only figure (no input). */
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-outline-variant/30 bg-white">
        <table className="w-full text-xs min-w-[480px]">
          <thead>
            <tr className="border-b border-outline-variant/20 bg-surface-container-low">
              <th className="px-3 py-2 text-left font-black uppercase tracking-wider text-on-surface-variant">Product</th>
              <th className="px-3 py-2 text-left font-black uppercase tracking-wider text-on-surface-variant">Pack</th>
              <th className="px-3 py-2 text-right font-black uppercase tracking-wider text-on-surface-variant">Price</th>
              <th className="px-3 py-2 text-center font-black uppercase tracking-wider text-on-surface-variant">Qty</th>
              <th className="px-3 py-2 text-right font-black uppercase tracking-wider text-on-surface-variant">Line</th>
            </tr>
          </thead>
          <tbody>
            {pricing.lines.map((l, i) => (
              <tr key={i} className="border-b border-outline-variant/10 last:border-0">
                <td className="px-3 py-2">
                  <p className="font-semibold text-on-surface">{l.name}</p>
                  {l.priceSource !== "seller-copy" && l.priceSource !== "inventory" && (
                    <p className="text-[10px] text-amber-700">price source: {l.priceSource}</p>
                  )}
                </td>
                <td className="px-3 py-2 text-on-surface-variant">{l.variantUnit || "—"}</td>
                <td className="px-3 py-2 text-right text-on-surface-variant">{inr(l.unitPrice)}{l.gstApplicable ? ` (GST ${l.gstRate}%)` : ""}</td>
                <td className="px-3 py-2 text-center font-bold">{l.qty}</td>
                <td className="px-3 py-2 text-right font-bold">{inr(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ml-auto max-w-sm space-y-1.5 text-sm">
        <Row label="Subtotal" value={inr(pricing.subtotal)} />
        {pricing.totalGstAdded > 0 && <Row label="GST (added)" value={inr(pricing.totalGstAdded)} />}
        {readOnly ? (
          <Row label="Delivery charge" value={inr(effectiveDelivery)} />
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-on-surface-variant">Delivery charge</span>
              <div className="flex items-center gap-1.5">
                <span className="text-on-surface-variant">₹</span>
                <input
                  type="number" min={0} step="0.01"
                  value={effectiveDelivery}
                  onChange={(e) => onDeliveryChange(e.target.value)}
                  className="w-24 rounded-lg border border-outline-variant/40 bg-white px-2 py-1 text-sm text-right font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 text-[11px] text-on-surface-variant">
              <span>Calculated: {inr(pricing.deliveryCalculated)}{pricing.deliveryBreakdown.free ? " (free)" : ""}</span>
              {overridden && (
                <button type="button" onClick={onResetDelivery} className="font-bold text-primary hover:underline">reset</button>
              )}
            </div>
          </>
        )}
        <div className="border-t border-outline-variant/30 pt-1.5"><Row label="Payable total" value={inr(effectiveTotal)} bold /></div>
        {overridden && <p className="text-right text-[11px] font-bold text-amber-700">Delivery manually set — the order & invoice will use ₹{effectiveDelivery.toFixed(2)}.</p>}
      </div>
    </div>
  );
}
