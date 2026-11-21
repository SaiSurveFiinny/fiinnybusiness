"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { auth } from "../../../../firebase";
import type { Dealer } from "../../../../sales/dealers/dealers-service";

const DEALER_TYPES = [
  { value: "retailer", label: "Retailer" },
  { value: "distributor", label: "Distributor" },
  { value: "manufacturer", label: "Manufacturer" },
];

const INTEREST_OPTIONS = [
  { value: "", label: "— Not assessed —" },
  { value: "low", label: "Low" },
  { value: "considering", label: "Considering" },
  { value: "veryInterested", label: "Very Interested" },
];

type Props = {
  dealer: Dealer;
  onClose: () => void;
  onSaved: (updated: Dealer) => void;
};

function field(label: string, children: React.ReactNode, error?: string) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-on-surface-variant">{label}</span>
      {children}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

const inputCls = "rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors";

export function DealerEditModal({ dealer, onClose, onSaved }: Props) {
  const [shopName, setShopName] = useState(dealer.shopName);
  const [ownerName, setOwnerName] = useState(dealer.ownerName);
  const [phone, setPhone] = useState(dealer.phone);
  const [address, setAddress] = useState(dealer.address);
  const [type, setType] = useState(dealer.type ?? "retailer");
  const [interest, setInterest] = useState(dealer.interest ?? "");
  const [lat, setLat] = useState(dealer.geo ? String(dealer.geo.latitude) : "");
  const [lng, setLng] = useState(dealer.geo ? String(dealer.geo.longitude) : "");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!shopName.trim()) e.shopName = "Shop name is required.";
    if (!ownerName.trim()) e.ownerName = "Owner name is required.";
    if (!phone.trim()) e.phone = "Phone is required.";
    else {
      const clean = phone.trim().replace(/[\s\-]/g, "");
      if (!/^\+?[0-9]{7,15}$/.test(clean)) e.phone = "Invalid phone number (7–15 digits).";
    }
    if (!address.trim()) e.address = "Address is required.";
    if (lat && isNaN(Number(lat))) e.lat = "Latitude must be a number.";
    if (lng && isNaN(Number(lng))) e.lng = "Longitude must be a number.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setSaveError("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not signed in.");
      const token = await user.getIdToken();

      const geo =
        lat.trim() && lng.trim()
          ? { latitude: Number(lat), longitude: Number(lng) }
          : null;

      const resp = await fetch(`/api/admin/sales-team/dealers/${dealer.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ shopName, ownerName, phone, address, type, interest, geo }),
      });

      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error((j as any).error ?? "Save failed.");
      }

      onSaved({
        ...dealer,
        shopName: shopName.trim(),
        ownerName: ownerName.trim(),
        phone: phone.trim().replace(/[\s\-]/g, ""),
        address: address.trim(),
        type,
        interest: interest || undefined,
        geo: geo,
      });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-3xl bg-surface-container-lowest shadow-2xl overflow-y-auto max-h-[90dvh]">
        <div className="sticky top-0 flex items-center justify-between border-b border-outline-variant/20 bg-surface-container-lowest px-6 py-4 z-10">
          <h2 className="text-base font-black text-on-surface">Edit Dealer</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl p-1.5 text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {field("Shop / Dealer Name *",
            <input value={shopName} onChange={(e) => setShopName(e.target.value)} className={inputCls} />,
            errors.shopName)}
          {field("Owner Name *",
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputCls} />,
            errors.ownerName)}
          {field("Phone *",
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" className={inputCls} />,
            errors.phone)}
          {field("Address *",
            <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={inputCls} />,
            errors.address)}
          {field("Dealer Type",
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
              {DEALER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>)}
          {field("Dealer Interest",
            <select value={interest} onChange={(e) => setInterest(e.target.value)} className={inputCls}>
              {INTEREST_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>)}

          <div className="grid grid-cols-2 gap-3">
            {field("Latitude",
              <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="e.g. 20.5937" className={inputCls} />,
              errors.lat)}
            {field("Longitude",
              <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="e.g. 78.9629" className={inputCls} />,
              errors.lng)}
          </div>
          <p className="text-[11px] text-on-surface-variant -mt-2">Leave blank to clear the saved location.</p>

          {saveError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {saveError}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-outline-variant/20 bg-surface-container-lowest px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
