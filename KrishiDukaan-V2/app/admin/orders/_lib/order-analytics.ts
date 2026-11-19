"use client";

/**
 * Order analytics — pure functions over the filtered order set.
 *
 * Payment definitions (single source of truth):
 *   captured  = payment.amount once it reached 'paid'/'refunded'
 *   refunded  = payment.refundedAmount processed back to customer
 *   collected = Σ captured
 *   net       = collected − refunded
 *   unpaid    = Σ order total for live orders with nothing captured
 *   lost      = Σ order total for rejected/cancelled (not admin-rerouted)
 *   rerouted  = Σ order total for orders with adminReassignment.at set
 *
 * Retailer breakdown — each order attributed to its ORIGINAL seller:
 *   - Admin-rerouted orders (adminReassignment.at set): original seller =
 *     fromSellerPhone. The receiving seller gets a "Rerouted In" credit.
 *   - All other orders: current sellerPhone || sellerId is the original seller.
 *
 * Canonical key is sellerPhone (consistent across web orders with UID sellerId
 * and mobile-OTP orders where sellerId is the phone itself). Falls back to
 * sellerId when sellerPhone is absent.
 *
 * Reads order-level payment state only — never paymentAttempts or the
 * razorpayPayments gateway mirror (double-counting risk documented in Nov 2026).
 */

import { orderGrandTotal, type OrderDoc, type OrderStatus } from "../../../../types/order";

export type PaymentBucket = "paid" | "unpaid" | "partially_refunded" | "refunded" | "pending";

export const PAYMENT_BUCKET_META: Record<PaymentBucket, { label: string; badge: string }> = {
  paid:               { label: "Paid",               badge: "bg-green-100 text-green-700" },
  unpaid:             { label: "Unpaid",             badge: "bg-amber-100 text-amber-700" },
  partially_refunded: { label: "Partially refunded", badge: "bg-orange-100 text-orange-700" },
  refunded:           { label: "Refunded",           badge: "bg-gray-200 text-gray-700" },
  pending:            { label: "Pending / in process", badge: "bg-blue-100 text-blue-700" },
};

const NON_OUTSTANDING_STATUSES: OrderStatus[] = ["cancelled", "rejected", "reassigning"];
const orderTotal = orderGrandTotal;

/** Amount captured for this order (0 until gateway confirmed it). */
export function capturedAmount(o: OrderDoc): number {
  const p = o.payment;
  if (!p) return 0;
  return p.status === "paid" || p.status === "refunded" ? (p.amount ?? 0) : 0;
}

/** Amount refunded to the customer. Prefers the explicit refundedAmount field;
 *  falls back to full amount for legacy full-refund records. */
export function refundedAmount(o: OrderDoc): number {
  const p = o.payment;
  if (!p) return 0;
  const amt = p.refundedAmount ?? 0;
  if (amt > 0) return amt;
  if (p.status === "refunded") return p.amount ?? 0;
  return 0;
}

/** One payment bucket per order. */
export function paymentBucket(o: OrderDoc): PaymentBucket {
  const p = o.payment;
  if (!p || p.status === "failed") return "unpaid";
  if (p.status === "pending") return "pending";
  const captured = p.amount ?? 0;
  const refunded = refundedAmount(o);
  if (p.status === "refunded" || (captured > 0 && refunded >= captured)) return "refunded";
  if (refunded > 0) return "partially_refunded";
  if (p.status === "paid") return "paid";
  return "unpaid";
}

/** Outstanding value: order total when nothing captured and the order is live. */
export function outstandingValue(o: OrderDoc): number {
  if (NON_OUTSTANDING_STATUSES.includes(o.status)) return 0;
  return capturedAmount(o) > 0 ? 0 : orderTotal(o);
}

export type FinancialSummary = {
  totalOrders: number;
  totalValue: number;
  collected: number;
  refunded: number;
  netCollected: number;
  unpaidValue: number;
  /** Value of rejected/cancelled orders that were NOT admin-rerouted. */
  lostValue: number;
  /** Value of orders admin-reassigned to a different retailer (each order once). */
  reroutedValue: number;
};

export function computeFinancialSummary(orders: OrderDoc[]): FinancialSummary {
  let totalValue = 0, collected = 0, refunded = 0, unpaidValue = 0, lostValue = 0, reroutedValue = 0;
  for (const o of orders) {
    const val = orderTotal(o);
    totalValue += val;
    collected += capturedAmount(o);
    refunded += refundedAmount(o);
    unpaidValue += outstandingValue(o);
    if (o.adminReassignment?.at) {
      reroutedValue += val;
    } else if (o.status === "rejected" || o.status === "cancelled") {
      lostValue += val;
    }
  }
  return {
    totalOrders: orders.length,
    totalValue,
    collected,
    refunded,
    netCollected: collected - refunded,
    unpaidValue,
    lostValue,
    reroutedValue,
  };
}

export type PaymentDistribution = Record<PaymentBucket, { count: number; amount: number }>;

/** Count + value per payment bucket. Unpaid/pending show order value; others
 *  show captured amount so the total reconciles with "collected". */
export function computePaymentDistribution(orders: OrderDoc[]): PaymentDistribution {
  const empty = (): { count: number; amount: number } => ({ count: 0, amount: 0 });
  const dist: PaymentDistribution = {
    paid: empty(), unpaid: empty(), partially_refunded: empty(), refunded: empty(), pending: empty(),
  };
  for (const o of orders) {
    const b = paymentBucket(o);
    dist[b].count += 1;
    dist[b].amount += b === "unpaid" || b === "pending" ? orderTotal(o) : capturedAmount(o);
  }
  return dist;
}

export type RetailerBreakdownRow = {
  /** Canonical grouping key: sellerPhone for the original seller of this order. */
  sellerKey: string;
  sellerName: string;
  sellerType: OrderDoc["sellerType"];

  /** Orders originally assigned to this retailer (before any admin rerouting). */
  ordersReceived: number;
  valueReceived: number;

  /** Orders admin-rerouted IN to this retailer from another. */
  reroutedInOrders: number;
  reroutedInValue: number;

  /** Orders admin-rerouted OUT from this retailer to another. */
  reroutedOutOrders: number;
  reroutedOutValue: number;

  /** Originally-received orders that ended rejected/cancelled (not rerouted). */
  lostOrders: number;
  lostValue: number;

  /**
   * Net order value: valueReceived + reroutedInValue − reroutedOutValue − lostValue.
   * Represents the value this retailer is responsible for delivering.
   */
  netOrderValue: number;
};

export type RetailerSortKey = "received" | "rerouted-in" | "rerouted-out" | "lost" | "net";

/**
 * Per-retailer rollup respecting the original assignment and rerouting history.
 *
 * Attribution rules (applied per order, one pass):
 *   Admin-rerouted order (adminReassignment.at set):
 *     original seller (fromSellerPhone) → ordersReceived++, reroutedOut++
 *     receiving seller (sellerPhone || sellerId) → reroutedIn++
 *
 *   Non-rerouted order:
 *     current seller (sellerPhone || sellerId) → ordersReceived++
 *     if rejected/cancelled → lostOrders++
 *
 * Net = valueReceived + reroutedInValue − reroutedOutValue − lostValue
 */
export function computeRetailerBreakdown(
  orders: OrderDoc[],
  sortBy: RetailerSortKey = "received",
): RetailerBreakdownRow[] {
  const byKey = new Map<string, RetailerBreakdownRow>();

  const getOrCreate = (key: string, name: string, type?: OrderDoc["sellerType"]): RetailerBreakdownRow => {
    let row = byKey.get(key);
    if (!row) {
      row = {
        sellerKey: key, sellerName: name, sellerType: type ?? "retailer",
        ordersReceived: 0, valueReceived: 0,
        reroutedInOrders: 0, reroutedInValue: 0,
        reroutedOutOrders: 0, reroutedOutValue: 0,
        lostOrders: 0, lostValue: 0,
        netOrderValue: 0,
      };
      byKey.set(key, row);
    }
    if (name && name !== "—") row.sellerName = name;
    // Prefer type from non-rerouted orders (the type on a rerouted order
    // belongs to the NEW seller, not the original).
    if (type) row.sellerType = type;
    return row;
  };

  for (const o of orders) {
    const val = orderTotal(o);
    const isRerouted = Boolean(o.adminReassignment?.at);

    if (isRerouted) {
      const ra = o.adminReassignment!;
      // Original seller: receives the "rerouted out" attribution.
      const origKey = ra.fromSellerPhone;
      const origName = ra.fromSellerName || origKey;
      const orig = getOrCreate(origKey, origName, undefined);
      orig.ordersReceived += 1;
      orig.valueReceived += val;
      orig.reroutedOutOrders += 1;
      orig.reroutedOutValue += val;

      // Receiving seller: receives the "rerouted in" credit.
      const newKey = o.sellerPhone || o.sellerId || o.sellerName || "—";
      const newName = o.sellerName || o.sellerId || "—";
      const recv = getOrCreate(newKey, newName, o.sellerType);
      recv.reroutedInOrders += 1;
      recv.reroutedInValue += val;
    } else {
      const key = o.sellerPhone || o.sellerId || o.sellerName || "—";
      const name = o.sellerName || o.sellerId || "—";
      const row = getOrCreate(key, name, o.sellerType);
      row.ordersReceived += 1;
      row.valueReceived += val;
      if (o.status === "rejected" || o.status === "cancelled") {
        row.lostOrders += 1;
        row.lostValue += val;
      }
    }
  }

  for (const row of Array.from(byKey.values())) {
    row.netOrderValue = row.valueReceived + row.reroutedInValue - row.reroutedOutValue - row.lostValue;
  }

  const rows = Array.from(byKey.values());
  rows.sort((a, b) =>
    sortBy === "rerouted-in"  ? b.reroutedInValue  - a.reroutedInValue
      : sortBy === "rerouted-out" ? b.reroutedOutValue - a.reroutedOutValue
        : sortBy === "lost"           ? b.lostValue        - a.lostValue
          : sortBy === "net"            ? b.netOrderValue    - a.netOrderValue
            : b.valueReceived - a.valueReceived,
  );
  return rows;
}
