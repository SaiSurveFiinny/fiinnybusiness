import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { requireAdmin } from "../../../lib/admin-auth";
import { PLAN_FEATURE_CATALOG } from "../../../admin/_lib/plan-features";

const VALID_FEATURE_KEYS = new Set(PLAN_FEATURE_CATALOG.map((f) => f.key));

function validatePlanBody(body: any): { error: string } | {
  name: string; description: string; price: number; durationMonths: number;
  seats: number; features: string[]; limits: Record<string, number>;
  displayOrder: number; trialDays: number;
} {
  const name = String(body?.name ?? "").trim();
  if (!name) return { error: "Plan name is required." };

  const price = Number(body?.price);
  if (!Number.isFinite(price) || price < 0) return { error: "Price must be a non-negative number." };
  // Avoid floating-point money errors — reject sub-paisa fractions.
  if (Math.round(price * 100) !== price * 100) return { error: "Price cannot have more than 2 decimal places." };

  const durationMonths = Number(body?.durationMonths);
  if (!Number.isInteger(durationMonths) || durationMonths <= 0) {
    return { error: "Duration (months) must be a positive integer." };
  }

  const seats = Number(body?.seats);
  if (!Number.isInteger(seats) || seats <= 0) return { error: "Seats must be a positive integer." };

  const features = Array.isArray(body?.features) ? body.features.map(String) : [];
  for (const f of features) {
    if (!VALID_FEATURE_KEYS.has(f as any)) return { error: `Unknown feature key: ${f}` };
  }

  const displayOrder = Number.isFinite(Number(body?.displayOrder)) ? Number(body.displayOrder) : 0;
  const trialDays = Number.isInteger(Number(body?.trialDays)) && Number(body.trialDays) >= 0 ? Number(body.trialDays) : 0;

  return {
    name,
    description: String(body?.description ?? "").trim(),
    price,
    durationMonths,
    seats,
    features,
    limits: (body?.limits && typeof body.limits === "object") ? body.limits : {},
    displayOrder,
    trialDays,
  };
}

// ─── POST /api/admin/plans ────────────────────────────────────────────────
// Creates a reusable subscription plan template. Admin-only (requireAdmin).
export async function POST(request: Request) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const body = await request.json();
    const parsed = validatePlanBody(body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const adminDb = getAdminDb();
    const now = FieldValue.serverTimestamp();
    const planRef = adminDb.collection("plans").doc();

    const planDoc = {
      ...parsed,
      currency: "INR" as const,
      status: "active" as const,
      createdBy: caller.uid,
      createdAt: now,
      updatedAt: now,
    };

    const batch = adminDb.batch();
    batch.set(planRef, planDoc);
    batch.set(adminDb.collection("adminLogs").doc(), {
      action: "admin_plan_create",
      performedBy: caller.uid,
      targetId: planRef.id,
      after: { ...parsed, currency: "INR" },
      createdAt: now,
    });
    await batch.commit();

    return NextResponse.json({ success: true, id: planRef.id });
  } catch (e) {
    console.error("[api/admin/plans POST]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to create plan." }, { status: 500 });
  }
}
