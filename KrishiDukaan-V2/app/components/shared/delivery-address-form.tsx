"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext";
import { INDIAN_STATES } from "../../dashboard/_types/delivery-settings";
import { isDeliverable, type DeliveryAddress } from "../../lib/delivery-address";

/**
 * The delivery address in the profile: the same fields, order and pincode
 * lookup as checkout, saved to the same place (lib/delivery-address.ts), so
 * checkout opens already filled and either screen can change it.
 */
export function DeliveryAddressForm({
  value,
  onSave,
}: {
  value: DeliveryAddress;
  /** Saves and resolves true, or throws / resolves false. */
  onSave: (a: DeliveryAddress) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [a, setA] = useState<DeliveryAddress>(value);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof DeliveryAddress, v: string) => { setA((cur) => ({ ...cur, [k]: v })); setStatus(null); };

  // A newer saved address (checkout saved one) replaces what is shown.
  useEffect(() => { setA(value); }, [value]);

  // Pincode → town, district, state, exactly like checkout.
  const lastPin = useRef(value.pincode);
  useEffect(() => {
    const pin = a.pincode.trim();
    if (!/^[1-9]\d{5}$/.test(pin) || pin === lastPin.current) return;
    lastPin.current = pin;
    let cancelled = false;
    fetch(`/api/pincode/${pin}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.state) return;
        setA((cur) => ({ ...cur, city: d.city || cur.city, district: d.district || cur.district, state: d.state }));
      })
      .catch(() => { /* lookup down: the fields stay editable */ });
    return () => { cancelled = true; };
  }, [a.pincode]);

  const save = async () => {
    if (!isDeliverable(a)) {
      setStatus({ ok: false, text: `${t("cartPincode")}, ${t("cartAddrArea")}, ${t("cartAddrCity")}, ${t("cartState")} *` });
      return;
    }
    setSaving(true);
    try {
      const ok = await onSave(a);
      setStatus(ok ? { ok: true, text: "Saved. Checkout will use this address." } : { ok: false, text: "Could not save the address." });
    } catch {
      setStatus({ ok: false, text: "Could not save the address." });
    } finally {
      setSaving(false);
    }
  };

  const input = "rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm w-full";

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-bold text-on-surface">
        <MapPin className="h-4 w-4 text-primary" /> Delivery address
      </p>
      <p className="text-xs text-on-surface-variant">
        Used for prices with delivery, delivery dates and checkout. You can still change it at checkout.
      </p>
      <input value={a.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder={`${t("cartPincode")} *`} aria-label={t("cartPincode")} inputMode="numeric" autoComplete="postal-code" maxLength={6} className={input} />
      <input value={a.house} onChange={(e) => set("house", e.target.value)} placeholder={t("cartAddrHouse")}
        aria-label={t("cartAddrHouse")} autoComplete="address-line1" maxLength={120} className={input} />
      <input value={a.area} onChange={(e) => set("area", e.target.value)} placeholder={`${t("cartAddrArea")} *`}
        aria-label={t("cartAddrArea")} maxLength={160} className={input} />
      <input value={a.landmark} onChange={(e) => set("landmark", e.target.value)} placeholder={t("cartAddrLandmark")}
        aria-label={t("cartAddrLandmark")} maxLength={80} className={input} />
      <input value={a.city} onChange={(e) => set("city", e.target.value)} placeholder={`${t("cartAddrCity")} *`}
        aria-label={t("cartAddrCity")} autoComplete="address-level2" className={input} />
      <select value={a.state} onChange={(e) => set("state", e.target.value)} aria-label={t("cartState")} className={input}>
        <option value="">{`${t("cartAddrStateSelect")} *`}</option>
        {a.state && !INDIAN_STATES.includes(a.state) && <option value={a.state}>{a.state}</option>}
        {INDIAN_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
      </select>
      <button type="button" onClick={() => void save()} disabled={saving}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-50">
        {saving ? "Saving…" : "Save address"}
      </button>
      {status && <p className={`text-xs font-semibold ${status.ok ? "text-green-700" : "text-red-700"}`}>{status.text}</p>}
    </div>
  );
}
