import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../lib/admin-auth";
import { getAdminDb } from "../../../lib/firebase-admin";
import {
  buildRows,
  mapAttempt,
  mapPayment,
  rowMatches,
  matchesPaymentFilters,
  emptyCounts,
  type Attempt,
  type AmountOp,
  type Category,
  type Payment,
  type PaymentFilters,
  type Platform,
} from "../../../lib/payments-unify";

/**
 * GET /api/admin/payments — the dashboard's single data source.
 *
 * Does the two-collection fetch, merge, dedup, classification and aggregation
 * SERVER-SIDE (reusing app/lib/payments-unify.ts), and returns only a page of
 * rows plus the category counts. The browser never holds the whole history —
 * that's what makes "All time" safe.
 *
 * Query params:
 *   from, to   unix ms (inclusive). Omit `from` (or 0) for all-time.
 *   platform   app | web | razorpay | unknown | all
 *   q          free-text (name/phone/payment id/order id/product)
 *   category   a Category to page through; omit/"all" for everything
 *   page, pageSize   pagination (ignored when all=1)
 *   all        "1" to return every matching row (CSV export)
 *
 * Counts/refundedValue are computed over the range + platform + text filters
 * but NOT the category tab, so the summary and charts show the full
 * distribution while the table pages one category.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const caller = await requireAdmin(req);
  if (caller instanceof NextResponse) return caller;

  try {
    const sp = req.nextUrl.searchParams;
    const fromMs = Number(sp.get("from") ?? 0);
    const toMs = Number(sp.get("to") ?? Date.now());
    const q = (sp.get("q") ?? "").trim();
    const category = sp.get("category") as Category | null;

    // Column filters (same combining rules as Admin → Orders).
    const filters: PaymentFilters = {
      customerName: sp.get("customerName") ?? "",
      product: sp.get("product") ?? "",
      phone: sp.get("phone") ?? "",
      reason: sp.get("reason") ?? "",
      platforms: (sp.get("platforms") ?? "").split(",").filter(Boolean) as Platform[],
      amount: {
        op: (sp.get("amountOp") ?? "range") as AmountOp,
        min: sp.get("amountMin") ?? "",
        max: sp.get("amountMax") ?? "",
      },
    };
    const all = sp.get("all") === "1";
    const page = Math.max(0, Number(sp.get("page") ?? 0));
    const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize") ?? 25)));

    const from = new Date(fromMs);
    const to = new Date(toMs);
    const db = getAdminDb();

    // "All time" (from <= epoch) must include EVERY record — even the handful
    // of legacy docs with no `createdAt`, which a range filter would silently
    // drop. So all-time scans the whole collection (server-side; the browser
    // still only gets a page). A bounded window filters on `createdAt` — the
    // original timestamp, never `updatedAt` — which needs only the automatic
    // single-field index; buildRows sorts, so no orderBy here.
    const allTime = fromMs <= 0;
    const scope = (name: string) =>
      allTime
        ? db.collection(name).get()
        : db.collection(name).where("createdAt", ">=", from).where("createdAt", "<=", to).get();

    const [paySnap, attSnap] = await Promise.all([scope("razorpayPayments"), scope("paymentAttempts")]);

    const payments: Payment[] = paySnap.docs.map((d) => mapPayment(d.id, d.data()));
    const attempts: Attempt[] = attSnap.docs.map((d) => mapAttempt(d.id, d.data()));

    const rows = buildRows(payments, attempts, Date.now());

    // Apply the free-text search + all column filters, then aggregate — this is
    // the distribution the summary and charts show.
    const filtered = rows.filter((r) => rowMatches(r, q) && matchesPaymentFilters(r, filters));

    const counts = emptyCounts();
    const amounts = emptyCounts();
    let refundedValue = 0;
    for (const r of filtered) {
      counts[r.category] += 1;
      amounts[r.category] += r.amount ?? 0;
      refundedValue += r.payment?.amountRefunded ?? 0;
    }

    // Category tab → the rows the table shows.
    const tabRows = category && category !== ("all" as Category)
      ? filtered.filter((r) => r.category === category)
      : filtered;

    const pageRows = all ? tabRows : tabRows.slice(page * pageSize, page * pageSize + pageSize);

    return NextResponse.json({
      counts,
      amounts,
      refundedValue,
      total: filtered.length,
      tabTotal: tabRows.length,
      rows: pageRows,
    });
  } catch (error) {
    console.error("[admin/payments] failed:", error);
    return NextResponse.json({ error: "Could not load payments" }, { status: 500 });
  }
}
