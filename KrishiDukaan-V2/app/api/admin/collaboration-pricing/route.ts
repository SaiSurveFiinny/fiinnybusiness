/**
 * GET/PUT the collaboration pricing (settings/collaborationPricing).
 *
 * This is the document the collaboration list API reads to price every
 * influencer offer shown to manufacturers and retailers, so a write here changes
 * what businesses are quoted platform-wide. Admin-only, validated, and written
 * to adminLogs with before/after — same contract as /api/admin/pricing and
 * /api/admin/influencer-pricing, but a SEPARATE document so the three price sets
 * can never be edited into one another.
 */
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { requireAdmin } from "../../../lib/admin-auth";
import {
  COLLABORATION_PRICING_DOC_PATH,
  DEFAULT_COLLABORATION_PRICING,
  parseCollaborationPricing,
} from "../../../lib/collaboration-pricing";

const ref = () =>
  getAdminDb()
    .collection(COLLABORATION_PRICING_DOC_PATH.collection)
    .doc(COLLABORATION_PRICING_DOC_PATH.doc);

export async function GET(request: Request) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const snap = await ref().get();
    const parsed = snap.exists ? parseCollaborationPricing(snap.data()) : null;
    return NextResponse.json({
      pricing: parsed ?? DEFAULT_COLLABORATION_PRICING,
      usingDefaults: parsed === null,
      updatedAt: snap.exists ? snap.data()?.updatedAt ?? null : null,
    });
  } catch (e) {
    console.error("[api/admin/collaboration-pricing GET]", e);
    return NextResponse.json({ error: "Failed to load collaboration pricing." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const body = await request.json();
    const pricing = parseCollaborationPricing(body);
    if (!pricing) {
      return NextResponse.json(
        {
          error:
            "Invalid collaboration pricing. Each tier needs a unique id, a label and a valid follower band (min ≥ 0, max blank or ≥ min, no overlaps); each type needs a unique id and label; and every price must be blank or a whole, non-negative rupee amount.",
        },
        { status: 400 },
      );
    }

    const adminDb = getAdminDb();
    const now = FieldValue.serverTimestamp();
    const before = (await ref().get()).data() ?? null;

    const batch = adminDb.batch();
    batch.set(
      ref(),
      { ...pricing, updatedBy: caller.uid, updatedAt: now },
      { merge: false },
    );
    batch.set(adminDb.collection("adminLogs").doc(), {
      action: "admin_collaboration_pricing_update",
      performedBy: caller.uid,
      targetId: `${COLLABORATION_PRICING_DOC_PATH.collection}/${COLLABORATION_PRICING_DOC_PATH.doc}`,
      before: before
        ? { tiers: before.tiers ?? null, types: before.types ?? null, prices: before.prices ?? null }
        : null,
      after: pricing,
      createdAt: now,
    });
    await batch.commit();

    return NextResponse.json({ success: true, pricing });
  } catch (e) {
    console.error("[api/admin/collaboration-pricing PUT]", e);
    return NextResponse.json({ error: "Failed to save collaboration pricing." }, { status: 500 });
  }
}
