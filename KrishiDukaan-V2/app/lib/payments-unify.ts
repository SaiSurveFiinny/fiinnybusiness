import { classifyPayment, isTimeoutFailure, type PaymentStatus } from "./payments-shared";

export type { PaymentStatus };

/**
 * Pure unified payment model — NO Firestore SDK imports, so it runs both
 * server-side (admin API route, Admin SDK docs) and client-side (rendering).
 *
 * The data fetch lives elsewhere; this module only maps plain doc data, merges
 * the two sources, classifies, and formats. One definition of the merge/dedup/
 * classification rules, shared by the writer of the API response and the reader.
 */

export const ABANDON_AFTER_MS = 30 * 60 * 1000;

// ─── Types ───────────────────────────────────────────────────────────────────

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
  id: string;
  razorpayOrderId: string;
  kind: "cart" | "subscription";
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
  source: string;
  error: { code?: string | null; description?: string | null; reason?: string | null } | null;
  createdAt: Date | null;
};

export type PaymentRefund = { id: string; amount: number; status: string | null; createdAt: number | null };

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

export type Platform = "app" | "web" | "razorpay" | "unknown";
export const PLATFORM_LABEL: Record<Platform, string> = {
  app: "App",
  web: "Web",
  razorpay: "Razorpay (synced)",
  unknown: "Unknown",
};

export type Category = "successful" | "abandoned" | "failed" | "refunded" | "pending" | "unresolved";
export const CATEGORY_LABEL: Record<Category, string> = {
  successful: "Successful",
  abandoned: "Abandoned",
  failed: "Failed",
  refunded: "Refunded",
  pending: "Pending",
  unresolved: "Unresolved",
};

export type PaymentRow = {
  key: string;
  source: "razorpay" | "app";
  category: Category;
  payment: Payment | null;
  attempt: Attempt | null;
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

export const money = (n: number) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

// ─── Mappers (plain data → typed) — tolerate Admin Timestamp, JS Date, ms, ISO ──

export function toDate(v: unknown): Date | null {
  if (v == null) return null;
  const t = v as { toDate?: () => Date; _seconds?: number };
  if (typeof t.toDate === "function") return t.toDate();
  if (v instanceof Date) return v;
  if (typeof t._seconds === "number") return new Date(t._seconds * 1000);
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function mapPayment(id: string, x: Record<string, any>): Payment {
  return {
    paymentId: String(x.paymentId ?? id),
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

export function mapAttempt(id: string, x: Record<string, any>): Attempt {
  return {
    id,
    razorpayOrderId: String(x.razorpayOrderId ?? id),
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

// ─── Classification (decision table) ────────────────────────────────────────────

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

function categoryOfGateway(p: Payment): Category {
  const b = classifyPayment(p);
  if (b === "captured") return "successful";
  if (b === "refunded") return "refunded";
  if (b === "created") return "pending";
  return isTimeoutFailure(p) ? "abandoned" : "failed";
}

function categoryOfAppOnly(a: Attempt, now: number): Category {
  if (a.status === "paid") return "unresolved";
  if (a.status === "failed") return "abandoned";
  return now - (a.createdAt?.getTime() ?? 0) > ABANDON_AFTER_MS ? "abandoned" : "pending";
}

export function productSummary(a: Attempt): string {
  if (a.kind === "subscription") {
    return `Subscription — ${a.seatCount ?? "?"} seat(s), ${a.durationMonths ?? "?"} month(s)`;
  }
  if (a.items.length > 0) return a.items.map((i) => `${i.name} ×${i.qty}`).join(", ");
  return a.note || "Cart order";
}

function nameOf(a: Attempt | null, p: Payment | null): string {
  return a?.userName || a?.customerName || p?.contact || p?.email || a?.razorpayContact || "Unknown buyer";
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

/** Merge both sources into one deduped, normalized, newest-first row set. */
export function buildRows(payments: Payment[], attempts: Attempt[], now: number): PaymentRow[] {
  const attemptByOrder = new Map<string, Attempt>();
  for (const a of attempts) attemptByOrder.set(a.razorpayOrderId, a);
  const gatewayOrderIds = new Set<string>();
  for (const p of payments) if (p.orderId) gatewayOrderIds.add(p.orderId);

  const rows: PaymentRow[] = [];

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

  for (const a of attempts) {
    if (gatewayOrderIds.has(a.razorpayOrderId)) continue;
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

// ─── Column filters (same shape/rules as Admin → Orders) ────────────────────────

export type AmountOp = "gt" | "lt" | "eq" | "range";

/**
 * Structured per-column filters, mirroring OrderFilters. Different groups AND
 * together; the platform multi-select ORs within itself. Applied server-side so
 * it narrows ALL records in the window, not just the loaded page. Date is NOT
 * here — it's the fetch window (preset chips / Date column), handled upstream.
 */
export type PaymentFilters = {
  customerName: string;
  product: string;
  phone: string;
  reason: string;
  platforms: Platform[];
  amount: { op: AmountOp; min: string; max: string };
};

export const EMPTY_PAYMENT_FILTERS: PaymentFilters = {
  customerName: "",
  product: "",
  phone: "",
  reason: "",
  platforms: [],
  amount: { op: "range", min: "", max: "" },
};

const digitsOf = (s: string) => s.replace(/\D/g, "");

/** True when a row satisfies every active column filter. */
export function matchesPaymentFilters(r: PaymentRow, f: PaymentFilters): boolean {
  if (f.customerName.trim() && !r.name.toLowerCase().includes(f.customerName.trim().toLowerCase())) return false;
  if (f.product.trim() && !r.product.toLowerCase().includes(f.product.trim().toLowerCase())) return false;
  if (f.reason.trim() && !r.reason.toLowerCase().includes(f.reason.trim().toLowerCase())) return false;
  if (f.phone.trim()) {
    const want = digitsOf(f.phone);
    if (want && !digitsOf(r.phone ?? "").includes(want)) return false;
  }
  if (f.platforms.length > 0 && !f.platforms.includes(r.platform)) return false;
  if (f.amount.min.trim() !== "" || f.amount.max.trim() !== "") {
    const t = r.amount;
    const min = f.amount.min.trim() === "" ? null : Number(f.amount.min);
    const max = f.amount.max.trim() === "" ? null : Number(f.amount.max);
    switch (f.amount.op) {
      case "gt": if (min !== null && !(t > min)) return false; break;
      case "lt": if (max !== null && !(t < max)) return false; break;
      case "eq": if (min !== null && Math.abs(t - min) > 0.5) return false; break;
      case "range":
        if (min !== null && t < min) return false;
        if (max !== null && t > max) return false;
        break;
    }
  }
  return true;
}

export function countActivePaymentFilters(f: PaymentFilters): number {
  let n = 0;
  if (f.customerName.trim()) n++;
  if (f.product.trim()) n++;
  if (f.phone.trim()) n++;
  if (f.reason.trim()) n++;
  if (f.platforms.length) n++;
  if (f.amount.min.trim() || f.amount.max.trim()) n++;
  return n;
}

export type PaymentFilterChip = { key: string; label: string; clear: (f: PaymentFilters) => PaymentFilters };

/** Active filters as removable chips, in column order. */
export function activePaymentChips(f: PaymentFilters): PaymentFilterChip[] {
  const chips: PaymentFilterChip[] = [];
  if (f.customerName.trim())
    chips.push({ key: "name", label: `Customer: ${f.customerName.trim()}`, clear: (x) => ({ ...x, customerName: "" }) });
  if (f.product.trim())
    chips.push({ key: "product", label: `Product: ${f.product.trim()}`, clear: (x) => ({ ...x, product: "" }) });
  if (f.phone.trim())
    chips.push({ key: "phone", label: `Phone: ${f.phone.trim()}`, clear: (x) => ({ ...x, phone: "" }) });
  for (const p of f.platforms)
    chips.push({ key: `plat:${p}`, label: `Platform: ${PLATFORM_LABEL[p]}`, clear: (x) => ({ ...x, platforms: x.platforms.filter((v) => v !== p) }) });
  if (f.amount.min.trim() || f.amount.max.trim()) {
    const a = f.amount;
    const label = a.op === "gt" ? `> ₹${a.min}` : a.op === "lt" ? `< ₹${a.max}` : a.op === "eq" ? `= ₹${a.min}` : `₹${a.min || "0"} – ₹${a.max || "∞"}`;
    chips.push({ key: "amount", label: `Amount: ${label}`, clear: (x) => ({ ...x, amount: { op: "range", min: "", max: "" } }) });
  }
  if (f.reason.trim())
    chips.push({ key: "reason", label: `Reason: ${f.reason.trim()}`, clear: (x) => ({ ...x, reason: "" }) });
  return chips;
}

/** Text search over the display fields of a row. */
export function rowMatches(r: PaymentRow, q: string): boolean {
  if (!q) return true;
  const n = q.toLowerCase();
  return (
    (r.phone ?? "").toLowerCase().includes(n) ||
    r.name.toLowerCase().includes(n) ||
    (r.paymentId ?? "").toLowerCase().includes(n) ||
    (r.orderId ?? "").toLowerCase().includes(n) ||
    r.product.toLowerCase().includes(n)
  );
}

export function emptyCounts(): Record<Category, number> {
  return { successful: 0, abandoned: 0, failed: 0, refunded: 0, pending: 0, unresolved: 0 };
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const CSV_HEADERS = [
  "Payment ID", "Razorpay Order ID", "Source", "Category", "Raw Gateway Status", "Raw App Status",
  "Customer Name", "Customer Phone Number", "Customer ID", "Product Name", "Product ID", "Quantity",
  "Subtotal", "Delivery Charges", "GST", "Total Amount", "Error Code", "Error Description",
  "Error Source", "Error Step", "Error Reason", "Payment Method", "Platform", "Created Date",
  "Captured Date", "Refund Status",
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
        r.paymentId ?? "", r.orderId ?? "", r.source, CATEGORY_LABEL[r.category],
        r.rawGatewayStatus ?? "", r.rawAppStatus ?? "", r.name, r.phone ?? "",
        p?.userId ?? a?.userId ?? "", productName, productId,
        a?.kind === "subscription" ? (a.seatCount ?? "") : qty || "",
        a?.subtotal ?? "", a?.deliveryCharge ?? "", a?.gstAdded ?? "", r.amount,
        p?.errorCode ?? a?.error?.code ?? "", p?.errorDescription ?? a?.error?.description ?? "",
        p?.errorSource ?? "", p?.errorStep ?? "", p?.errorReason ?? a?.error?.reason ?? "",
        p?.method ?? "", PLATFORM_LABEL[r.platform], fmtDate(r.createdAt),
        fmtDate(p?.capturedAt ?? null),
        p && p.amountRefunded > 0 ? `refunded ${money(p.amountRefunded)}` : "",
      ].map(csvCell).join(","),
    );
  }
  return lines.join("\r\n");
}
