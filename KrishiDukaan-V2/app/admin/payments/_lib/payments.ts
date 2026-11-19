import { auth } from "../../../firebase";
import {
  paymentsToCsv,
  toDate,
  type Category,
  type PaymentFilters,
  type PaymentRow,
} from "../../../lib/payments-unify";

/**
 * Client-side access for Admin → Payments.
 *
 * All fetching, merging, classification, aggregation and column filtering
 * happen SERVER-SIDE in /api/admin/payments (reusing app/lib/payments-unify.ts).
 * This module just serializes the query, calls that endpoint and re-hydrates
 * dates — the browser never loads the full payment history, so filters apply
 * across ALL records while "All time" stays safe.
 */

export {
  CATEGORY_LABEL,
  PLATFORM_LABEL,
  money,
  paymentsToCsv,
  EMPTY_PAYMENT_FILTERS,
  activePaymentChips,
  countActivePaymentFilters,
  type Attempt,
  type Payment,
  type PaymentRow,
  type Category,
  type Platform,
  type PaymentStatus,
  type PaymentFilters,
  type PaymentFilterChip,
  type AmountOp,
} from "../../../lib/payments-unify";

export type PaymentsPage = {
  counts: Record<Category, number>;
  amounts: Record<Category, number>;
  refundedValue: number;
  total: number;
  tabTotal: number;
  rows: PaymentRow[];
};

export type PaymentsQuery = {
  from: Date;
  to: Date;
  q: string;
  filters: PaymentFilters;
  category?: Category | "all";
  page?: number;
  pageSize?: number;
  all?: boolean;
};

/** JSON turns our Date fields into ISO strings; turn the displayed ones back. */
function hydrate(rows: PaymentRow[]): PaymentRow[] {
  for (const r of rows) {
    r.createdAt = toDate(r.createdAt);
    if (r.payment) {
      r.payment.createdAt = toDate(r.payment.createdAt);
      r.payment.capturedAt = toDate(r.payment.capturedAt);
    }
    if (r.attempt) r.attempt.createdAt = toDate(r.attempt.createdAt);
  }
  return rows;
}

export async function fetchPaymentsPage(p: PaymentsQuery): Promise<PaymentsPage> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Not signed in.");

  const f = p.filters;
  const qs = new URLSearchParams({
    from: String(p.from.getTime()),
    to: String(p.to.getTime()),
    q: p.q,
    ...(f.customerName.trim() ? { customerName: f.customerName.trim() } : {}),
    ...(f.product.trim() ? { product: f.product.trim() } : {}),
    ...(f.phone.trim() ? { phone: f.phone.trim() } : {}),
    ...(f.reason.trim() ? { reason: f.reason.trim() } : {}),
    ...(f.platforms.length ? { platforms: f.platforms.join(",") } : {}),
    ...(f.amount.min.trim() || f.amount.max.trim()
      ? { amountOp: f.amount.op, amountMin: f.amount.min, amountMax: f.amount.max }
      : {}),
    ...(p.category && p.category !== "all" ? { category: p.category } : {}),
    ...(p.all ? { all: "1" } : { page: String(p.page ?? 0), pageSize: String(p.pageSize ?? 25) }),
  });

  const res = await fetch(`/api/admin/payments?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Could not load payments");

  return { ...data, rows: hydrate(data.rows ?? []) } as PaymentsPage;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
