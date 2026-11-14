"use client";

/**
 * Order Analytics panel — hash-based navigation between two sections.
 *
 * URL hashes:
 *   #summary              → Order Summary (financial tiles + payment distribution)
 *   #retailer-breakdown   → Retailer-wise Breakdown (per-retailer rerouting table)
 *
 * Both sections read from the same filtered order set, so the numbers
 * always reconcile with the orders table on the page.
 *
 * The panel is collapsed by default; expanding it notifies the parent via
 * onOpenChange, which gates the analytics fetch so data loads only on demand.
 */

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3, Loader2, ShoppingBag, Wallet, Undo2, TrendingUp,
  AlertTriangle, ArrowDownUp, Store, Factory, Ban, Shuffle, ChevronDown,
} from "lucide-react";
import type { OrderDoc } from "../../../../types/order";
import {
  computeFinancialSummary, computePaymentDistribution, computeRetailerBreakdown,
  PAYMENT_BUCKET_META, type RetailerSortKey,
} from "../_lib/order-analytics";

const inr = (n: number) => `₹${(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString("en-IN");

type TabKey = "summary" | "retailer-breakdown";

const TABS: { key: TabKey; label: string; hash: string }[] = [
  { key: "summary",             label: "Order Summary",        hash: "#summary" },
  { key: "retailer-breakdown",  label: "Retailer Breakdown",   hash: "#retailer-breakdown" },
];

function hashToTab(hash: string): TabKey {
  return hash === "#retailer-breakdown" ? "retailer-breakdown" : "summary";
}

// ── Shared tile component ─────────────────────────────────────────────────────

function SummaryTile({ icon: Icon, label, value, tone = "default" }: {
  icon: any; label: string; value: string; tone?: "default" | "green" | "red" | "amber" | "blue";
}) {
  const toneCls =
    tone === "green" ? "text-green-700"
      : tone === "red" ? "text-red-600"
        : tone === "amber" ? "text-amber-700"
          : tone === "blue" ? "text-blue-700"
            : "text-on-surface";
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3">
      <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className={`mt-1 text-base font-black ${toneCls}`}>{value}</p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function OrderAnalyticsPanel({
  orders, loading, error, complete, onSelectSeller, onOpenChange,
}: {
  orders: OrderDoc[];
  loading: boolean;
  error: string | null;
  /** True when `orders` is the full server-matched filtered set. */
  complete: boolean;
  onSelectSeller: (sellerKey: string) => void;
  /** Notifies the parent when the panel is expanded/collapsed, so it can gate the analytics fetch. */
  onOpenChange?: (open: boolean) => void;
}) {
  // Collapsed by default — the parent only loads analytics data once this opens.
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [sortBy, setSortBy] = useState<RetailerSortKey>("received");

  // Keep the parent's fetch gate in sync with the open state.
  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);

  // Sync tab state with URL hash on mount and browser back/forward.
  useEffect(() => {
    const sync = () => setActiveTab(hashToTab(window.location.hash));
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const switchTab = (tab: TabKey) => {
    setActiveTab(tab);
    const hash = TABS.find((t) => t.key === tab)!.hash;
    // pushState updates the URL without triggering scroll-to-anchor.
    window.history.pushState(null, "", hash);
  };

  const summary   = useMemo(() => computeFinancialSummary(orders), [orders]);
  const dist      = useMemo(() => computePaymentDistribution(orders), [orders]);
  const retailers = useMemo(() => computeRetailerBreakdown(orders, sortBy), [orders, sortBy]);

  const sortBtn = (key: RetailerSortKey, label: string) => (
    <button
      type="button"
      onClick={() => setSortBy(key)}
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${
        sortBy === key
          ? "bg-primary text-white"
          : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
      }`}
    >
      <ArrowDownUp className="h-3 w-3" /> {label}
    </button>
  );

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">

      {/* ── Collapse header (always visible) ──────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-container-low/60"
      >
        <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-sm font-bold text-on-surface">Order Analytics</span>
        {open && !loading && (
          <span className="text-[11px] text-on-surface-variant whitespace-nowrap">
            · {num(summary.totalOrders)} orders{complete ? "" : " (partial)"}
          </span>
        )}
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-on-surface-variant transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
      <>
      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-y border-outline-variant/20 px-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => switchTab(tab.key)}
            className={`relative px-4 py-3 text-sm font-bold transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? "text-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* ── Content area ────────────────────────────────────────────────────── */}
      <div className="p-4">
        {error && (
          <p className="mb-3 flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" /> {error}
          </p>
        )}

        {loading ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics…
          </p>
        ) : (
          <>
            {!complete && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700">
                Showing analytics for the orders loaded so far. Narrow the date range to see the full set.
              </p>
            )}

            {/* ── Order Summary tab ──────────────────────────────────────────── */}
            {activeTab === "summary" && (
              <div className="space-y-5">

                {/* Financial tiles */}
                <section>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                    Financial summary
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <SummaryTile icon={ShoppingBag}   label="Total orders"   value={num(summary.totalOrders)} />
                    <SummaryTile icon={TrendingUp}    label="Total value"    value={inr(summary.totalValue)} />
                    <SummaryTile icon={Wallet}        label="Collected"      value={inr(summary.collected)}     tone="green" />
                    <SummaryTile icon={Undo2}         label="Refunded"       value={inr(summary.refunded)}      tone="red" />
                    <SummaryTile icon={Wallet}        label="Net collected"  value={inr(summary.netCollected)}  tone="green" />
                    <SummaryTile icon={AlertTriangle} label="Pending"        value={inr(summary.unpaidValue)}   tone="amber" />
                    <SummaryTile icon={Ban}           label="Lost value"     value={inr(summary.lostValue)}     tone="red" />
                    <SummaryTile icon={Shuffle}       label="Rerouted value" value={inr(summary.reroutedValue)} tone="blue" />
                  </div>
                </section>

                {/* Payment distribution */}
                <section>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                    Payment distribution
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {(Object.keys(PAYMENT_BUCKET_META) as Array<keyof typeof PAYMENT_BUCKET_META>).map((b) => (
                      <div key={b} className="rounded-xl border border-outline-variant/30 p-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${PAYMENT_BUCKET_META[b].badge}`}>
                          {PAYMENT_BUCKET_META[b].label}
                        </span>
                        <p className="mt-1.5 text-lg font-black text-on-surface">{num(dist[b].count)}</p>
                        <p className="text-[11px] text-on-surface-variant">{inr(dist[b].amount)}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {/* ── Retailer Breakdown tab ─────────────────────────────────────── */}
            {activeTab === "retailer-breakdown" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-on-surface-variant">
                    Click a row to filter the orders table to that retailer.
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-on-surface-variant">Sort:</span>
                    {sortBtn("received",    "Received")}
                    {sortBtn("rerouted-in", "In")}
                    {sortBtn("rerouted-out","Out")}
                    {sortBtn("lost",        "Lost")}
                    {sortBtn("net",         "Net")}
                  </div>
                </div>

                {retailers.length === 0 ? (
                  <p className="py-6 text-center text-xs text-on-surface-variant">
                    No retailers in this selection.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
                    <table className="w-full min-w-[1000px] border-collapse text-xs">
                      <thead className="bg-surface-container-low">
                        <tr className="border-b border-outline-variant/20 text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
                          <th className="px-3 py-2 text-left">Retailer</th>
                          <th className="px-3 py-2 text-right">Orig. Orders</th>
                          <th className="px-3 py-2 text-right">Orig. Value</th>
                          <th className="px-3 py-2 text-right">In Orders</th>
                          <th className="px-3 py-2 text-right">In Value</th>
                          <th className="px-3 py-2 text-right">Out Orders</th>
                          <th className="px-3 py-2 text-right">Out Value</th>
                          <th className="px-3 py-2 text-right">Lost Orders</th>
                          <th className="px-3 py-2 text-right">Lost Value</th>
                          <th className="px-3 py-2 text-right">Net Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {retailers.map((r) => (
                          <tr
                            key={r.sellerKey}
                            onClick={() => onSelectSeller(r.sellerKey)}
                            title="Filter the orders table to this seller"
                            className="cursor-pointer border-b border-outline-variant/10 last:border-0 hover:bg-surface-container-low/70"
                          >
                            {/* Retailer */}
                            <td className="px-3 py-2.5">
                              <span className="inline-flex items-center gap-1 font-semibold text-on-surface">
                                {r.sellerType === "manufacturer"
                                  ? <Factory className="h-3 w-3 shrink-0 text-blue-600" />
                                  : <Store   className="h-3 w-3 shrink-0 text-green-600" />}
                                <span className="max-w-[180px] truncate">{r.sellerName}</span>
                              </span>
                            </td>

                            {/* Original orders received */}
                            <td className="px-3 py-2.5 text-right font-bold text-on-surface">{num(r.ordersReceived)}</td>
                            <td className="px-3 py-2.5 text-right text-on-surface">{inr(r.valueReceived)}</td>

                            {/* Rerouted in */}
                            <td className="px-3 py-2.5 text-right text-on-surface-variant">
                              {r.reroutedInOrders > 0 ? num(r.reroutedInOrders) : <span className="opacity-30">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right text-blue-700">
                              {r.reroutedInValue > 0 ? inr(r.reroutedInValue) : <span className="opacity-30 text-on-surface-variant">—</span>}
                            </td>

                            {/* Rerouted out */}
                            <td className="px-3 py-2.5 text-right text-on-surface-variant">
                              {r.reroutedOutOrders > 0 ? num(r.reroutedOutOrders) : <span className="opacity-30">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right text-orange-700">
                              {r.reroutedOutValue > 0 ? inr(r.reroutedOutValue) : <span className="opacity-30 text-on-surface-variant">—</span>}
                            </td>

                            {/* Lost */}
                            <td className="px-3 py-2.5 text-right text-on-surface-variant">
                              {r.lostOrders > 0 ? num(r.lostOrders) : <span className="opacity-30">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right text-red-600">
                              {r.lostValue > 0 ? inr(r.lostValue) : <span className="opacity-30 text-on-surface-variant">—</span>}
                            </td>

                            {/* Net */}
                            <td className={`px-3 py-2.5 text-right font-black ${r.netOrderValue < 0 ? "text-red-700" : "text-on-surface"}`}>
                              {inr(r.netOrderValue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      </>
      )}
    </div>
  );
}
