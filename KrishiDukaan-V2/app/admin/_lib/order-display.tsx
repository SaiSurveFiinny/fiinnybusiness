"use client";

/**
 * Shared order-display helpers for the admin order views (Admin → Orders and
 * Admin → Customer History). Everything here is pure presentation — status and
 * payment badges, money/date formatting, and the one-line product summary — so
 * both pages render an order the same way and never drift. No reads, no money
 * actions (those stay on the Orders page).
 */

import Link from "next/link";
import { Factory, Store } from "lucide-react";
import {
  normalizeOrderItems,
  orderGrandTotal,
  type OrderDoc,
  type OrderStatus,
  type PaymentStatus,
} from "../../../types/order";

export const STATUS_META: Record<OrderStatus, { label: string; badge: string }> = {
  placed:           { label: "Placed",           badge: "bg-amber-100 text-amber-700" },
  accepted:         { label: "Accepted",         badge: "bg-blue-100 text-blue-700" },
  dispatched:       { label: "Dispatched",       badge: "bg-indigo-100 text-indigo-700" },
  out_for_delivery: { label: "Out for Delivery", badge: "bg-purple-100 text-purple-700" },
  delivered:        { label: "Delivered",        badge: "bg-green-100 text-green-700" },
  rejected:         { label: "Rejected",         badge: "bg-red-100 text-red-700" },
  cancelled:        { label: "Cancelled",        badge: "bg-red-100 text-red-700" },
  reassigning:      { label: "Reassigning",      badge: "bg-orange-100 text-orange-700" },
};

/** Tab order for the status filter — All first, then the lifecycle. */
export const STATUS_TABS: OrderStatus[] = [
  "placed", "accepted", "dispatched", "out_for_delivery", "delivered", "rejected", "cancelled", "reassigning",
];

export const PAYMENT_META: Record<PaymentStatus, { label: string; badge: string }> = {
  paid:     { label: "Paid",     badge: "bg-green-100 text-green-700" },
  pending:  { label: "Pending",  badge: "bg-amber-100 text-amber-700" },
  failed:   { label: "Failed",   badge: "bg-red-100 text-red-700" },
  refunded: { label: "Refunded", badge: "bg-gray-200 text-gray-700" },
};

/** Orders written before Razorpay was wired up carry no `payment` field at all. */
export const NO_PAYMENT_BADGE = "bg-gray-100 text-gray-500";

export function toMillis(createdAt: unknown): number {
  return (createdAt as any)?.toMillis?.() ?? 0;
}

export function formatDate(createdAt: unknown): string {
  const ms = toMillis(createdAt);
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function formatIso(iso: unknown): string {
  const s = String(iso ?? "");
  const t = Date.parse(s);
  if (!s || Number.isNaN(t)) return "—";
  return new Date(t).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function inr(n: number | undefined): string {
  return `₹${(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Both totals and item field names differ web-vs-mobile — see types/order.ts. */
export const orderTotal = orderGrandTotal;
export const itemsOf = (o: OrderDoc) => normalizeOrderItems(o.items as any);

/** A compact one-line product summary for the table: first item + variant,
 *  total units, and "+N more" when the order has several line items. */
export function productSummary(o: OrderDoc): { label: string; more: string; units: number } {
  const items = itemsOf(o);
  if (items.length === 0) return { label: "No line items", more: "", units: 0 };
  const first = items[0]!;
  const label = `${first.name}${first.variantUnit ? ` · ${first.variantUnit}` : ""}`;
  return {
    label,
    more: items.length > 1 ? `+${items.length - 1} more` : "",
    units: items.reduce((s, i) => s + i.qty, 0),
  };
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status] ?? { label: status, badge: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${meta.badge}`}>
      {meta.label}
    </span>
  );
}

export function PaymentBadge({ order }: { order: OrderDoc }) {
  const pay = order.payment ? PAYMENT_META[order.payment.status] : null;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${pay ? pay.badge : NO_PAYMENT_BADGE}`}>
      {pay ? pay.label : "No record"}
    </span>
  );
}

/**
 * Customer name linking to the Customer History page, keyed by the order's
 * customerId (the buyer's Auth UID — never the phone, which isn't a stable
 * identifier). Falls back to plain text when an order carries no customerId
 * (some legacy / manually-created orders), so the name still renders.
 */
export function CustomerLink({
  order,
  className,
}: {
  order: Pick<OrderDoc, "customerId" | "customerName">;
  className?: string;
}) {
  const name = order.customerName || "—";
  if (!order.customerId) {
    return <span className={className}>{name}</span>;
  }
  return (
    <Link
      href={`/admin/customer-history/${encodeURIComponent(order.customerId)}`}
      onClick={(e) => e.stopPropagation()}
      className={`${className ?? ""} text-primary hover:underline`}
    >
      {name}
    </Link>
  );
}

export function SellerName({ order }: { order: OrderDoc }) {
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-on-surface">
      {order.sellerType === "manufacturer"
        ? <Factory className="h-3.5 w-3.5 shrink-0 text-blue-600" />
        : <Store className="h-3.5 w-3.5 shrink-0 text-green-600" />}
      <span className="truncate">{order.sellerName || order.sellerId || "—"}</span>
    </span>
  );
}
