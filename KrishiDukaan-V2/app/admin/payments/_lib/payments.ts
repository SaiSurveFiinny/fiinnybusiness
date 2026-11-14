import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../../../firebase";
import {
  classifyPayment,
  isTimeoutFailure,
  type PaymentStatus,
} from "../../../lib/payments-shared";

export type { PaymentStatus };

/**
 * Unified model for Admin → Payments.
 *
 * Two collections, correlated at READ TIME by Razorpay ORDER id — nothing new
 * is ever persisted:
 *   razorpayPayments — gateway truth, one doc per payment id (app/lib/payments-mirror.ts).
 *   paymentAttempts  — app checkout sessions, one doc per order id.
 *
 * The app marks closed/cancelled checkouts as `failed`, so its status is NOT
 * trusted. A payment is classified by the decision table in `categoryOf*`:
 * a genuine failure ALWAYS has a Razorpay payment entity, so an app "failed"
 * with no gateway payment is Abandoned, not Failed.
 *
 * Dedup: an order with any gateway payment is represented by its gateway
 * row(s); its app attempt is dropped (overlap). An order with no gateway
 * payment becomes an app-only row (preserved). A payment is never counted
 * twice.
 */

const ABANDON_AFTER_MS = 30 * 60 * 1000;

// ─── paymentAttempts (app checkout) ─────────────────────────────────────────────

export type AttemptItem = {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  sellerPhone: string | null;
  priceSource: string;
};

export type Attempt = {
  id: string; // == Razorpay order id
  razorpayOrderId: string;
  kind: "cart" | "subscription";
  /** App-recorded status — created | paid | failed. A hint, NOT the category. */
  status: "created" | "paid" | "failed";
  amount: number;
  userId: string;
  userPhone: string | null;
  userName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  razorpayContact: string | null;
  razorpayEmail: string | null;
  subtotal: number | null;
  deliveryCharge: number | null;
  gstAdded: number | null;
  items: AttemptItem[];
  seatCount: number | null;
  durationMonths: number | null;
  note: string | null;
  source: string; // web | mobile | razorpay_webhook | razorpay_backfill | unknown
  error: { code?: string | null; description?: string | null; reason?: string | null } | null;
  createdAt: Date | null;
};

export type Platform = "app" | "web" | "razorpay" | "unknown";

export const PLATFORM_LABEL: Record<Platform, string> = {
  app: "App",
  web: "Web",
  razorpay: "Razorpay (synced)",
  unknown: "Unknown",
};

function platformOfSource(source: string | undefined): Platform {
  switch (source) {
    case "mobile":
      return "app";
    case "web":
      return "web";
    case "razorpay_webhook":
    case "razorpay_backfill":
      return "razorpay";
    default:
      return "unknown";
  }
}

export const money = (n: number) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | null;
  if (t?.toDate) return t.toDate();
  if (v instanceof Date) return v;
  return null;
}

function toAttempt(d: QueryDocumentSnapshot<DocumentData>): Attempt {
  const x = d.data();
  return {
    id: d.id,
    razorpayOrderId: String(x.razorpayOrderId ?? d.id),
    kind: x.kind === "subscription" ? "subscription" : "cart",
    status: x.status ?? "created",
    amount: Number(x.amount ?? 0),
    userId: String(x.userId ?? ""),
    userPhone: x.userPhone ?? null,
    userName: x.userName ?? null,
    customerName: x.customerName ?? null,
    customerPhone: x.customerPhone ?? null,
    razorpayContact: x.razorpayContact ?? null,
    razorpayEmail: x.razorpayEmail ?? null,
    subtotal: x.subtotal ?? null,
    deliveryCharge: x.deliveryCharge ?? null,
    gstAdded: x.gstAdded ?? null,
    items: Array.isArray(x.items) ? x.items : [],
    seatCount: x.seatCount ?? null,
    durationMonths: x.durationMonths ?? null,
    note: x.note ?? null,
    source: String(x.source ?? "unknown"),
    error: x.error ?? null,
    createdAt: toDate(x.createdAt),
  };
}

async function fetchAttemptsInRange(from: Date, to: Date): Promise<Attempt[]> {
  const q = query(
    collection(db, "paymentAttempts"),
    where("createdAt", ">=", Timestamp.fromDate(from)),
    where("createdAt", "<=", Timestamp.fromDate(to)),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map(toAttempt);
}

// ─── razorpayPayments (gateway truth) ───────────────────────────────────────────

export type PaymentRefund = {
  id: string;
  amount: number;
  status: string | null;
  createdAt: number | null;
};

export type Payment = {
  paymentId: string;
  orderId: string | null;
  status: PaymentStatus;
  amount: number;
  amountRefunded: number;
  method: string | null;
  errorCode: string | null;
  errorReason: string | null;
  errorDescription: string | null;
  errorSource: string | null;
  errorStep: string | null;
  contact: string | null;
  email: string | null;
  userId: string | null;
  createdAt: Date | null;
  capturedAt: Date | null;
  refunds: PaymentRefund[];
};

function toPayment(d: QueryDocumentSnapshot<DocumentData>): Payment {
  const x = d.data();
  return {
    paymentId: String(x.paymentId ?? d.id),
    orderId: x.orderId ?? null,
    status: (x.status ?? "created") as PaymentStatus,
    amount: Number(x.amount ?? 0),
    amountRefunded: Number(x.amountRefunded ?? 0),
    method: x.method ?? null,
    errorCode: x.errorCode ?? null,
    errorReason: x.errorReason ?? null,
    errorDescription: x.errorDescription ?? null,
    errorSource: x.errorSource ?? null,
    errorStep: x.errorStep ?? null,
    contact: x.contact ?? null,
    email: x.email ?? null,
    userId: x.userId ?? null,
    createdAt: toDate(x.createdAt),
    capturedAt: toDate(x.capturedAt),
    refunds: Array.isArray(x.refunds) ? x.refunds : [],
  };
}

async function fetchPaymentsInRange(from: Date, to: Date): Promise<Payment[]> {
  const q = query(
    collection(db, "razorpayPayments"),
    where("createdAt", ">=", Timestamp.fromDate(from)),
    where("createdAt", "<=", Timestamp.fromDate(to)),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map(toPayment);
}

// ─── Normalized categories (the dashboard's single vocabulary) ──────────────────

export type Category =
  | "successful"
  | "abandoned"
  | "failed"
  | "refunded"
  | "pending"
  | "unresolved";

export const CATEGORY_LABEL: Record<Category, string> = {
  successful: "Successful",
  abandoned: "Abandoned",
  failed: "Failed",
  refunded: "Refunded",
  pending: "Pending",
  unresolved: "Unresolved",
};

/** Gateway payment → category. Authoritative: the app's label is irrelevant here. */
function categoryOfGateway(p: Payment): Category {
  const b = classifyPayment(p); // captured | refunded | failed | created
  if (b === "captured") return "successful";
  if (b === "refunded") return "refunded";
  if (b === "created") return "pending";
  // failed: a timeout is abandonment; anything else (insufficient funds, bank
  // rejection) is a genuine failure.
  return isTimeoutFailure(p) ? "abandoned" : "failed";
}

/** App-only order (no gateway payment ever existed) → category. A genuine
 *  failure always leaves a gateway payment, so an app "failed" here is really
 *  an abandonment; "paid" with no gateway payment can't be trusted. */
function categoryOfAppOnly(a: Attempt, now: number): Category {
  if (a.status === "paid") return "unresolved";
  if (a.status === "failed") return "abandoned";
  // created
  return now - (a.createdAt?.getTime() ?? 0) > ABANDON_AFTER_MS ? "abandoned" : "pending";
}

// ─── Unified row ─────────────────────────────────────────────────────────────────

export type PaymentRow = {
  key: string;
  source: "razorpay" | "app";
  category: Category;
  payment: Payment | null;
  attempt: Attempt | null;
  // precomputed display
  createdAt: Date | null;
  amount: number;
  name: string;
  phone: string | null;
  product: string;
  platform: Platform;
  reason: string;
  orderId: string | null;
  paymentId: string | null;
  rawGatewayStatus: string | null;
  rawAppStatus: string | null;
};

function productSummary(a: Attempt): string {
  if (a.kind === "subscription") {
    return `Subscription — ${a.seatCount ?? "?"} seat(s), ${a.durationMonths ?? "?"} month(s)`;
  }
  if (a.items.length > 0) return a.items.map((i) => `${i.name} ×${i.qty}`).join(", ");
  return a.note || "Cart order";
}

function nameOf(a: Attempt | null, p: Payment | null): string {
  return (
    a?.userName ||
    a?.customerName ||
    p?.contact ||
    p?.email ||
    a?.razorpayContact ||
    "Unknown buyer"
  );
}

function phoneOf(a: Attempt | null, p: Payment | null): string | null {
  return a?.userPhone || a?.customerPhone || p?.contact || a?.razorpayContact || null;
}

function gatewayReason(p: Payment, category: Category): string {
  if (p.errorDescription || p.errorReason) return p.errorDescription || p.errorReason!;
  switch (category) {
    case "abandoned":
      return "Payment timed out before completion.";
    case "successful":
      return "Payment captured.";
    case "refunded":
      return `Refunded ${money(p.amountRefunded)}.`;
    case "pending":
      return "Authorized/created — not yet captured.";
    default:
      return "—";
  }
}

function appReason(a: Attempt, category: Category): string {
  switch (category) {
    case "abandoned":
      return a.error?.description || a.error?.reason
        ? `${a.error?.description || a.error?.reason} (closed before any payment reached Razorpay)`
        : "Checkout closed/cancelled before any payment reached Razorpay.";
    case "pending":
      return "Checkout in progress — not yet paid.";
    case "unresolved":
      return "App recorded a payment but no Razorpay payment was found — needs reconciliation.";
    default:
      return "—";
  }
}

/**
 * Merges both collections into one deduped, normalized row set. Gateway rows
 * win on any order that has a payment; app-only orders are added as their own
 * rows. Newest first.
 */
export function buildRows(payments: Payment[], attempts: Attempt[], now: number): PaymentRow[] {
  const attemptByOrder = new Map<string, Attempt>();
  for (const a of attempts) attemptByOrder.set(a.razorpayOrderId, a);
  const gatewayOrderIds = new Set<string>();
  for (const p of payments) if (p.orderId) gatewayOrderIds.add(p.orderId);

  const rows: PaymentRow[] = [];

  // Gateway rows (authoritative).
  for (const p of payments) {
    const a = p.orderId ? (attemptByOrder.get(p.orderId) ?? null) : null;
    const category = categoryOfGateway(p);
    rows.push({
      key: `pay_${p.paymentId}`,
      source: "razorpay",
      category,
      payment: p,
      attempt: a,
      createdAt: p.createdAt,
      amount: p.amount || a?.amount || 0,
      name: nameOf(a, p),
      phone: phoneOf(a, p),
      product: a ? productSummary(a) : "—",
      platform: a ? platformOfSource(a.source) : "unknown",
      reason: gatewayReason(p, category),
      orderId: p.orderId,
      paymentId: p.paymentId,
      rawGatewayStatus: p.status,
      rawAppStatus: a?.status ?? null,
    });
  }

  // App-only rows (orders Razorpay never recorded a payment for).
  for (const a of attempts) {
    if (gatewayOrderIds.has(a.razorpayOrderId)) continue; // overlap → already counted
    const category = categoryOfAppOnly(a, now);
    rows.push({
      key: `att_${a.id}`,
      source: "app",
      category,
      payment: null,
      attempt: a,
      createdAt: a.createdAt,
      amount: a.amount,
      name: nameOf(a, null),
      phone: phoneOf(a, null),
      product: productSummary(a),
      platform: platformOfSource(a.source),
      reason: appReason(a, category),
      orderId: a.razorpayOrderId,
      paymentId: null,
      rawGatewayStatus: null,
      rawAppStatus: a.status,
    });
  }

  rows.sort((x, y) => (y.createdAt?.getTime() ?? 0) - (x.createdAt?.getTime() ?? 0));
  return rows;
}

/** One call for the page: fetch both collections for the range and merge. */
export async function fetchPaymentRows(from: Date, to: Date): Promise<PaymentRow[]> {
  const [payments, attempts] = await Promise.all([
    fetchPaymentsInRange(from, to),
    fetchAttemptsInRange(from, to).catch(() => [] as Attempt[]),
  ]);
  return buildRows(payments, attempts, Date.now());
}

// ─── CSV export ─────────────────────────────────────────────────────────────────

function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const CSV_HEADERS = [
  "Payment ID",
  "Razorpay Order ID",
  "Source",
  "Category",
  "Raw Gateway Status",
  "Raw App Status",
  "Customer Name",
  "Customer Phone Number",
  "Customer ID",
  "Product Name",
  "Product ID",
  "Quantity",
  "Subtotal",
  "Delivery Charges",
  "GST",
  "Total Amount",
  "Error Code",
  "Error Description",
  "Error Source",
  "Error Step",
  "Error Reason",
  "Payment Method",
  "Platform",
  "Created Date",
  "Captured Date",
  "Refund Status",
];

const fmtDate = (d: Date | null) => (d ? d.toISOString() : "");

export function paymentsToCsv(rows: PaymentRow[]): string {
  const lines = [CSV_HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    const p = r.payment;
    const a = r.attempt;
    const productName = a
      ? a.kind === "subscription"
        ? productSummary(a)
        : a.items.map((i) => i.name).join(" | ")
      : "";
    const productId = a ? a.items.map((i) => i.productId).join(" | ") : "";
    const qty = a ? a.items.reduce((s, i) => s + (Number(i.qty) || 0), 0) : "";
    lines.push(
      [
        r.paymentId ?? "",
        r.orderId ?? "",
        r.source,
        CATEGORY_LABEL[r.category],
        r.rawGatewayStatus ?? "",
        r.rawAppStatus ?? "",
        r.name,
        r.phone ?? "",
        p?.userId ?? a?.userId ?? "",
        productName,
        productId,
        a?.kind === "subscription" ? (a.seatCount ?? "") : qty || "",
        a?.subtotal ?? "",
        a?.deliveryCharge ?? "",
        a?.gstAdded ?? "",
        r.amount,
        p?.errorCode ?? a?.error?.code ?? "",
        p?.errorDescription ?? a?.error?.description ?? "",
        p?.errorSource ?? "",
        p?.errorStep ?? "",
        p?.errorReason ?? a?.error?.reason ?? "",
        p?.method ?? "",
        PLATFORM_LABEL[r.platform],
        fmtDate(r.createdAt),
        fmtDate(p?.capturedAt ?? null),
        p && p.amountRefunded > 0 ? `refunded ${money(p.amountRefunded)}` : "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
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
