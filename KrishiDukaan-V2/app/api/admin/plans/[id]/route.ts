import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../../lib/firebase-admin";
import { requireAdmin } from "../../../../lib/admin-auth";
import { PLAN_FEATURE_CATALOG } from "../../../../admin/_lib/plan-features";

const VALID_FEATURE_KEYS = new Set(PLAN_FEATURE_CATALOG.map((f) => f.key));
const VALID_STATUSES = new Set(["active", "inactive", "archived"]);

// ─── PATCH /api/admin/plans/[id] ───────────────────────────────────────────
// Partial update — price/seats/features/description/status/etc. Never
// touches subscriptions that already reference this plan (they hold their
// own snapshot of everything that matters).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;
  const { id } = await params;

  try {
    const body = await request.json();
    const adminDb = getAdminDb();
    const planRef = adminDb.collection("plans").doc(id);
    const snap = await planRef.get();
    if (!snap.exists) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    const before = snap.data();

    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: "Plan name is required." }, { status: 400 });
      patch.name = name;
    }
    if (body.description !== undefined) patch.description = String(body.description).trim();
    if (body.price !== undefined) {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: "Price must be a non-negative number." }, { status: 400 });
      if (Math.round(price * 100) !== price * 100) return NextResponse.json({ error: "Price cannot have more than 2 decimal places." }, { status: 400 });
      patch.price = price;
    }
    if (body.durationMonths !== undefined) {
      const durationMonths = Number(body.durationMonths);
      if (!Number.isInteger(durationMonths) || durationMonths <= 0) return NextResponse.json({ error: "Duration (months) must be a positive integer." }, { status: 400 });
      patch.durationMonths = durationMonths;
    }
    if (body.seats !== undefined) {
      const seats = Number(body.seats);
      if (!Number.isInteger(seats) || seats <= 0) return NextResponse.json({ error: "Seats must be a positive integer." }, { status: 400 });
      patch.seats = seats;
    }
    if (body.features !== undefined) {
      if (!Array.isArray(body.features)) return NextResponse.json({ error: "features must be an array." }, { status: 400 });
      for (const f of body.features) {
        if (!VALID_FEATURE_KEYS.has(f)) return NextResponse.json({ error: `Unknown feature key: ${f}` }, { status: 400 });
      }
      patch.features = body.features.map(String);
    }
    if (body.limits !== undefined && typeof body.limits === "object") patch.limits = body.limits;
    if (body.displayOrder !== undefined) patch.displayOrder = Number(body.displayOrder) || 0;
    if (body.trialDays !== undefined) {
      const trialDays = Number(body.trialDays);
      if (!Number.isInteger(trialDays) || trialDays < 0) return NextResponse.json({ error: "Trial days must be a non-negative integer." }, { status: 400 });
      patch.trialDays = trialDays;
    }
    if (body.status !== undefined) {
      if (!VALID_STATUSES.has(body.status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      patch.status = body.status;
    }

    const batch = adminDb.batch();
    batch.update(planRef, patch);
    batch.set(adminDb.collection("adminLogs").doc(), {
      action: "admin_plan_update",
      performedBy: caller.uid,
      targetId: id,
      before,
      after: patch,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[api/admin/plans/[id] PATCH]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to update plan." }, { status: 500 });
  }
}

// ─── DELETE /api/admin/plans/[id] ──────────────────────────────────────────
// Hard-deletes only if zero subscriptions reference this plan (checked
// inside the same transaction as the delete, to close the race between the
// check and a concurrent subscription assignment). Otherwise 409 — the
// client should archive instead (PATCH { status: 'archived' }).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;
  const { id } = await params;

  try {
    const adminDb = getAdminDb();
    const planRef = adminDb.collection("plans").doc(id);

    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(planRef);
      if (!snap.exists) return { status: 404 as const, error: "Plan not found." };

      const refs = await tx.get(
        adminDb.collection("subscriptions").where("planId", "==", id).limit(1),
      );
      if (!refs.empty) {
        return { status: 409 as const, error: "This plan has existing subscriptions — archive it instead of deleting." };
      }

      tx.delete(planRef);
      tx.set(adminDb.collection("adminLogs").doc(), {
        action: "admin_plan_archive",
        performedBy: caller.uid,
        targetId: id,
        before: snap.data(),
        after: { deleted: true },
        createdAt: FieldValue.serverTimestamp(),
      });
      return { status: 200 as const };
    });

    if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[api/admin/plans/[id] DELETE]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to delete plan." }, { status: 500 });
  }
}
