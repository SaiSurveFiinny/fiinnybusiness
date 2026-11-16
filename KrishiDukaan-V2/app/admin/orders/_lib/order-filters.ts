"use client";

/**
 * The structured, column-wise filter model for Admin → Orders and the one
 * predicate that every surface (table, analytics panel, CSV export) runs, so
 * they always agree on what "matches".
 *
 * Combining rules (Part 3 of the spec):
 *   - Different groups AND together (date AND seller AND amount …).
 *   - Multiple values inside one group OR together (status placed OR delivered).
 *
 * What the SERVER can narrow (see ordersQuery) is a subset: the createdAt range,
 * the sellerType, and the status list via a single `in` (≤10 values, and there
 * are only 8 statuses). Everything else — product, specific seller, customer,
 * amount, payment bucket, order/invoice id — Firestore can't express alongside
 * those without exploding into many composite indexes, so it is applied here in
 * the predicate. The predicate re-checks the server-side fields too, so it stays
 * correct even when the query was deliberately broadened.
 */

import { formatCustomerAddress, normalizeOrderItems, orderGrandTotal, type OrderDoc, type OrderStatus, type SellerType } from "../../../../types/order";
import { paymentBucket, type PaymentBucket } from "./order-analytics";

export type SellerTypeFilter = "all" | "retailer" | "manufacturer";
export type AmountOp = "gt" | "lt" | "eq" | "range";

export type OrderFilters = {
  /** createdAt bounds in ms (inclusive). null = unbounded. */
  fromMs: number | null;
  toMs: number | null;
  /** Order status multi-select (OR). Empty = any. */
  statuses: OrderStatus[];
  /** retailer / manufacturer / all (single). */
  sellerType: SellerTypeFilter;
  /** Product names (lowercased) multi-select (OR). */
  products: string[];
  /** Seller keys (sellerId || sellerName) multi-select (OR). */
  sellers: string[];
  /** Customer name / phone partial match. */
  customerName: string;
  customerPhone: string;
  /** Payment buckets multi-select (OR). */
  payments: PaymentBucket[];
  /** Amount range on the order grand total. */
  amount: { op: AmountOp; min: string; max: string };
  /** Order id / invoice number partial match. */
  orderId: string;
  invoiceId: string;
};

export const EMPTY_FILTERS: OrderFilters = {
  fromMs: null, toMs: null, statuses: [], sellerType: "all",
  products: [], sellers: [], customerName: "", customerPhone: "",
  payments: [], amount: { op: "range", min: "", max: "" }, orderId: "", invoiceId: "",
};

const toMillis = (createdAt: unknown): number => (createdAt as any)?.toMillis?.() ?? 0;
const sellerKeyOf = (o: OrderDoc) => o.sellerId || o.sellerPhone || o.sellerName || "—";
const digitsOf = (s: string) => s.replace(/\D/g, "");

/** True when this order satisfies every active filter group. */
export function matchesOrderFilters(o: OrderDoc, f: OrderFilters): boolean {
  // Date (range on createdAt)
  if (f.fromMs !== null || f.toMs !== null) {
    const ms = toMillis(o.createdAt);
    if (f.fromMs !== null && ms < f.fromMs) return false;
    if (f.toMs !== null && ms > f.toMs) return false;
  }
  // Status (OR)
  if (f.statuses.length > 0 && !f.statuses.includes(o.status)) return false;
  // Seller type
  if (f.sellerType !== "all" && o.sellerType !== f.sellerType) return false;
  // Specific sellers (OR) — match the id key, display name, or sellerPhone.
  // sellerPhone is the stable identifier across web (UID sellerId) and mobile
  // (phone sellerId) orders for the same retailer; check it as a secondary path
  // so clicking a retailer row in the analytics breakdown filters correctly.
  if (f.sellers.length > 0) {
    const key = sellerKeyOf(o);
    const nameKey = (o.sellerName || "").toLowerCase();
    const phone = o.sellerPhone || "";
    if (!f.sellers.some((s) => s === key || s.toLowerCase() === nameKey || (phone && s === phone))) return false;
  }
  // Products (OR) — any line item's name matches a selected product
  if (f.products.length > 0) {
    const names = new Set(normalizeOrderItems(o.items as any).map((i) => (i.name || "").toLowerCase()));
    if (!f.products.some((p) => names.has(p.toLowerCase()))) return false;
  }
  // Customer name (partial)
  if (f.customerName.trim()) {
    if (!(o.customerName || "").toLowerCase().includes(f.customerName.trim().toLowerCase())) return false;
  }
  // Customer phone (partial, digits-insensitive to +91/spaces)
  if (f.customerPhone.trim()) {
    const want = digitsOf(f.customerPhone);
    if (want && !digitsOf(o.customerPhone || "").includes(want)) return false;
  }
  // Payment bucket (OR)
  if (f.payments.length > 0 && !f.payments.includes(paymentBucket(o))) return false;
  // Amount range on grand total
  if (f.amount.min.trim() !== "" || f.amount.max.trim() !== "") {
    const total = orderGrandTotal(o);
    const min = f.amount.min.trim() === "" ? null : Number(f.amount.min);
    const max = f.amount.max.trim() === "" ? null : Number(f.amount.max);
    switch (f.amount.op) {
      case "gt": if (min !== null && !(total > min)) return false; break;
      case "lt": if (max !== null && !(total < max)) return false; break;
      case "eq": if (min !== null && Math.abs(total - min) > 0.5) return false; break;
      case "range":
        if (min !== null && total < min) return false;
        if (max !== null && total > max) return false;
        break;
    }
  }
  // Order id (partial)
  if (f.orderId.trim() && !o.id.toLowerCase().includes(f.orderId.trim().toLowerCase())) return false;
  // Invoice id (partial)
  if (f.invoiceId.trim() && !(o.invoiceNumber || "").toLowerCase().includes(f.invoiceId.trim().toLowerCase())) return false;
  return true;
}

/** Free-text haystack search, kept separate from the structured filters. */
export function matchesSearch(o: OrderDoc, q: string): boolean {
  if (!q) return true;
  const haystack = [
    o.id, o.invoiceNumber, o.customerName, o.customerPhone,
    formatCustomerAddress(o.customerAddress), o.sellerName, o.sellerId, o.sellerPhone,
    o.payment?.razorpayPaymentId, o.payment?.razorpayOrderId,
    ...normalizeOrderItems(o.items as any).map((i) => i.name),
    ...normalizeOrderItems(o.items as any).map((i) => i.productId),
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(q);
}

/** Number of active filter groups (for the "Filters (N)" badge). */
export function countActiveGroups(f: OrderFilters): number {
  let n = 0;
  if (f.fromMs !== null || f.toMs !== null) n++;
  if (f.statuses.length) n++;
  if (f.sellerType !== "all") n++;
  if (f.products.length) n++;
  if (f.sellers.length) n++;
  if (f.customerName.trim() || f.customerPhone.trim()) n++;
  if (f.payments.length) n++;
  if (f.amount.min.trim() || f.amount.max.trim()) n++;
  if (f.orderId.trim()) n++;
  if (f.invoiceId.trim()) n++;
  return n;
}

export type FilterChip = { key: string; label: string; clear: (f: OrderFilters) => OrderFilters };

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Active filters as removable chips, in column order. */
export function activeFilterChips(f: OrderFilters, sellerLabel?: (key: string) => string): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.fromMs !== null || f.toMs !== null) {
    const label = f.fromMs !== null && f.toMs !== null
      ? `${fmtDate(f.fromMs)} – ${fmtDate(f.toMs)}`
      : f.fromMs !== null ? `From ${fmtDate(f.fromMs)}` : `Until ${fmtDate(f.toMs!)}`;
    chips.push({ key: "date", label: `Date: ${label}`, clear: (x) => ({ ...x, fromMs: null, toMs: null }) });
  }
  for (const s of f.statuses) {
    chips.push({ key: `status:${s}`, label: `Status: ${s.replace(/_/g, " ")}`,
      clear: (x) => ({ ...x, statuses: x.statuses.filter((v) => v !== s) }) });
  }
  if (f.sellerType !== "all") {
    chips.push({ key: "sellerType", label: `Seller type: ${f.sellerType}`,
      clear: (x) => ({ ...x, sellerType: "all" }) });
  }
  for (const s of f.sellers) {
    chips.push({ key: `seller:${s}`, label: `Seller: ${sellerLabel?.(s) ?? s}`,
      clear: (x) => ({ ...x, sellers: x.sellers.filter((v) => v !== s) }) });
  }
  for (const p of f.products) {
    chips.push({ key: `product:${p}`, label: `Product: ${p}`,
      clear: (x) => ({ ...x, products: x.products.filter((v) => v !== p) }) });
  }
  if (f.customerName.trim()) {
    chips.push({ key: "custName", label: `Customer: ${f.customerName.trim()}`,
      clear: (x) => ({ ...x, customerName: "" }) });
  }
  if (f.customerPhone.trim()) {
    chips.push({ key: "custPhone", label: `Phone: ${f.customerPhone.trim()}`,
      clear: (x) => ({ ...x, customerPhone: "" }) });
  }
  for (const p of f.payments) {
    chips.push({ key: `pay:${p}`, label: `Payment: ${p.replace(/_/g, " ")}`,
      clear: (x) => ({ ...x, payments: x.payments.filter((v) => v !== p) }) });
  }
  if (f.amount.min.trim() || f.amount.max.trim()) {
    const a = f.amount;
    const label = a.op === "gt" ? `> ₹${a.min}`
      : a.op === "lt" ? `< ₹${a.max}`
        : a.op === "eq" ? `= ₹${a.min}`
          : `₹${a.min || "0"} – ₹${a.max || "∞"}`;
    chips.push({ key: "amount", label: `Total: ${label}`,
      clear: (x) => ({ ...x, amount: { op: "range", min: "", max: "" } }) });
  }
  if (f.orderId.trim()) {
    chips.push({ key: "orderId", label: `Order ID: ${f.orderId.trim()}`, clear: (x) => ({ ...x, orderId: "" }) });
  }
  if (f.invoiceId.trim()) {
    chips.push({ key: "invoiceId", label: `Invoice: ${f.invoiceId.trim()}`, clear: (x) => ({ ...x, invoiceId: "" }) });
  }
  return chips;
}

/** Distinct product-name options derived from the rows we already hold (no
 *  extra reads). Sorted, de-duplicated. */
export function productOptions(orders: OrderDoc[]): string[] {
  const set = new Set<string>();
  for (const o of orders) for (const i of normalizeOrderItems(o.items as any)) {
    if (i.name) set.add(i.name);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Distinct seller options (key + label) from the rows we already hold. */
export function sellerOptions(orders: OrderDoc[]): Array<{ key: string; label: string; type: SellerType }> {
  const byKey = new Map<string, { key: string; label: string; type: SellerType }>();
  for (const o of orders) {
    const key = sellerKeyOf(o);
    if (!byKey.has(key)) byKey.set(key, { key, label: o.sellerName || o.sellerId || key, type: o.sellerType });
  }
  return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
}
