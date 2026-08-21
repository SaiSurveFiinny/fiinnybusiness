"use client";

/**
 * Stock + price editor for a manufacturer-assigned product.
 *
 * Assigned products arrive with stockQuantity 0, which makes them permanently
 * "Out of stock" and unorderable. The retailer had no way to change that: the
 * Edit button is gated on `isOwn` in inventory-table.tsx, and the edit modal
 * was the only caller of updateInventoryRecord — so the write path existed and
 * the rules already permitted it, but nothing was ever wired to it.
 *
 * Deliberately NOT the full edit modal: a retailer must not be able to change
 * a manufacturer's product name, images, or specs. Only their own commercial
 * terms — how many they hold, what they charge, when to reorder.
 */

import { useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { updateInventoryRecord } from "../_lib/inventory-firestore";

type Props = {
  inventoryId: string;
  stockQuantity: number;
  sellingPrice: number;
  reorderThreshold: number;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
};

export function AssignedStockPanel({
  inventoryId,
  stockQuantity,
  sellingPrice,
  reorderThreshold,
  onSaved,
  onCancel,
}: Props) {
  const [stock, setStock] = useState(String(stockQuantity ?? 0));
  const [price, setPrice] = useState(String(sellingPrice ?? 0));
  const [threshold, setThreshold] = useState(String(reorderThreshold ?? 0));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSave = async () => {
    const s = Number(stock);
    const p = Number(price);
    const r = Number(threshold);

    if (!Number.isFinite(s) || s < 0) { setErr("Stock must be 0 or more."); return; }
    if (!Number.isFinite(p) || p <= 0) { setErr("Enter a selling price."); return; }
    if (!Number.isFinite(r) || r < 0) { setErr("Reorder alert must be 0 or more."); return; }

    setSaving(true);
    setErr(null);
    try {
      await updateInventoryRecord(inventoryId, {
        stockQuantity: Math.floor(s),
        sellingPrice: p,
        reorderThreshold: Math.floor(r),
      });
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-3 shadow-ambient">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-xs font-bold text-on-surface">Stock &amp; price</p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md p-0.5 text-on-surface-variant hover:bg-surface-container"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        <NumField label="Stock quantity" value={stock} onChange={setStock} />
        <NumField label="Your selling price (₹)" value={price} onChange={setPrice} />
        <NumField label="Reorder alert below" value={threshold} onChange={setThreshold} />
      </div>

      {err ? <p className="mt-2 text-[11px] text-red-600">{err}</p> : null}

      <p className="mt-2 text-[10px] leading-snug text-on-surface-variant">
        Stock of 0 keeps this product out of the marketplace.
      </p>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-on-primary disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function NumField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-on-surface-variant">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        className="w-full rounded-lg border border-outline-variant/50 bg-surface px-2.5 py-1.5 text-sm font-semibold text-on-surface focus:border-primary focus:outline-none"
      />
    </label>
  );
}
