"use client";

/**
 * Admin → Orders. Platform-wide order ledger.
 *
 * Exists to answer the question a Razorpay payout alone can't: a payment
 * landed — WHICH products, from WHICH store, for WHICH customer? So the
 * Razorpay payment/order IDs are first-class here (matched by the search box),
 * and every row opens a drawer with the full order: items, delivery address,
 * payment, invoice, payout and status history.
 *
 * Rendering only — all reads (ordersQuery, fetchOrderTotals, searchOrdersDirect,
 * usePagedQuery) and every money action (refund, reassignment) live in their own
 * modules; this page never touches payment or order-processing logic.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getAuth } from "firebase/auth";
import {
  ShoppingCart,
  Search,
  AlertTriangle,
  Store,
  Package,
  Download,
  RefreshCw,
  Phone,
  MapPin,
  FileText,
  X,
  Undo2,
  Loader2,
  Plus,
  Shuffle,
  Eye,
  SlidersHorizontal,
  ChevronDown,
  Clock,
  Wallet,
} from "lucide-react";
import { fetchOrderTotals, ordersQuery, searchOrdersDirect, type OrderTotals } from "../_lib/admin-queries";
import { readAllDocs, usePagedQuery } from "../_lib/use-paged-query";
import { LoadMore } from "../_components/load-more";
import { formatCustomerAddress, isInvoiceReady } from "../../../types/order";
import type { OrderDoc, OrderStatus } from "../../../types/order";
import { openInvoice } from "../../utils/invoice-generator";
import {
  STATUS_META,
  STATUS_TABS,
  toMillis,
  formatDate,
  formatIso,
  inr,
  orderTotal,
  itemsOf,
  productSummary,
  StatusBadge,
  PaymentBadge,
  SellerName,
  CustomerLink,
} from "../_lib/order-display";
import { OrderAnalyticsPanel } from "./_components/order-analytics-panel";
import { FilterChips } from "./_components/filter-chips";
import {
  ColumnFilter, MultiSelectFilter, TextFilter, CustomerFilter, AmountFilter, DateFilter,
} from "./_components/order-column-filters";
import {
  EMPTY_FILTERS, matchesOrderFilters, matchesSearch, countActiveGroups,
  productOptions, sellerOptions, type OrderFilters, type SellerTypeFilter,
} from "./_lib/order-filters";
import { PAYMENT_BUCKET_META, capturedAmount, refundedAmount, paymentBucket, type PaymentBucket } from "./_lib/order-analytics";

/** Quick date presets for the compact Filters dropdown. */
const QUICK_RANGES: Array<{ key: string; label: string; range: () => { from: number | null; to: number | null } }> = [
  { key: "all",   label: "Any date", range: () => ({ from: null, to: null }) },
  { key: "today", label: "Today",    range: () => { const s = new Date(); s.setHours(0, 0, 0, 0); return { from: s.getTime(), to: null }; } },
  { key: "7d",    label: "7 days",   range: () => ({ from: Date.now() - 7 * 86400000, to: null }) },
  { key: "30d",   label: "30 days",  range: () => ({ from: Date.now() - 30 * 86400000, to: null }) },
];

/** Payment-bucket options for the Payment column multi-select. */
const PAYMENT_OPTIONS = (Object.keys(PAYMENT_BUCKET_META) as PaymentBucket[]).map((v) => ({
  value: v, label: PAYMENT_BUCKET_META[v].label,
}));

/**
 * Admin's general-purpose refund tool — issue a full or partial refund on any
 * order, any status, via /api/admin/order-refund (which reverses the
 * seller's Route transfer first when one already went out, then refunds the
 * customer through Razorpay). Distinct from the seller/customer flows that
 * refund automatically as part of rejecting or cancelling — this is for the
 * cases neither of those cover: a damaged item after delivery, a partial
 * refund, or admin acting because the customer called support instead of
 * using their own Cancel Order button.
 */
function RefundPanel({ order, onRefunded }: { order: OrderDoc; onRefunded: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ refundId: string; refundAmount: number; full: boolean } | null>(null);

  const payment = order.payment;
  const alreadyRefunded = Boolean((payment as any)?.refundId);

  if (!payment?.razorpayPaymentId) {
    return (
      <p className="text-xs text-on-surface-variant">No online payment on this order to refund.</p>
    );
  }
  if (alreadyRefunded) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-semibold text-green-700">
        <Undo2 className="h-3.5 w-3.5" /> Refunded — {(payment as any).refundId}
        {(payment as any).refundedAmount ? ` (${inr((payment as any).refundedAmount)})` : ""}
      </p>
    );
  }

  const submit = async () => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("A refund reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/admin/order-refund", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({
          orderId: order.id,
          reason: trimmedReason,
          ...(amount.trim() ? { amount: Number(amount) } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Refund failed.");
      setResult({ refundId: json.refundId, refundAmount: json.refundAmount, full: json.full });
      onRefunded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refund failed.");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-semibold text-green-700">
        <Undo2 className="h-3.5 w-3.5" /> Refunded {inr(result.refundAmount)} — {result.refundId}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
      >
        <Undo2 className="h-3.5 w-3.5" /> Refund
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Full (${inr(orderTotal(order))})`}
          className="w-36 rounded-lg border border-outline-variant/40 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-primary"
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (shown on the refund record)"
          className="min-w-[220px] flex-1 rounded-lg border border-outline-variant/40 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-primary"
        />
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
          {busy ? "Refunding…" : "Confirm refund"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-outline-variant/40 px-3 py-1.5 text-xs font-semibold text-on-surface-variant"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

type EligibleRetailer = {
  phone: string;
  name: string;
  type: "retailer" | "manufacturer";
  onRoute: boolean;
  fullyEligible: boolean;
};

/**
 * Admin "Route Order" — reassign a placed, not-yet-accepted order to another
 * eligible retailer. Shown only while the order is still `placed` (an accepted
 * order has an invoice and a committed seller — admin uses Refund for that).
 * Ownership-only on the server (api/admin/reassign-order): no Razorpay transfer
 * is created or reversed; the payout resolves the new retailer at delivery.
 */
function RouteOrderPanel({ order, onReassigned }: { order: OrderDoc; onReassigned: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [eligible, setEligible] = useState<EligibleRetailer[] | null>(null);
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Placed and accepted orders can be routed — matches the server gate exactly.
  // An accepted order that was reverted (seller unable to fulfil) is re-routable;
  // the server will reset it to placed so the new seller can accept/reject.
  const alreadyReassigned = Boolean(order.adminReassignment);
  const isRoutable = order.status === "placed" || order.status === "accepted";
  if (!isRoutable) {
    if (alreadyReassigned) {
      return (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
          <Shuffle className="h-3.5 w-3.5" /> Reassigned to {order.adminReassignment!.toSellerName}
        </p>
      );
    }
    return null;
  }

  const loadEligible = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch(`/api/admin/reassign-order?orderId=${encodeURIComponent(order.id)}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load retailers.");
      setEligible(json.eligible as EligibleRetailer[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load retailers.");
    } finally {
      setLoading(false);
    }
  };

  const openPanel = () => {
    setOpen(true);
    if (eligible === null) void loadEligible();
  };

  const submit = async () => {
    if (!selected) { setError("Choose a retailer to reassign to."); return; }
    if (!reason.trim()) { setError("A reassignment reason is required."); return; }
    setBusy(true);
    setError(null);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/admin/reassign-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ orderId: order.id, newSellerPhone: selected, reason: reason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Reassignment failed.");
      // Ownership-only: no transfer is created or reversed. The new retailer is
      // paid at delivery via the normal payout path.
      const note =
        json.existingTransfer?.kind === "held"
          ? "The customer's payment is untouched; the new retailer is paid after delivery (the original hold was left in place)."
          : json.existingTransfer?.kind === "unverified"
            ? "Ownership updated. Note: the original transfer state couldn't be verified with Razorpay — check the payout for this order."
            : "The customer's payment is untouched; the new retailer is paid after delivery.";
      setDone(`Reassigned to ${json.toSellerName}. ${note}`);
      onReassigned();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reassignment failed.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-semibold text-green-700">
        <Shuffle className="h-3.5 w-3.5" /> {done}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPanel}
        className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-xs font-bold text-orange-700 hover:bg-orange-50"
      >
        <Shuffle className="h-3.5 w-3.5" /> Route Order
      </button>
    );
  }

  const fullyEligible = (eligible ?? []).filter((r) => r.fullyEligible);
  const fallback = (eligible ?? []).filter((r) => !r.fullyEligible);
  const selectedRow = (eligible ?? []).find((r) => r.phone === selected);
  const optionLabel = (r: EligibleRetailer) =>
    `${r.name} · ${r.phone}${r.type === "manufacturer" ? " (manufacturer)" : ""}${r.onRoute ? "" : " · payout after delivery"}`;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-orange-200 bg-orange-50/40 p-3">
      <p className="text-[11px] font-bold text-orange-800">
        Reassign to another store. Stores that sell every item in this order online are
        listed first; any other store with online delivery on is offered as a fallback.
      </p>
      {loading ? (
        <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding stores…
        </p>
      ) : eligible && eligible.length === 0 ? (
        <p className="text-xs text-red-700">No other store has online delivery enabled.</p>
      ) : (
        <>
          {fullyEligible.length === 0 && (
            <p className="text-[11px] text-orange-700">
              No store sells every item in this order online — showing all stores with online delivery on.
            </p>
          )}
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-lg border border-outline-variant/40 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-primary"
          >
            <option value="">Select a store…</option>
            {fullyEligible.length > 0 && (
              <optgroup label="Sells every item online">
                {fullyEligible.map((r) => (
                  <option key={r.phone} value={r.phone}>{optionLabel(r)}</option>
                ))}
              </optgroup>
            )}
            {fallback.length > 0 && (
              <optgroup label="Online delivery on — may not stock all items">
                {fallback.map((r) => (
                  <option key={r.phone} value={r.phone}>{optionLabel(r)}</option>
                ))}
              </optgroup>
            )}
          </select>
          {selectedRow && !selectedRow.fullyEligible && (
            <p className="text-[11px] font-semibold text-red-700">
              ⚠ {selectedRow.name} may not stock every item in this order — confirm they can fulfil it before reassigning.
            </p>
          )}
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (recorded on the audit trail)"
            className="w-full rounded-lg border border-outline-variant/40 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-primary"
          />
        </>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || loading || !eligible || eligible.length === 0}
          onClick={() => void submit()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shuffle className="h-3.5 w-3.5" />}
          {busy ? "Reassigning…" : "Confirm reassignment"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-outline-variant/40 px-3 py-1.5 text-xs font-semibold text-on-surface-variant"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const SECTION_LABEL = "text-[10px] font-black uppercase tracking-widest text-on-surface-variant";

function DetailSection({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
      <p className={`mb-3 flex items-center gap-1.5 ${SECTION_LABEL}`}>
        <Icon className="h-3.5 w-3.5" /> {title}
      </p>
      {children}
    </section>
  );
}

/** Payout state as Razorpay last reported it (functions/src/payouts). Read-only. */
function PayoutSection({ order }: { order: OrderDoc }) {
  const p = order.payout;
  const release = order.routeRelease;
  const transferId = order.payment?.transferId;
  if (!p && !release && !transferId) {
    return <p className="text-xs text-on-surface-variant">No payout recorded yet — settles after delivery.</p>;
  }
  const row = (label: string, value: React.ReactNode) =>
    value ? (
      <div className="flex justify-between gap-3 text-xs">
        <span className="text-on-surface-variant">{label}</span>
        <span className="text-right font-semibold text-on-surface break-all">{value}</span>
      </div>
    ) : null;
  return (
    <div className="space-y-1.5">
      {p?.state && row("State", <span className="uppercase">{p.state.replace(/_/g, " ")}</span>)}
      {row("Via", p?.via ?? (transferId ? "balance" : null))}
      {typeof p?.amount === "number" && row("Amount", inr(p.amount))}
      {typeof p?.reversed === "number" && p.reversed > 0 && row("Reversed", inr(p.reversed))}
      {row("Transfer status", p?.transferStatus)}
      {row("Settlement status", p?.settlementStatus)}
      {row("Transfer ID", (p?.transferId ?? transferId) && <span className="font-mono">{p?.transferId ?? transferId}</span>)}
      {row("Linked account", p?.account && <span className="font-mono">{p.account}</span>)}
      {row("Bank UTR", p?.utr && <span className="font-mono">{p.utr}</span>)}
      {release?.status && row("Release", <span className="capitalize">{release.status.replace(/_/g, " ")}</span>)}
    </div>
  );
}

/** Order status timeline from statusHistory, newest last. */
function HistorySection({ order }: { order: OrderDoc }) {
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  if (history.length === 0) {
    return <p className="text-xs text-on-surface-variant">No status history recorded.</p>;
  }
  return (
    <ol className="space-y-2">
      {history.map((h, idx) => (
        <li key={`${h.status}-${h.at}-${idx}`} className="flex items-start gap-2 text-xs">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
          <div className="min-w-0">
            <span className="font-semibold text-on-surface">
              {STATUS_META[h.status as OrderStatus]?.label ?? h.status}
            </span>
            {h.revert && <span className="ml-1 text-[10px] font-bold text-amber-700">(reverted{h.from ? ` from ${STATUS_META[h.from]?.label ?? h.from}` : ""})</span>}
            <span className="ml-2 text-on-surface-variant">{formatIso(h.at)}</span>
            {(h.reason || h.byRole) && (
              <p className="text-on-surface-variant">
                {h.byRole ? `${h.byRole}` : ""}{h.reason ? `${h.byRole ? " · " : ""}${h.reason}` : ""}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Full order detail shown in the drawer: items, delivery address, seller,
 * payment, bill, invoice, payout and status history. All money actions
 * (refund, reassignment) are rendered through their own components.
 */
function OrderDetail({ order, onChanged }: { order: OrderDoc; onChanged: () => void }) {
  const items = itemsOf(order);
  return (
    <div className="space-y-4">
      <DetailSection title="Products ordered" icon={Package}>
        <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
          <table className="w-full text-xs min-w-[460px]">
            <thead>
              <tr className="border-b border-outline-variant/20 bg-surface-container-low">
                <th className="px-3 py-2 text-left font-black uppercase tracking-wider text-on-surface-variant">Product</th>
                <th className="px-3 py-2 text-left font-black uppercase tracking-wider text-on-surface-variant">Pack</th>
                <th className="px-3 py-2 text-right font-black uppercase tracking-wider text-on-surface-variant">Price</th>
                <th className="px-3 py-2 text-center font-black uppercase tracking-wider text-on-surface-variant">Qty</th>
                <th className="px-3 py-2 text-right font-black uppercase tracking-wider text-on-surface-variant">Line total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={`${item.productId}-${item.variantUnit ?? ""}-${idx}`} className="border-b border-outline-variant/10 last:border-0">
                  <td className="px-3 py-2">
                    <p className="font-semibold text-on-surface">{item.name}</p>
                    <p className="text-[10px] text-on-surface-variant font-mono">{item.productId}</p>
                  </td>
                  <td className="px-3 py-2 text-on-surface-variant">{item.variantUnit || "—"}</td>
                  <td className="px-3 py-2 text-right text-on-surface-variant">{inr(item.price)}</td>
                  <td className="px-3 py-2 text-center font-bold text-on-surface">{item.qty}</td>
                  <td className="px-3 py-2 text-right font-bold text-on-surface">{inr(item.lineTotal)}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-on-surface-variant">No line items recorded on this order.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </DetailSection>

      <div className="grid gap-4 sm:grid-cols-2">
        <DetailSection title="Deliver to" icon={MapPin}>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-on-surface">{order.customerName || "—"}</p>
            <p className="text-xs text-on-surface-variant flex items-center gap-1">
              <Phone className="h-3 w-3 shrink-0" />
              {order.customerPhone ? <a href={`tel:${order.customerPhone}`} className="hover:text-primary">{order.customerPhone}</a> : "—"}
            </p>
            <p className="text-xs text-on-surface-variant flex items-start gap-1">
              <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{formatCustomerAddress(order.customerAddress) || "—"}</span>
            </p>
          </div>
        </DetailSection>

        <DetailSection title="Seller" icon={Store}>
          <div className="space-y-1">
            <SellerName order={order} />
            <p className="text-[11px] text-on-surface-variant break-all">
              sellerId <span className="font-mono text-on-surface">{order.sellerId || "—"}</span>
            </p>
            <p className="text-[11px] text-on-surface-variant break-all">
              sellerPhone <span className="font-mono text-on-surface">{order.sellerPhone || "—"}</span>
            </p>
            <p className="text-[10px] text-on-surface-variant/70">Web orders key sellerId to a UID, mobile to a phone.</p>
            <div className="pt-2">
              <RouteOrderPanel order={order} onReassigned={onChanged} />
            </div>
          </div>
        </DetailSection>

        <DetailSection title="Payment" icon={Wallet}>
          {order.payment ? (
            <div className="space-y-1">
              <p className="text-xs text-on-surface-variant">
                Amount <span className="font-bold text-on-surface">{inr(order.payment.amount)}</span>
                <span className="ml-2"><PaymentBadge order={order} /></span>
              </p>
              <p className="text-[11px] text-on-surface-variant break-all">
                Payment ID <span className="font-mono text-on-surface">{order.payment.razorpayPaymentId || "—"}</span>
              </p>
              <p className="text-[11px] text-on-surface-variant break-all">
                RZP order <span className="font-mono text-on-surface">{order.payment.razorpayOrderId || "—"}</span>
              </p>
              {order.payment.paidAt && (
                <p className="text-[11px] text-on-surface-variant">Paid {formatIso(order.payment.paidAt)}</p>
              )}
              <div className="pt-1">
                <RefundPanel order={order} onRefunded={onChanged} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-on-surface-variant">No payment record on this order (cash / pre-Razorpay).</p>
          )}
        </DetailSection>

        <DetailSection title="Bill breakdown" icon={FileText}>
          <div className="space-y-1">
            <p className="text-xs text-on-surface-variant">Subtotal <span className="font-semibold text-on-surface">{inr(order.subtotal)}</span></p>
            {!!order.totalGst && <p className="text-xs text-on-surface-variant">GST <span className="font-semibold text-on-surface">{inr(order.totalGst)}</span></p>}
            <p className="text-xs text-on-surface-variant">Delivery <span className="font-semibold text-on-surface">{inr(order.deliveryCharge)}</span></p>
            <p className="text-xs text-on-surface-variant">Grand total <span className="font-black text-on-surface">{inr(orderTotal(order))}</span></p>
            {/* Same rule as the seller and buyer views: the invoice exists once the order is accepted. */}
            {isInvoiceReady(order.status) ? (
              <button
                type="button"
                onClick={() => openInvoice(order)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/20 transition-colors"
              >
                <FileText className="h-3.5 w-3.5" /> Invoice
              </button>
            ) : (
              <p className="mt-2 text-[11px] text-on-surface-variant">Invoice is created when the seller accepts the order.</p>
            )}
          </div>
        </DetailSection>

        <DetailSection title="Payout" icon={Wallet}>
          <PayoutSection order={order} />
        </DetailSection>

        <DetailSection title="Order history" icon={Clock}>
          <HistorySection order={order} />
        </DetailSection>
      </div>
    </div>
  );
}

/** Right-side slide-over drawer (full-width on mobile) with the order detail. */
function OrderDrawer({ order, onClose, onChanged }: { order: OrderDoc; onClose: () => void; onChanged: () => void }) {
  // Escape to close; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[75] flex justify-end bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 h-full w-full cursor-default" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col bg-surface shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant/30 bg-surface-container-lowest px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-primary">
                {order.invoiceNumber || order.id.slice(0, 8).toUpperCase()}
              </span>
              <StatusBadge status={order.status} />
              <PaymentBadge order={order} />
            </div>
            <p className="mt-0.5 text-[11px] text-on-surface-variant">{formatDate(order.createdAt)} · {inr(orderTotal(order))}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close order details"
            className="shrink-0 rounded-lg border border-outline-variant/40 p-2 text-on-surface-variant hover:bg-surface-container"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <OrderDetail order={order} onChanged={onChanged} />
        </div>
      </div>
    </div>
  );
}

/** Compact Seller-type + quick-date filters behind one button. The per-column
 *  header popovers cover everything else; this stays for the common shortcuts. */
function FiltersDropdown({ filters, setFilters }: { filters: OrderFilters; setFilters: (f: OrderFilters) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const dateActive = filters.fromMs !== null || filters.toMs !== null;
  const activeCount = (filters.sellerType !== "all" ? 1 : 0) + (dateActive ? 1 : 0);
  const pill = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${active ? "bg-primary text-white shadow-sm" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
          activeCount > 0 ? "border-primary/40 bg-primary/5 text-primary" : "border-outline-variant/40 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container"
        }`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
        {activeCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-black text-white">{activeCount}</span>}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[min(92vw,20rem)] rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-xl">
          <div className="space-y-3">
            <div>
              <p className={`mb-1.5 ${SECTION_LABEL}`}>Seller type</p>
              <div className="flex flex-wrap gap-1.5">
                {([["all", "All sellers"], ["retailer", "Retailers"], ["manufacturer", "Manufacturers"]] as [SellerTypeFilter, string][]).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setFilters({ ...filters, sellerType: k })} className={pill(filters.sellerType === k)}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <p className={`mb-1.5 ${SECTION_LABEL}`}>Quick date range</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_RANGES.map(({ key, label, range }) => {
                  const r = range();
                  const active = key === "all" ? !dateActive : filters.fromMs === r.from && filters.toMs === r.to;
                  return (
                    <button key={key} type="button" onClick={() => setFilters({ ...filters, ...r })} className={pill(active)}>{label}</button>
                  );
                })}
              </div>
              <div className="mt-2">
                <DateFilter
                  fromMs={filters.fromMs}
                  toMs={filters.toMs}
                  onChange={({ fromMs, toMs }) => setFilters({ ...filters, fromMs, toMs })}
                />
              </div>
            </div>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => setFilters({ ...filters, sellerType: "all", fromMs: null, toMs: null })}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Clear these
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminOrdersPage() {
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<OrderFilters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [totals, setTotals] = useState<OrderTotals | null>(null);
  const [directMatches, setDirectMatches] = useState<OrderDoc[]>([]);
  const [exporting, setExporting] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Analytics panel — reads the full server-matched set once per query change
  // (date + status + seller type), then re-aggregates in memory as client-side
  // column filters change — no extra Firestore reads for filter flips.
  // Starts open so data loads on mount (the panel is always visible).
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analyticsRaw, setAnalyticsRaw] = useState<OrderDoc[] | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const loadTotals = () => {
    fetchOrderTotals(Object.keys(STATUS_META))
      .then((t) => { setTotals(t); setError(null); })
      .catch((err) => {
        console.error("Failed to load order totals:", err);
        setError(
          err?.code === "permission-denied"
            ? "Firestore denied read access to /orders. Deploy the updated firestore.rules (the admin/team read clause) and retry."
            : "Failed to load orders from Firestore. Check your connection and retry."
        );
      });
  };

  useEffect(loadTotals, []);

  const counts = totals ?? { total: 0, paid: 0, unpaid: 0, revenue: 0, gross: 0, byStatus: {} as Record<string, number>, lostValue: 0 };

  // Only the status list, seller type and createdAt range run in the Firestore
  // query (existing composite indexes cover them); every other column filter is
  // narrowed by matchesOrderFilters on the loaded rows / full export set.
  const base = useMemo(
    () => ordersQuery({ statuses: filters.statuses, sellerType: filters.sellerType, fromMs: filters.fromMs, toMs: filters.toMs }),
    [filters.statuses, filters.sellerType, filters.fromMs, filters.toMs],
  );
  const paged = usePagedQuery(base, (d) => ({ id: d.id, ...(d.data() as Omit<OrderDoc, "id">) }) as OrderDoc);
  const orders = paged.rows;
  const loading = paged.loading && totals === null;
  const loadOrders = () => { void paged.reload(); loadTotals(); };

  useEffect(() => {
    if (paged.error) setError(paged.error);
  }, [paged.error]);

  // A pasted order id, invoice number, Razorpay id or phone is looked up
  // directly, so it is found even when it isn't loaded (or has no createdAt).
  useEffect(() => {
    setDirectMatches([]);
    const q = search.trim();
    if (q.length < 4) return;
    let cancelled = false;
    const t = setTimeout(() => {
      searchOrdersDirect(q).then((rows) => { if (!cancelled) setDirectMatches(rows as OrderDoc[]); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search]);

  // Product/Seller option lists for the column popovers, derived from whatever
  // rows we already hold (loaded pages, or the fuller analytics set once it is
  // loaded) — no extra reads.
  const optionSource = analyticsRaw ?? orders;
  const productOpts = useMemo(() => productOptions(optionSource), [optionSource]);
  const sellerOpts = useMemo(() => sellerOptions(optionSource), [optionSource]);
  const sellerLabelFor = useMemo(() => {
    const m = new Map(sellerOpts.map((s) => [s.key, s.label] as const));
    return (key: string) => m.get(key) ?? key;
  }, [sellerOpts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byId = new Map<string, OrderDoc>();
    // Direct lookups ignore the date bounds (legacy orders may have no date) but
    // still honour the other structured filters.
    const noDate = { ...filters, fromMs: null, toMs: null };
    for (const o of directMatches) if (matchesOrderFilters(o, noDate)) byId.set(o.id, o);
    for (const o of orders) if (matchesOrderFilters(o, filters) && matchesSearch(o, q)) byId.set(o.id, o);
    return Array.from(byId.values()).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  }, [orders, directMatches, search, filters]);

  // Keep the drawer pointed at the freshest copy of its order after a reload.
  const selectedOrder = useMemo(
    () => (selectedId ? filtered.find((o) => o.id === selectedId) ?? null : null),
    [selectedId, filtered],
  );

  // Reads EVERY order matching the current query + predicate (not just the
  // loaded pages). Shared by the CSV export and the analytics panel so the two
  // can never disagree about the matching set.
  const fetchAllFiltered = async (): Promise<OrderDoc[]> => {
    const q = search.trim().toLowerCase();
    const docs = await readAllDocs(base);
    return docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<OrderDoc, "id">) }) as OrderDoc)
      .filter((o) => matchesOrderFilters(o, filters) && matchesSearch(o, q));
  };

  // Read the server-matched set once per query while the panel is open. Only the
  // Firestore-side inputs (base) trigger a re-read; client column filters
  // re-aggregate in memory below.
  useEffect(() => {
    if (!analyticsOpen) return;
    let cancelled = false;
    setAnalyticsRaw(null); setAnalyticsLoading(true); setAnalyticsError(null);
    readAllDocs(base)
      .then((docs) => {
        if (cancelled) return;
        setAnalyticsRaw(docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrderDoc, "id">) }) as OrderDoc));
      })
      .catch((e) => { if (!cancelled) setAnalyticsError(e instanceof Error ? e.message : "Failed to load analytics."); })
      .finally(() => { if (!cancelled) setAnalyticsLoading(false); });
    return () => { cancelled = true; };
  }, [analyticsOpen, base]);

  // The analytics dataset = the server-matched set narrowed by the client-side
  // column filters + search, recomputed in memory (no reads).
  const analyticsRows = useMemo(() => {
    if (analyticsRaw === null) return null;
    const q = search.trim().toLowerCase();
    return analyticsRaw.filter((o) => matchesOrderFilters(o, filters) && matchesSearch(o, q));
  }, [analyticsRaw, filters, search]);

  const activeGroups = countActiveGroups(filters);
  const clearAll = () => { setFilters(EMPTY_FILTERS); setSearch(""); };
  const patch = (p: Partial<OrderFilters>) => setFilters((f) => ({ ...f, ...p }));

  // Export reads every order matching the current filters (not only loaded pages).
  const exportCsv = async () => {
    setExporting(true);
    let all: OrderDoc[];
    try {
      all = await fetchAllFiltered();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
      setExporting(false);
      return;
    }
    setExporting(false);
    const header = [
      "Order ID", "Invoice", "Date", "Customer", "Customer Phone", "Store / Seller",
      "Seller Type", "Products", "Qty", "Subtotal", "GST", "Delivery", "Grand Total",
      "Order Status", "Payment Status", "Payment Bucket", "Captured", "Refunded", "Net Captured",
      "Razorpay Payment ID", "Razorpay Order ID",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = all.map((o) => [
      o.id,
      o.invoiceNumber ?? "",
      formatDate(o.createdAt),
      o.customerName,
      o.customerPhone,
      o.sellerName ?? o.sellerId,
      o.sellerType,
      itemsOf(o).map((i) => `${i.name}${i.variantUnit ? ` (${i.variantUnit})` : ""} x${i.qty}`).join("; "),
      itemsOf(o).reduce((s, i) => s + i.qty, 0),
      o.subtotal ?? 0,
      o.totalGst ?? 0,
      o.deliveryCharge ?? 0,
      orderTotal(o),
      o.status,
      o.payment?.status ?? "none",
      PAYMENT_BUCKET_META[paymentBucket(o)].label,
      capturedAmount(o),
      refundedAmount(o),
      capturedAmount(o) - refundedAmount(o),
      o.payment?.razorpayPaymentId ?? "",
      o.payment?.razorpayOrderId ?? "",
    ].map(esc).join(","));

    const blob = new Blob([[header.map(esc).join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `krishidukan-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header with concise counts ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-lg sm:text-2xl font-black text-on-surface">Orders</h1>
          </div>
          <div className="ml-7 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant sm:ml-9">
            <span><span className="font-bold text-on-surface">{counts.total.toLocaleString("en-IN")}</span> total</span>
            <span className="text-outline-variant">·</span>
            <span><span className="font-bold text-green-700">{counts.paid.toLocaleString("en-IN")}</span> paid</span>
            <span className="text-outline-variant">·</span>
            <span><span className="font-bold text-on-surface">{inr(counts.revenue)}</span> collected</span>
            <span className="text-outline-variant">·</span>
            <span><span className="font-bold text-amber-700">{counts.unpaid.toLocaleString("en-IN")}</span> not paid online</span>
            {(counts.lostValue ?? 0) > 0 && (
              <>
                <span className="text-outline-variant">·</span>
                <span><span className="font-bold text-red-600">{inr(counts.lostValue)}</span> lost value</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/orders/create"
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Create order manually</span><span className="sm:hidden">Create</span>
          </Link>
          <button
            type="button"
            onClick={() => loadOrders()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={exporting || counts.total === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> {exporting ? "Exporting…" : <><span className="hidden sm:inline">Export CSV</span><span className="sm:hidden">CSV</span></>}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-2xl text-sm flex items-start gap-3 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Could not load orders</p>
            <p className="text-xs text-red-700/90 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ── Collapsible analytics (default collapsed), above the table ─────── */}
      <OrderAnalyticsPanel
        orders={analyticsRows ?? filtered}
        loading={analyticsLoading}
        error={analyticsError}
        complete={analyticsRows !== null}
        onOpenChange={setAnalyticsOpen}
        onSelectSeller={(key) => patch({ sellers: [key] })}
      />

      {/* ── Search + status tabs + filters dropdown ────────────────────────── */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-3 sm:p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice/order ID, customer, phone, product, seller or Razorpay payment ID…"
            className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low py-2.5 pl-9 pr-9 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:border-primary focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {([["all", "All Orders", counts.total] as const,
              ...STATUS_TABS.map((s) => [s, STATUS_META[s].label, counts.byStatus[s] ?? 0] as const)])
              .map(([key, label, count]) => {
                const active = key === "all" ? filters.statuses.length === 0 : (filters.statuses.length === 1 && filters.statuses[0] === key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => patch({ statuses: key === "all" ? [] : [key as OrderStatus] })}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                      active ? "bg-primary text-white shadow-sm" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {label}
                    <span className={active ? "opacity-80" : "opacity-60"}> ({count})</span>
                  </button>
                );
              })}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Column popovers cover filtering on desktop; phones use the sheet. */}
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className={`md:hidden inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                activeGroups > 0 ? "border-primary/40 bg-primary/5 text-primary" : "border-outline-variant/40 bg-surface-container-lowest text-on-surface-variant"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
              {activeGroups > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-black text-white">{activeGroups}</span>}
            </button>
            <div className="hidden md:block">
              <FiltersDropdown filters={filters} setFilters={setFilters} />
            </div>
          </div>
        </div>

        <FilterChips filters={filters} onChange={setFilters} onClearAll={clearAll} sellerLabel={sellerLabelFor} />

        <p className="text-xs text-on-surface-variant">
          Showing <span className="font-bold text-on-surface">{filtered.length}</span>{paged.hasMore ? "+" : ""} of {counts.total} orders
        </p>
      </div>

      {/* ── Orders table ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="mx-auto h-10 w-10 text-on-surface-variant/40" />
            <p className="mt-3 text-sm font-bold text-on-surface">No orders match these filters</p>
            <p className="text-xs text-on-surface-variant mt-1">
              {counts.total === 0 ? "No orders have been placed yet." : "Try clearing the search or filters."}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table — hidden on phones, where the card list below is shown instead. */}
            <div className="hidden md:block max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead className="sticky top-0 z-20 bg-surface-container-low">
                  <tr className="border-b border-outline-variant/20 text-left text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
                    <th className="px-4 py-2.5">
                      <ColumnFilter label="Date" active={filters.fromMs !== null || filters.toMs !== null} onClear={() => patch({ fromMs: null, toMs: null })}>
                        <DateFilter fromMs={filters.fromMs} toMs={filters.toMs} onChange={({ fromMs, toMs }) => patch({ fromMs, toMs })} />
                      </ColumnFilter>
                    </th>
                    <th className="px-4 py-2.5">
                      <ColumnFilter label="Product" active={filters.products.length > 0} onClear={() => patch({ products: [] })}>
                        <MultiSelectFilter
                          options={productOpts.map((p) => ({ value: p, label: p }))}
                          selected={filters.products}
                          onChange={(v) => patch({ products: v })}
                          searchPlaceholder="Search products…"
                        />
                      </ColumnFilter>
                    </th>
                    <th className="px-4 py-2.5 hidden lg:table-cell">
                      <ColumnFilter label="Seller" active={filters.sellers.length > 0} onClear={() => patch({ sellers: [] })}>
                        <MultiSelectFilter
                          options={sellerOpts.map((s) => ({ value: s.key, label: s.label, hint: s.type === "manufacturer" ? "mfr" : undefined }))}
                          selected={filters.sellers}
                          onChange={(v) => patch({ sellers: v })}
                          searchPlaceholder="Search sellers…"
                        />
                      </ColumnFilter>
                    </th>
                    <th className="px-4 py-2.5">
                      <ColumnFilter label="Customer" active={!!(filters.customerName.trim() || filters.customerPhone.trim())} onClear={() => patch({ customerName: "", customerPhone: "" })}>
                        <CustomerFilter
                          name={filters.customerName} phone={filters.customerPhone}
                          onName={(v) => patch({ customerName: v })} onPhone={(v) => patch({ customerPhone: v })}
                        />
                      </ColumnFilter>
                    </th>
                    <th className="px-4 py-2.5 text-right">
                      <ColumnFilter label="Total" align="right" active={!!(filters.amount.min.trim() || filters.amount.max.trim())} onClear={() => patch({ amount: { op: "range", min: "", max: "" } })}>
                        <AmountFilter amount={filters.amount} onChange={(a) => patch({ amount: a })} />
                      </ColumnFilter>
                    </th>
                    <th className="px-4 py-2.5 hidden lg:table-cell">
                      <ColumnFilter label="Payment" active={filters.payments.length > 0} onClear={() => patch({ payments: [] })}>
                        <MultiSelectFilter searchable={false} options={PAYMENT_OPTIONS} selected={filters.payments} onChange={(v) => patch({ payments: v as PaymentBucket[] })} />
                      </ColumnFilter>
                    </th>
                    <th className="px-4 py-2.5">
                      <ColumnFilter label="Status" active={filters.statuses.length > 0} onClear={() => patch({ statuses: [] })}>
                        <MultiSelectFilter
                          searchable={false}
                          options={STATUS_TABS.map((s) => ({ value: s, label: STATUS_META[s].label }))}
                          selected={filters.statuses}
                          onChange={(v) => patch({ statuses: v as OrderStatus[] })}
                        />
                      </ColumnFilter>
                    </th>
                    <th className="px-4 py-2.5">
                      <ColumnFilter label="Order / Invoice" align="right" active={!!(filters.orderId.trim() || filters.invoiceId.trim())} onClear={() => patch({ orderId: "", invoiceId: "" })}>
                        <div className="space-y-2">
                          <TextFilter value={filters.orderId} onChange={(v) => patch({ orderId: v })} placeholder="Order ID…" />
                          <TextFilter value={filters.invoiceId} onChange={(v) => patch({ invoiceId: v })} placeholder="Invoice number…" />
                        </div>
                      </ColumnFilter>
                    </th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o) => {
                    const prod = productSummary(o);
                    return (
                      <tr
                        key={o.id}
                        onClick={() => setSelectedId(o.id)}
                        className="cursor-pointer border-b border-outline-variant/10 last:border-0 hover:bg-surface-container-low/70 transition-colors"
                      >
                        <td className="px-4 py-3 align-top whitespace-nowrap text-[11px] text-on-surface-variant">
                          {formatDate(o.createdAt)}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="font-medium text-on-surface truncate max-w-[220px]">{prod.label}</p>
                          <p className="text-[11px] text-on-surface-variant">
                            {prod.units} {prod.units === 1 ? "unit" : "units"}{prod.more ? ` · ${prod.more}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-top hidden lg:table-cell">
                          <span className="block max-w-[180px] truncate text-xs"><SellerName order={o} /></span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <CustomerLink order={o} className="block font-semibold truncate max-w-[160px]" />
                          <p className="text-[11px] text-on-surface-variant">{o.customerPhone || "—"}</p>
                        </td>
                        <td className="px-4 py-3 align-top text-right font-black text-on-surface whitespace-nowrap">{inr(orderTotal(o))}</td>
                        <td className="px-4 py-3 align-top hidden lg:table-cell"><PaymentBadge order={o} /></td>
                        <td className="px-4 py-3 align-top"><StatusBadge status={o.status} /></td>
                        <td className="px-4 py-3 align-top">
                          <span className="font-mono text-[11px] font-bold text-primary">
                            {o.invoiceNumber || o.id.slice(0, 8).toUpperCase()}
                          </span>
                          {o.payment?.razorpayPaymentId && (
                            <p className="mt-0.5 font-mono text-[10px] text-on-surface-variant truncate max-w-[160px]">{o.payment.razorpayPaymentId}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setSelectedId(o.id); }}
                              className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 bg-white px-2 py-1 text-[11px] font-bold text-on-surface-variant hover:bg-surface-container"
                            >
                              <Eye className="h-3.5 w-3.5" /> View
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openInvoice(o); }}
                              aria-label="Open invoice"
                              className="rounded-lg border border-outline-variant/40 bg-white p-1.5 text-primary hover:bg-primary/10"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards — compact, tap to open the full order. */}
            <div className="md:hidden divide-y divide-outline-variant/10">
              {filtered.map((o) => {
                const prod = productSummary(o);
                return (
                  <div
                    key={o.id}
                    onClick={() => setSelectedId(o.id)}
                    className="cursor-pointer px-4 py-3 active:bg-surface-container-low/70"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] text-on-surface-variant">{formatDate(o.createdAt)}</span>
                      <StatusBadge status={o.status} />
                    </div>
                    <p className="mt-1 font-semibold text-on-surface truncate">{prod.label}</p>
                    <p className="text-[11px] text-on-surface-variant">
                      {prod.units} {prod.units === 1 ? "unit" : "units"}{prod.more ? ` · ${prod.more}` : ""}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <CustomerLink order={o} className="block text-xs font-semibold truncate" />
                        <span className="block text-[11px] text-on-surface-variant truncate">
                          {o.sellerName || o.sellerId || "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-black text-on-surface whitespace-nowrap">{inr(orderTotal(o))}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openInvoice(o); }}
                          aria-label="Open invoice"
                          className="rounded-lg border border-outline-variant/40 bg-white p-1.5 text-primary hover:bg-primary/10"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <LoadMore hasMore={paged.hasMore} loading={paged.loadingMore} onClick={() => void paged.loadMore()} label="Load older orders" />
      </div>

      {selectedOrder && (
        <OrderDrawer
          order={selectedOrder}
          onClose={() => setSelectedId(null)}
          onChanged={() => loadOrders()}
        />
      )}

      {/* ── Mobile filter sheet — the column popovers in one scrollable panel ── */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-black/40 md:hidden" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close filters" className="absolute inset-0 h-full w-full cursor-default" onClick={() => setMobileFiltersOpen(false)} />
          <div className="relative flex h-full w-full max-w-sm flex-col bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
              <p className="flex items-center gap-1.5 text-sm font-black text-on-surface">
                <SlidersHorizontal className="h-4 w-4 text-primary" /> Filters{activeGroups > 0 ? ` (${activeGroups})` : ""}
              </p>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} aria-label="Close" className="rounded-lg border border-outline-variant/40 p-2 text-on-surface-variant hover:bg-surface-container">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <div>
                <p className={`mb-1.5 ${SECTION_LABEL}`}>Date</p>
                <DateFilter fromMs={filters.fromMs} toMs={filters.toMs} onChange={({ fromMs, toMs }) => patch({ fromMs, toMs })} />
              </div>
              <div>
                <p className={`mb-1.5 ${SECTION_LABEL}`}>Order status</p>
                <MultiSelectFilter searchable={false} options={STATUS_TABS.map((s) => ({ value: s, label: STATUS_META[s].label }))} selected={filters.statuses} onChange={(v) => patch({ statuses: v as OrderStatus[] })} />
              </div>
              <div>
                <p className={`mb-1.5 ${SECTION_LABEL}`}>Seller type</p>
                <div className="flex flex-wrap gap-1.5">
                  {([["all", "All"], ["retailer", "Retailers"], ["manufacturer", "Manufacturers"]] as [SellerTypeFilter, string][]).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => patch({ sellerType: k })}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ${filters.sellerType === k ? "bg-primary text-white" : "bg-surface-container text-on-surface-variant"}`}>{label}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className={`mb-1.5 ${SECTION_LABEL}`}>Seller</p>
                <MultiSelectFilter options={sellerOpts.map((s) => ({ value: s.key, label: s.label, hint: s.type === "manufacturer" ? "mfr" : undefined }))} selected={filters.sellers} onChange={(v) => patch({ sellers: v })} searchPlaceholder="Search sellers…" />
              </div>
              <div>
                <p className={`mb-1.5 ${SECTION_LABEL}`}>Product</p>
                <MultiSelectFilter options={productOpts.map((p) => ({ value: p, label: p }))} selected={filters.products} onChange={(v) => patch({ products: v })} searchPlaceholder="Search products…" />
              </div>
              <div>
                <p className={`mb-1.5 ${SECTION_LABEL}`}>Customer</p>
                <CustomerFilter name={filters.customerName} phone={filters.customerPhone} onName={(v) => patch({ customerName: v })} onPhone={(v) => patch({ customerPhone: v })} />
              </div>
              <div>
                <p className={`mb-1.5 ${SECTION_LABEL}`}>Order total</p>
                <AmountFilter amount={filters.amount} onChange={(a) => patch({ amount: a })} />
              </div>
              <div>
                <p className={`mb-1.5 ${SECTION_LABEL}`}>Payment</p>
                <MultiSelectFilter searchable={false} options={PAYMENT_OPTIONS} selected={filters.payments} onChange={(v) => patch({ payments: v as PaymentBucket[] })} />
              </div>
              <div>
                <p className={`mb-1.5 ${SECTION_LABEL}`}>Order / Invoice</p>
                <div className="space-y-2">
                  <TextFilter value={filters.orderId} onChange={(v) => patch({ orderId: v })} placeholder="Order ID…" />
                  <TextFilter value={filters.invoiceId} onChange={(v) => patch({ invoiceId: v })} placeholder="Invoice number…" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-outline-variant/30 p-3">
              <button type="button" onClick={clearAll} className="flex-1 rounded-xl border border-outline-variant/40 py-2.5 text-sm font-bold text-on-surface-variant hover:bg-surface-container">
                Clear all
              </button>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-white hover:bg-primary/90">
                Show {filtered.length} result{filtered.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
