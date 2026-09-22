"use client";

/**
 * Admin control for the self-serve subscription price and promo codes.
 *
 * Before this page existed, the per-listing price was hardcoded in three code
 * files and promo codes had to be typed into the Firestore console by hand —
 * and the admin Plans tab (which DOES have a price field) only affected
 * admin-assigned subscriptions, never what a self-serve seller was charged.
 *
 * Everything here writes through /api/admin/* with requireAdmin + adminLogs.
 * Saving the ladder changes what sellers are billed on their next checkout.
 */

import { useCallback, useEffect, useState } from "react";
import { auth } from "../../firebase";
import { DEFAULT_DURATIONS, type DurationPrice } from "../../lib/pricing";

/** Standard billing periods offered by the subscription ladder. */
const PLAN_OPTIONS: { months: number; label: string }[] = [
  { months: 1,  label: "Monthly (1 mo)" },
  { months: 3,  label: "3 Months" },
  { months: 6,  label: "6 Months" },
  { months: 12, label: "Yearly (12 mo)" },
];

interface PromoRow {
  id: string;
  code: string;
  discountPercent: number;
  active: boolean;
  note: string;
  applicablePlans?: number[];
  minSeats?: number;
  maxSeats?: number;
  startDate?: string;
  endDate?: string;
}

interface PromoForm {
  code: string;
  discountPercent: string;
  note: string;
  applicablePlans: number[];
  minSeats: string;
  maxSeats: string;
  startDate: string;
  endDate: string;
  active: boolean;
}

const EMPTY_FORM: PromoForm = {
  code: "",
  discountPercent: "",
  note: "",
  applicablePlans: [],
  minSeats: "",
  maxSeats: "",
  startDate: "",
  endDate: "",
  active: true,
};

async function authedFetch(url: string, init?: RequestInit) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

export default function AdminPricingPage() {
  const [rows, setRows] = useState<DurationPrice[]>(DEFAULT_DURATIONS);
  const [usingDefaults, setUsingDefaults] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [promoForm, setPromoForm] = useState<PromoForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoMsg, setPromoMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        authedFetch("/api/admin/pricing"),
        authedFetch("/api/admin/promo-codes"),
      ]);
      if (pRes.ok) {
        const d = await pRes.json();
        setRows(d.durations ?? DEFAULT_DURATIONS);
        setUsingDefaults(Boolean(d.usingDefaults));
      }
      if (cRes.ok) {
        setPromos((await cRes.json()).codes ?? []);
      } else {
        const err = await cRes.json().catch(() => ({}));
        setPromoMsg({
          kind: "err",
          text: err.error ?? `Could not load promo codes (HTTP ${cRes.status}). Check that you are signed in as an admin.`,
        });
      }
    } catch {
      setMsg({ kind: "err", text: "Could not load pricing. Check your connection." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => { if (u) void load(); });
    return () => unsub();
  }, [load]);

  const setRow = (i: number, patch: Partial<DurationPrice>) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const savePricing = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await authedFetch("/api/admin/pricing", {
        method: "PUT",
        body: JSON.stringify({ durations: rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ kind: "err", text: data.error ?? "Save failed." });
      } else {
        setRows(data.durations);
        setUsingDefaults(false);
        setMsg({ kind: "ok", text: "Saved. New checkouts will use these prices." });
      }
    } catch {
      setMsg({ kind: "err", text: "Save failed. Check your connection." });
    } finally {
      setSaving(false);
    }
  };

  const togglePlan = (months: number) => {
    setPromoForm((f) => ({
      ...f,
      applicablePlans: f.applicablePlans.includes(months)
        ? f.applicablePlans.filter((m) => m !== months)
        : [...f.applicablePlans, months],
    }));
  };

  const startEdit = (p: PromoRow) => {
    setEditingId(p.id);
    setPromoForm({
      code: p.code,
      discountPercent: String(p.discountPercent),
      note: p.note,
      applicablePlans: p.applicablePlans ?? [],
      minSeats: p.minSeats != null ? String(p.minSeats) : "",
      maxSeats: p.maxSeats != null ? String(p.maxSeats) : "",
      startDate: p.startDate ?? "",
      endDate: p.endDate ?? "",
      active: p.active,
    });
    setPromoMsg(null);
    // Scroll to form
    document.getElementById("promo-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setPromoForm(EMPTY_FORM);
    setPromoMsg(null);
  };

  const submitPromo = async () => {
    setPromoBusy(true);
    setPromoMsg(null);
    try {
      const payload = {
        code: promoForm.code,
        discountPercent: Number(promoForm.discountPercent),
        note: promoForm.note,
        active: promoForm.active,
        ...(promoForm.applicablePlans.length > 0
          ? { applicablePlans: promoForm.applicablePlans }
          : { applicablePlans: [] }),
        ...(promoForm.minSeats ? { minSeats: Number(promoForm.minSeats) } : { minSeats: null }),
        ...(promoForm.maxSeats ? { maxSeats: Number(promoForm.maxSeats) } : { maxSeats: null }),
        ...(promoForm.startDate ? { startDate: promoForm.startDate } : { startDate: null }),
        ...(promoForm.endDate ? { endDate: promoForm.endDate } : { endDate: null }),
      };

      let res: Response;
      if (editingId) {
        const { code: _code, ...patchPayload } = payload;
        res = await authedFetch(
          `/api/admin/promo-codes/${encodeURIComponent(editingId)}`,
          { method: "PATCH", body: JSON.stringify(patchPayload) },
        );
      } else {
        res = await authedFetch("/api/admin/promo-codes", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        setPromoMsg({ kind: "err", text: data.error ?? "Could not save promo code." });
      } else {
        setEditingId(null);
        setPromoForm(EMPTY_FORM);
        setPromoMsg({
          kind: "ok",
          text: editingId ? `Updated ${editingId}.` : `Created ${data.id}.`,
        });
        void load();
      }
    } finally {
      setPromoBusy(false);
    }
  };

  const patchPromo = async (id: string, patch: Record<string, unknown>) => {
    await authedFetch(`/api/admin/promo-codes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    void load();
  };

  const deletePromo = async (id: string) => {
    await authedFetch(`/api/admin/promo-codes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    void load();
  };

  const banner = (m: { kind: "ok" | "err"; text: string }) => (
    <div
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
        m.kind === "ok"
          ? "bg-primary/10 text-primary"
          : "bg-red-50 text-red-700"
      }`}
    >
      {m.text}
    </div>
  );

  const planLabel = (months: number) =>
    months === 12 ? "Yearly" : months === 1 ? "Monthly" : `${months} Mo`;

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-10 py-8">
      {/* ── Pricing ladder ── */}
      <section>
        <h1 className="text-xl font-black text-on-surface">Subscription pricing</h1>
        <p className="mt-1.5 text-sm text-on-surface-variant">
          The per-listing price sellers pay at checkout. Changing this updates the
          checkout, the seller dashboard and the public <code>/sell</code> page —
          all three read this one setting.
        </p>

        {usingDefaults ? (
          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">
            No saved pricing yet — showing the built-in defaults. Save to make them
            editable.
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          <p className="mb-3 text-xs text-on-surface-variant">
            Leave <strong>₹ flat</strong> empty for a normal per-listing price. Fill it in to
            sell a bundle — the seller pays that one amount for up to{" "}
            <strong>Listings incl.</strong> listings, and the per-listing price is ignored.
            {" "}Use <strong>Who can buy</strong> to keep a plan off the wrong account type —
            a retailer bundle left open to everyone lets a manufacturer buy it instead of a
            volume contract.
          </p>
          {rows.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-3 rounded-2xl border border-surface-container bg-white p-4 sm:grid-cols-[110px_130px_130px_130px_minmax(140px,260px)_150px_auto]"
            >
              <label className="text-sm">
                <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                  Months
                </span>
                <input
                  type="number"
                  min={1}
                  value={r.months}
                  onChange={(e) => setRow(i, { months: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                  ₹ per listing
                </span>
                <input
                  type="number"
                  min={0}
                  value={r.pricePerSeat}
                  onChange={(e) => setRow(i, { pricePerSeat: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                  ₹ flat (bundle)
                </span>
                <input
                  type="number"
                  min={0}
                  placeholder="—"
                  value={r.flatPrice ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setRow(i, v === ""
                      ? { flatPrice: undefined, includedListings: undefined }
                      : { flatPrice: Number(v), includedListings: r.includedListings ?? 50 });
                  }}
                  className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                  Listings incl.
                </span>
                <input
                  type="number"
                  min={1}
                  placeholder="—"
                  disabled={r.flatPrice === undefined}
                  value={r.includedListings ?? ""}
                  onChange={(e) => setRow(i, { includedListings: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2 disabled:bg-surface-container/40"
                />
              </label>
              <label className="text-sm">
                <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                  Badge (optional)
                </span>
                <input
                  value={r.badge ?? ""}
                  placeholder="Save 14%"
                  onChange={(e) => setRow(i, { badge: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                  Who can buy
                </span>
                <select
                  value={r.roles?.length ? r.roles[0] : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRow(i, { roles: v ? [v] : undefined });
                  }}
                  className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                >
                  <option value="">Everyone</option>
                  <option value="retailer">Retailers only</option>
                  <option value="manufacturer">Manufacturers only</option>
                </select>
              </label>
              <button
                onClick={() => setRows((x) => x.filter((_, j) => j !== i))}
                disabled={rows.length <= 1}
                className="self-end rounded-lg px-3 py-2 text-sm font-bold text-red-600 disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() =>
              setRows((r) => [...r, { months: 1, pricePerSeat: 0 }])
            }
            className="rounded-xl border border-surface-container px-4 py-2 text-sm font-bold text-on-surface"
          >
            Add duration
          </button>
          <button
            onClick={savePricing}
            disabled={saving}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save pricing"}
          </button>
          {msg ? banner(msg) : null}
        </div>
      </section>

      {/* ── Promo codes ── */}
      <section className="border-t border-surface-container pt-8">
        <h2 className="text-xl font-black text-on-surface">Promo codes</h2>
        <p className="mt-1.5 text-sm text-on-surface-variant">
          Percentage discounts sellers can apply at checkout. The discount is
          re-checked on the server when the payment is created — conditions like
          plan restrictions, seat limits and expiry are enforced server-side.
        </p>

        {/* ── Create / Edit form ── */}
        <div
          id="promo-form"
          className="mt-5 rounded-2xl border border-surface-container bg-white p-5 space-y-4"
        >
          <h3 className="text-sm font-black text-on-surface">
            {editingId ? `Edit — ${editingId}` : "Add promo code"}
          </h3>

          {/* Row 1: Code, Discount %, Active */}
          <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto]">
            <label className="text-sm">
              <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                Code *
              </span>
              <input
                value={promoForm.code}
                placeholder="LAUNCH20"
                disabled={!!editingId}
                onChange={(e) =>
                  setPromoForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                }
                className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2 disabled:bg-surface-container/30 disabled:cursor-not-allowed"
              />
            </label>
            <label className="text-sm">
              <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                Discount % *
              </span>
              <input
                type="number"
                min={1}
                max={100}
                step="any"
                value={promoForm.discountPercent}
                onChange={(e) =>
                  setPromoForm((f) => ({ ...f, discountPercent: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
              />
            </label>
            <label className="flex items-end gap-2 pb-0.5 text-sm">
              <input
                type="checkbox"
                checked={promoForm.active}
                onChange={(e) => setPromoForm((f) => ({ ...f, active: e.target.checked }))}
                className="h-4 w-4 accent-primary"
              />
              <span className="font-semibold text-on-surface">Active</span>
            </label>
          </div>

          {/* Row 2: Note */}
          <label className="block text-sm">
            <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
              Internal note
            </span>
            <input
              value={promoForm.note}
              placeholder="e.g. Yearly discount for launch campaign"
              onChange={(e) => setPromoForm((f) => ({ ...f, note: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
            />
          </label>

          {/* Row 3: Applicable plans */}
          <div className="text-sm">
            <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant mb-2">
              Applicable plans
              <span className="ml-1 font-normal normal-case text-on-surface-variant/70">
                (leave all unchecked = valid for every plan)
              </span>
            </span>
            <div className="flex flex-wrap gap-3">
              {PLAN_OPTIONS.map((opt) => (
                <label key={opt.months} className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={promoForm.applicablePlans.includes(opt.months)}
                    onChange={() => togglePlan(opt.months)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-sm font-medium text-on-surface">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Row 4: Seat conditions */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                Minimum seats
                <span className="ml-1 font-normal normal-case text-on-surface-variant/70">(optional)</span>
              </span>
              <input
                type="number"
                min={1}
                placeholder="—"
                value={promoForm.minSeats}
                onChange={(e) => setPromoForm((f) => ({ ...f, minSeats: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                Maximum seats
                <span className="ml-1 font-normal normal-case text-on-surface-variant/70">(optional)</span>
              </span>
              <input
                type="number"
                min={1}
                placeholder="—"
                value={promoForm.maxSeats}
                onChange={(e) => setPromoForm((f) => ({ ...f, maxSeats: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
              />
            </label>
          </div>

          {/* Row 5: Dates */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                Start date
                <span className="ml-1 font-normal normal-case text-on-surface-variant/70">(optional, defaults to now)</span>
              </span>
              <input
                type="date"
                value={promoForm.startDate}
                onChange={(e) => setPromoForm((f) => ({ ...f, startDate: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                End date
                <span className="ml-1 font-normal normal-case text-on-surface-variant/70">(optional, leave blank = no expiry)</span>
              </span>
              <input
                type="date"
                value={promoForm.endDate}
                onChange={(e) => setPromoForm((f) => ({ ...f, endDate: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
              />
            </label>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={submitPromo}
              disabled={promoBusy || !promoForm.code || !promoForm.discountPercent}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {promoBusy ? "Saving…" : editingId ? "Save changes" : "Add"}
            </button>
            {editingId && (
              <button
                onClick={cancelEdit}
                className="rounded-xl border border-surface-container px-4 py-2.5 text-sm font-bold text-on-surface"
              >
                Cancel
              </button>
            )}
            {promoMsg ? banner(promoMsg) : null}
          </div>
        </div>

        {/* ── Promo code list ── */}
        <div className="mt-5 space-y-2">
          {promos.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              No promo codes yet.{" "}
              {!promoMsg && (
                <span className="text-xs">
                  If codes exist in Firestore but are not showing, check the browser console for
                  API errors and confirm you are signed in as an admin.
                </span>
              )}
            </p>
          ) : (
            promos.map((p) => (
              <div
                key={p.id}
                className={`rounded-2xl border bg-white px-4 py-3 ${
                  editingId === p.id ? "border-primary ring-1 ring-primary/30" : "border-surface-container"
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm font-black text-on-surface">
                    {p.code}
                  </span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-black text-primary">
                    {p.discountPercent}% off
                  </span>

                  {/* Plan badges */}
                  {p.applicablePlans?.length ? (
                    <span className="flex flex-wrap gap-1">
                      {p.applicablePlans.map((m) => (
                        <span
                          key={m}
                          className="rounded-full bg-surface-container-low px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant"
                        >
                          {planLabel(m)}
                        </span>
                      ))}
                    </span>
                  ) : null}

                  {/* Seat conditions */}
                  {(p.minSeats != null || p.maxSeats != null) && (
                    <span className="text-xs text-on-surface-variant">
                      {p.minSeats != null && p.maxSeats != null
                        ? `${p.minSeats}–${p.maxSeats} seats`
                        : p.minSeats != null
                        ? `≥${p.minSeats} seats`
                        : `≤${p.maxSeats} seats`}
                    </span>
                  )}

                  {/* Date range */}
                  {(p.startDate || p.endDate) && (
                    <span className="text-xs text-on-surface-variant">
                      {p.startDate && p.endDate
                        ? `${p.startDate} → ${p.endDate}`
                        : p.startDate
                        ? `from ${p.startDate}`
                        : `until ${p.endDate}`}
                    </span>
                  )}

                  {p.note ? (
                    <span className="text-xs text-on-surface-variant">{p.note}</span>
                  ) : null}

                  <span className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => patchPromo(p.id, { active: !p.active })}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                        p.active
                          ? "bg-primary/10 text-primary"
                          : "bg-surface-container-low text-on-surface-variant"
                      }`}
                    >
                      {p.active ? "Active" : "Inactive"}
                    </button>
                    <button
                      onClick={() => startEdit(p)}
                      className="rounded-lg bg-surface-container-low px-3 py-1.5 text-xs font-bold text-on-surface"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deletePromo(p.id)}
                      className="rounded-lg px-3 py-1.5 text-xs font-bold text-red-600"
                    >
                      Delete
                    </button>
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
