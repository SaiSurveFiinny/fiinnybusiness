"use client";

import { useEffect, useState } from "react";
import { Gift, IndianRupee, Wallet } from "lucide-react";
import { auth } from "../../../firebase";

/**
 * The money side of courier delivery (api/admin/delivery-money,
 * docs/delivery-money-architecture.md): the platform's free-delivery
 * campaign, the courier wallets, and a weekly reconciliation.
 */

type Campaign = {
  active: boolean; running: boolean; name: string; startsAt: string; endsAt: string;
  maxPerOrder: number; budget: number; spent: number; updatedBy: string | null;
};
type Week = {
  weekOf: string; parcels: number; courierCost: number; fromCustomers: number; fromSellers: number;
  campaign: number; platform: number; toSellers: number;
};
type View = {
  campaign: Campaign | null;
  wallets: {
    shiprocket: { balance: number | null; at: string | null; error: string | null } | null;
    delhivery: { recorded: number; recordedAt: string; estimate: number } | null;
    alertBelow: number; alertPhones: string[]; checkedAt: string | null;
  };
  weeks: Week[];
  commissionPercent: number;
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
/** ISO → value for <input type="datetime-local"> in the viewer's own time. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN") : "—");

export function DeliveryMoneyPanel() {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({ name: "", startsAt: "", endsAt: "", maxPerOrder: "", budget: "", resetSpent: true });
  const [delhivery, setDelhivery] = useState("");
  const [alertBelow, setAlertBelow] = useState("");
  const [alertPhones, setAlertPhones] = useState("");

  const call = async (init?: RequestInit): Promise<View> => {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch("/api/admin/delivery-money", {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
    return body as View;
  };

  const apply = (v: View) => {
    setView(v);
    if (v.campaign) {
      setForm({
        name: v.campaign.name,
        startsAt: toLocalInput(v.campaign.startsAt),
        endsAt: toLocalInput(v.campaign.endsAt),
        maxPerOrder: v.campaign.maxPerOrder ? String(v.campaign.maxPerOrder) : "",
        budget: v.campaign.budget ? String(v.campaign.budget) : "",
        resetSpent: false,
      });
    }
    setAlertBelow(String(v.wallets.alertBelow));
    setAlertPhones(v.wallets.alertPhones.join(", "));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { call().then(apply).catch((e) => setMessage({ ok: false, text: String(e.message ?? e) })); }, []);

  const post = async (payload: Record<string, unknown>, confirmText: string | null, done: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMessage(null);
    try {
      apply(await call({ method: "POST", body: JSON.stringify(payload) }));
      setMessage({ ok: true, text: done });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Save failed." });
    } finally {
      setBusy(false);
    }
  };

  const c = view?.campaign;
  const toIso = (local: string) => (local ? new Date(local).toISOString() : "");

  return (
    <div className="space-y-6">
      {/* ── Campaign ───────────────────────────────────────────── */}
      <section className="space-y-4 rounded-2xl border border-outline-variant/30 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <span>
            <span className="flex items-center gap-2 text-sm font-bold text-on-surface">
              <Gift className="h-4 w-4 text-primary" /> Free-delivery campaign
            </span>
            <span className="block text-xs text-on-surface-variant">
              Free courier delivery on every product, paid by KrishiDukan. A seller who already offers free or part
              delivery still pays their own offer; KrishiDukan pays the rest. Orders no courier serves are delivered
              by the seller at their own charge.
            </span>
          </span>
          {c && (
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${c.running ? "bg-green-100 text-green-800" : "bg-surface-container text-on-surface-variant"}`}>
              {c.running ? "Running now" : c.active ? "Scheduled / ended / budget used" : "Off"}
            </span>
          )}
        </div>

        {c && (
          <p className="text-xs text-on-surface-variant">
            Spent so far: <b>{inr(c.spent)}</b>{c.budget > 0 ? <> of {inr(c.budget)}</> : " (no budget limit)"}
            {c.maxPerOrder > 0 && <> · up to {inr(c.maxPerOrder)} per parcel</>}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-on-surface-variant sm:col-span-2">
            Name customers see
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60}
              placeholder="e.g. Diwali free delivery"
              className="mt-1 w-full rounded-xl border border-outline-variant/40 px-3 py-2 text-sm font-normal text-on-surface" />
          </label>
          <label className="text-xs font-semibold text-on-surface-variant">
            Starts
            <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              className="mt-1 w-full rounded-xl border border-outline-variant/40 px-3 py-2 text-sm font-normal text-on-surface" />
          </label>
          <label className="text-xs font-semibold text-on-surface-variant">
            Ends
            <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              className="mt-1 w-full rounded-xl border border-outline-variant/40 px-3 py-2 text-sm font-normal text-on-surface" />
          </label>
          <label className="text-xs font-semibold text-on-surface-variant">
            Most per parcel (₹, empty = no limit)
            <input inputMode="decimal" value={form.maxPerOrder} onChange={(e) => setForm({ ...form, maxPerOrder: e.target.value })}
              className="mt-1 w-full rounded-xl border border-outline-variant/40 px-3 py-2 text-sm font-normal text-on-surface" />
          </label>
          <label className="text-xs font-semibold text-on-surface-variant">
            Total budget (₹, empty = no limit)
            <input inputMode="decimal" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })}
              className="mt-1 w-full rounded-xl border border-outline-variant/40 px-3 py-2 text-sm font-normal text-on-surface" />
          </label>
          <label className="flex items-center gap-2 text-xs text-on-surface-variant sm:col-span-2">
            <input type="checkbox" checked={form.resetSpent} onChange={(e) => setForm({ ...form, resetSpent: e.target.checked })} />
            This is a new campaign: start its spend from ₹0
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy}
            onClick={() => void post(
              { action: "saveCampaign", active: true, name: form.name, startsAt: toIso(form.startsAt), endsAt: toIso(form.endsAt),
                maxPerOrder: form.maxPerOrder, budget: form.budget, resetSpent: form.resetSpent },
              `Start "${form.name || "this campaign"}"? Customers will see free courier delivery between the dates you set, paid by KrishiDukan.`,
              "Campaign saved. Checkout picks it up within a minute.")}
            className="rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            Save and switch on
          </button>
          {c?.active && (
            <button type="button" disabled={busy}
              onClick={() => void post({ action: "stopCampaign" }, "Stop the free-delivery campaign now?", "Campaign stopped.")}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              Stop now
            </button>
          )}
        </div>
      </section>

      {/* ── Wallets ────────────────────────────────────────────── */}
      <section className="space-y-4 rounded-2xl border border-outline-variant/30 bg-white p-5">
        <span className="flex items-center gap-2 text-sm font-bold text-on-surface">
          <Wallet className="h-4 w-4 text-primary" /> Courier wallets
        </span>
        <p className="text-xs text-on-surface-variant">
          Couriers are paid from these pre-funded wallets. Top them up in each courier&rsquo;s own panel. If a wallet
          runs dry, bookings go to the other courier, then to the seller.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-outline-variant/30 p-3">
            <p className="text-xs font-semibold text-on-surface-variant">Shiprocket (live from Shiprocket)</p>
            <p className="text-xl font-black text-on-surface">
              {view?.wallets.shiprocket?.balance != null ? inr(view.wallets.shiprocket.balance) : "—"}
            </p>
            <p className="text-[11px] text-on-surface-variant">
              Checked {when(view?.wallets.shiprocket?.at ?? null)}
              {view?.wallets.shiprocket?.error && <span className="block text-red-700">Last check failed: {view.wallets.shiprocket.error}</span>}
            </p>
          </div>
          <div className="rounded-xl border border-outline-variant/30 p-3">
            <p className="text-xs font-semibold text-on-surface-variant">Delhivery (estimated: no balance API)</p>
            <p className="text-xl font-black text-on-surface">
              {view?.wallets.delhivery ? inr(view.wallets.delhivery.estimate) : "Not recorded"}
            </p>
            <p className="text-[11px] text-on-surface-variant">
              {view?.wallets.delhivery
                ? <>You entered {inr(view.wallets.delhivery.recorded)} on {when(view.wallets.delhivery.recordedAt)}, less bookings since.</>
                : "Enter the balance shown in Delhivery's panel after each top-up."}
            </p>
            <div className="mt-2 flex gap-2">
              <input inputMode="decimal" value={delhivery} onChange={(e) => setDelhivery(e.target.value)} placeholder="Balance now, ₹"
                className="w-full rounded-xl border border-outline-variant/40 px-3 py-1.5 text-sm" />
              <button type="button" disabled={busy || !delhivery}
                onClick={() => void post({ action: "recordDelhiveryBalance", rupees: Number(delhivery) }, null, "Delhivery balance recorded.").then(() => setDelhivery(""))}
                className="shrink-0 rounded-xl border border-outline-variant/40 px-3 py-1.5 text-sm font-bold disabled:opacity-50">
                Save
              </button>
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
          <label className="text-xs font-semibold text-on-surface-variant">
            Alert below (₹)
            <input inputMode="decimal" value={alertBelow} onChange={(e) => setAlertBelow(e.target.value)}
              className="mt-1 w-full rounded-xl border border-outline-variant/40 px-3 py-2 text-sm font-normal" />
          </label>
          <label className="text-xs font-semibold text-on-surface-variant">
            Tell these phones (10 digits, comma separated)
            <input value={alertPhones} onChange={(e) => setAlertPhones(e.target.value)} placeholder="9876543210, 9123456789"
              className="mt-1 w-full rounded-xl border border-outline-variant/40 px-3 py-2 text-sm font-normal" />
          </label>
          <button type="button" disabled={busy}
            onClick={() => void post({
              action: "walletAlerts", alertBelow: Number(alertBelow),
              alertPhones: alertPhones.split(",").map((p) => p.trim()).filter(Boolean),
            }, null, "Alerts saved. Wallets are checked every hour.")}
            className="rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-bold disabled:opacity-50">
            Save alerts
          </button>
        </div>
      </section>

      {/* ── Weekly reconciliation ──────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border border-outline-variant/30 bg-white p-5">
        <span className="flex items-center gap-2 text-sm font-bold text-on-surface">
          <IndianRupee className="h-4 w-4 text-primary" /> Delivery money, week by week
        </span>
        <p className="text-xs text-on-surface-variant">
          Real bookings only (test bookings are left out). &ldquo;Platform&rdquo; is what KrishiDukan paid beyond the
          campaign; negative means a small surplus. Commission is {view?.commissionPercent ?? "—"}% of goods.
        </p>
        {view && view.weeks.length === 0 && <p className="text-sm text-on-surface-variant">No real courier bookings yet.</p>}
        {view && view.weeks.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-outline-variant/40 text-left text-xs uppercase tracking-wide text-on-surface-variant">
                  <th className="pb-2 pr-3">Week of</th>
                  <th className="pb-2 pr-3 text-right">Parcels</th>
                  <th className="pb-2 pr-3 text-right">Courier cost</th>
                  <th className="pb-2 pr-3 text-right">From customers</th>
                  <th className="pb-2 pr-3 text-right">From sellers</th>
                  <th className="pb-2 pr-3 text-right">Campaign</th>
                  <th className="pb-2 pr-3 text-right">Platform</th>
                  <th className="pb-2 text-right">To sellers (no courier)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/25">
                {view.weeks.map((w) => (
                  <tr key={w.weekOf}>
                    <td className="py-2 pr-3">{w.weekOf}</td>
                    <td className="py-2 pr-3 text-right">{w.parcels}</td>
                    <td className="py-2 pr-3 text-right">{inr(w.courierCost)}</td>
                    <td className="py-2 pr-3 text-right">{inr(w.fromCustomers)}</td>
                    <td className="py-2 pr-3 text-right">{inr(w.fromSellers)}</td>
                    <td className="py-2 pr-3 text-right">{inr(w.campaign)}</td>
                    <td className={`py-2 pr-3 text-right ${w.platform > 0 ? "text-red-700" : "text-green-700"}`}>{inr(w.platform)}</td>
                    <td className="py-2 text-right">{inr(w.toSellers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {message && (
        <p className={`rounded-xl px-4 py-3 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
