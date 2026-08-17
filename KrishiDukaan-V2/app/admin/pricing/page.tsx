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

interface PromoRow {
  id: string;
  code: string;
  discountPercent: number;
  active: boolean;
  note: string;
}

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
  const [promoForm, setPromoForm] = useState({ code: "", discountPercent: "", note: "" });
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
      if (cRes.ok) setPromos((await cRes.json()).codes ?? []);
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

  const createPromo = async () => {
    setPromoBusy(true);
    setPromoMsg(null);
    try {
      const res = await authedFetch("/api/admin/promo-codes", {
        method: "POST",
        body: JSON.stringify({
          code: promoForm.code,
          discountPercent: Number(promoForm.discountPercent),
          note: promoForm.note,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPromoMsg({ kind: "err", text: data.error ?? "Could not create code." });
      } else {
        setPromoForm({ code: "", discountPercent: "", note: "" });
        setPromoMsg({ kind: "ok", text: `Created ${data.id}.` });
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

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10 py-8">
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
          {rows.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-3 rounded-2xl border border-surface-container bg-white p-4 sm:grid-cols-[110px_130px_1fr_auto]"
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
                  Badge (optional)
                </span>
                <input
                  value={r.badge ?? ""}
                  placeholder="Save 14%"
                  onChange={(e) => setRow(i, { badge: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                />
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
          re-checked on the server when the payment is created, so what is shown
          and what is charged always match.
        </p>

        <div className="mt-5 grid gap-3 rounded-2xl border border-surface-container bg-white p-4 sm:grid-cols-[1fr_120px_1fr_auto]">
          <label className="text-sm">
            <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
              Code
            </span>
            <input
              value={promoForm.code}
              placeholder="LAUNCH20"
              onChange={(e) =>
                setPromoForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
              }
              className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
              % off
            </span>
            <input
              type="number"
              min={1}
              max={100}
              value={promoForm.discountPercent}
              onChange={(e) =>
                setPromoForm((f) => ({ ...f, discountPercent: e.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
              Note (internal)
            </span>
            <input
              value={promoForm.note}
              onChange={(e) => setPromoForm((f) => ({ ...f, note: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
            />
          </label>
          <button
            onClick={createPromo}
            disabled={promoBusy || !promoForm.code || !promoForm.discountPercent}
            className="self-end rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {promoMsg ? <div className="mt-3">{banner(promoMsg)}</div> : null}

        <div className="mt-5 space-y-2">
          {promos.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No promo codes yet.</p>
          ) : (
            promos.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-surface-container bg-white px-4 py-3"
              >
                <span className="font-mono text-sm font-black text-on-surface">
                  {p.code}
                </span>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-black text-primary">
                  {p.discountPercent}% off
                </span>
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
                    onClick={() => deletePromo(p.id)}
                    className="rounded-lg px-3 py-1.5 text-xs font-bold text-red-600"
                  >
                    Delete
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
