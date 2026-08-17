import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "../../../../lib/firebase-admin";
import { requireAdmin } from "../../../../lib/admin-auth";
import { PLAN_FEATURE_CATALOG } from "../../../../admin/_lib/plan-features";

const VALID_FEATURE_KEYS = new Set(PLAN_FEATURE_CATALOG.map((f) => f.key));

// ─── PATCH /api/admin/subscriptions/[id] ───────────────────────────────────
//
// Two things live here: a full field-level edit (price/seats/features/
// duration/dates/notes), and — when body.action === 'cancel' — the new
// Cancel action. Cancel updates BOTH the subscriptions doc and users doc
// (the existing client-side adminRevokeSubscription only ever touched
// users/{id}, leaving the subscriptions doc's own status stale — that
// existing drift is fixed here for the new action, without changing the
// old Revoke button's behavior).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;
  const { id } = await params;

  try {
    const body = await request.json();
    const adminDb = getAdminDb();
    const subRef = adminDb.collection("subscriptions").doc(id);

    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(subRef);
      if (!snap.exists) return { status: 404 as const, error: "Subscription not found." };
      const before = snap.data()!;
      const ownerPhone = String(before.ownerPhone ?? before.ownerId ?? "");
      const userRef = ownerPhone ? adminDb.collection("users").doc(ownerPhone) : null;
      const now = FieldValue.serverTimestamp();

      if (body.action === "cancel") {
        tx.update(subRef, { subscriptionStatus: "cancelled", updatedAt: now });
        if (userRef) {
          tx.set(userRef, { isPaid: false, subscriptionStatus: "cancelled", updatedAt: now }, { merge: true });
        }
        tx.set(adminDb.collection("adminLogs").doc(), {
          action: "admin_subscription_cancel",
          performedBy: caller.uid,
          targetId: id,
          before: { subscriptionStatus: before.subscriptionStatus },
          after: { subscriptionStatus: "cancelled" },
          createdAt: now,
        });
        return { status: 200 as const };
      }

      // Full field edit.
      const patch: Record<string, unknown> = { updatedAt: now };

      if (body.seats !== undefined) {
        const seats = Number(body.seats);
        if (!Number.isInteger(seats) || seats <= 0) return { status: 400 as const, error: "Seats must be a positive integer." };
        patch.seatsPurchased = seats;
      }
      if (body.price !== undefined) {
        const price = Number(body.price);
        if (!Number.isFinite(price) || price < 0) return { status: 400 as const, error: "Price must be a non-negative number." };
        if (Math.round(price * 100) !== price * 100) return { status: 400 as const, error: "Price cannot have more than 2 decimal places." };
        patch.amountPaid = price;
      }
      if (body.durationMonths !== undefined) {
        const durationMonths = Number(body.durationMonths);
        if (!Number.isInteger(durationMonths) || durationMonths <= 0) return { status: 400 as const, error: "Duration (months) must be a positive integer." };
        patch.durationMonths = durationMonths;
      }
      if (body.features !== undefined) {
        if (!Array.isArray(body.features)) return { status: 400 as const, error: "features must be an array." };
        for (const f of body.features) {
          if (!VALID_FEATURE_KEYS.has(f)) return { status: 400 as const, error: `Unknown feature key: ${f}` };
        }
        patch.features = body.features.map(String);
      }
      if (body.limits !== undefined && typeof body.limits === "object") patch.limits = body.limits;
      if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes).trim() : null;

      if (body.startDate !== undefined || body.expiryDate !== undefined) {
        const startDate = body.startDate ? new Date(body.startDate) : (before.startDate?.toDate?.() ?? new Date());
        const expiryDate = body.expiryDate ? new Date(body.expiryDate) : (before.expiryDate?.toDate?.() ?? new Date());
        if (isNaN(startDate.getTime()) || isNaN(expiryDate.getTime())) {
          return { status: 400 as const, error: "Invalid date." };
        }
        if (expiryDate <= startDate) return { status: 400 as const, error: "End date must be after start date." };
        patch.startDate = Timestamp.fromDate(startDate);
        patch.expiryDate = Timestamp.fromDate(expiryDate);
      }

      // Seat-count-change side effect: keep users.totalSeats in sync, same
      // as the existing adminUpdateSubscriptionSeats behavior. Does not
      // auto-revoke any retailerSeatListings above a newly-lowered cap —
      // matching existing seat-math behavior (over-cap listings persist
      // until they expire naturally); the client surfaces current usage so
      // the admin can make an informed call before lowering seats.
      if (patch.seatsPurchased !== undefined && userRef) {
        const userSnap = await tx.get(userRef);
        if (userSnap.exists) {
          tx.set(userRef, { totalSeats: patch.seatsPurchased, updatedAt: now }, { merge: true });
        }
      }

      tx.update(subRef, patch);
      tx.set(adminDb.collection("adminLogs").doc(), {
        action: "admin_subscription_edit",
        performedBy: caller.uid,
        targetId: id,
        before: {
          seatsPurchased: before.seatsPurchased, amountPaid: before.amountPaid,
          durationMonths: before.durationMonths, features: before.features ?? [],
        },
        after: patch,
        createdAt: now,
      });

      return { status: 200 as const };
    });

    if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[api/admin/subscriptions/[id] PATCH]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to update subscription." }, { status: 500 });
  }
}
