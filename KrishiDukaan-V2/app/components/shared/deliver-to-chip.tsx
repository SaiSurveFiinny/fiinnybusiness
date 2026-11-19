"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { chooseDeliverTo, useDeliverTo } from "../../lib/deliver-to";

/**
 * "📍 Deliver to 411038 ▾" above the product list. Logged-in shoppers start
 * with their profile address; anyone can type another pincode to see prices
 * and dates delivered there.
 */
export function DeliverToChip({ className = "" }: { className?: string }) {
  const deliverTo = useDeliverTo();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const valid = /^[1-9]\d{5}$/.test(draft);

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => { setDraft(deliverTo?.pincode ?? ""); setOpen((o) => !o); }}
        className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/40 bg-white px-3 py-1.5 text-xs font-semibold text-on-surface hover:border-primary/40"
        aria-expanded={open}
      >
        <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />
        {deliverTo
          ? <>Deliver to <span className="font-bold">{deliverTo.city ? `${deliverTo.city} ` : ""}{deliverTo.pincode}</span></>
          : <>Enter pincode for delivered prices</>}
      </button>
      {open && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (valid) { chooseDeliverTo(draft); setOpen(false); } }}
          className="absolute left-0 top-full z-30 mt-2 flex w-64 max-w-[calc(100vw-32px)] items-center gap-2 rounded-2xl border border-surface-container bg-white p-3 shadow-lg"
        >
          <input
            autoFocus
            inputMode="numeric"
            maxLength={6}
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit pincode"
            aria-label="Delivery pincode"
            className="min-w-0 flex-1 rounded-xl border border-outline-variant bg-white px-3 py-1.5 text-sm"
          />
          <button type="submit" disabled={!valid} className="shrink-0 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
            Apply
          </button>
        </form>
      )}
    </div>
  );
}
