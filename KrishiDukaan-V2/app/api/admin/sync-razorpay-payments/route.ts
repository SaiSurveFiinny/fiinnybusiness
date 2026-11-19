import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { requireAdmin } from "../../../lib/admin-auth";
import {
  upsertPaymentFromEntity,
  type RazorpayPaymentEntity,
} from "../../../lib/payments-mirror";

/**
 * POST /api/admin/sync-razorpay-payments
 *
 * One-time (and re-runnable) import of Razorpay's payment records into the
 * `payments` mirror. Unlike /api/admin/sync-razorpay-failures — which only ever
 * wrote FAILED rows — this mirrors EVERY status (created, authorized, captured,
 * refunded, failed), because the new Payments dashboard is driven entirely by
 * this collection and needs the complete, authoritative picture.
 *
 * Razorpay's List Payments API has no status filter, so it pages the whole
 * window and upserts each payment. Bounded per call (MAX_PAGES) with
 * `nextSkip`/`hasMore` so the caller keeps going until the window is covered,
 * exactly like the failures sync.
 *
 * Idempotent: upsertPaymentFromEntity writes by payment id inside a
 * transaction that only advances status, so re-runs and overlapping windows
 * never duplicate or regress a record.
 */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

const PAGE_SIZE = 100;
const MAX_PAGES = 10; // up to 1000 payments per call — inside a normal request timeout

export async function POST(req: NextRequest): Promise<NextResponse> {
  const caller = await requireAdmin(req);
  if (caller instanceof NextResponse) return caller;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      from?: number; // unix seconds
      to?: number;
      skip?: number;
    };
    const from = body.from;
    const to = body.to;
    let skip = body.skip ?? 0;

    let scanned = 0;
    let written = 0;
    let pages = 0;
    let hasMore = true;

    while (pages < MAX_PAGES) {
      const page = await razorpay.payments.all({
        count: PAGE_SIZE,
        skip,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      });

      const items = (page.items ?? []) as unknown as RazorpayPaymentEntity[];
      pages++;
      scanned += items.length;

      for (const p of items) {
        if (!p.id) continue;
        try {
          await upsertPaymentFromEntity(p, "backfill");
          written++;
        } catch {
          // Logged by Firestore internally; one bad row must not stop the page.
        }
      }

      skip += items.length;
      if (items.length < PAGE_SIZE) {
        hasMore = false;
        break;
      }
    }

    return NextResponse.json({ ok: true, scanned, written, nextSkip: skip, hasMore });
  } catch (error) {
    console.error("[sync-razorpay-payments] failed:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
