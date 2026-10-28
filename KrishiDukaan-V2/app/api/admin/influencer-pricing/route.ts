/**
 * GET/PUT the influencer subscription pricing (settings/influencerPricing).
 *
 * This is the document /api/payment/influencer/create-order reads to price an
 * influencer checkout, so a write here changes what influencers are charged.
 * Admin-only, validated, and written to adminLogs with before/after — same
 * contract as /api/admin/pricing, but a SEPARATE document so retailer and
 * influencer prices can never be edited into each other.
 */
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { requireAdmin } from "../../../lib/admin-auth";
import {
  DEFAULT_INFLUENCER_PLANS,
  INFLUENCER_PRICING_DOC_PATH,
  parseInfluencerPlans,
} from "../../../lib/influencer-pricing";

const ref = () =>
  getAdminDb()
    .collection(INFLUENCER_PRICING_DOC_PATH.collection)
    .doc(INFLUENCER_PRICING_DOC_PATH.doc);

export async function GET(request: Request) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const snap = await ref().get();
    const parsed = snap.exists ? parseInfluencerPlans(snap.data()) : null;
    return NextResponse.json({
      plans: parsed ?? DEFAULT_INFLUENCER_PLANS,
      usingDefaults: parsed === null,
      updatedAt: snap.exists ? snap.data()?.updatedAt ?? null : null,
    });
  } catch (e) {
    console.error("[api/admin/influencer-pricing GET]", e);
    return NextResponse.json({ error: "Failed to load influencer pricing." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const body = await request.json();
    const plans = parseInfluencerPlans(body);
    if (!plans) {
      return NextResponse.json(
        {
          error:
            "Invalid influencer pricing. Each plan needs a period of 1, 3, 6 or 12 months, a whole-number rupee price, and an enabled flag, with no duplicate periods.",
        },
        { status: 400 },
      );
    }
    if (plans.length === 0) {
      return NextResponse.json({ error: "At least one plan is required." }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const now = FieldValue.serverTimestamp();
    const before = (await ref().get()).data() ?? null;

    const batch = adminDb.batch();
    batch.set(ref(), { plans, updatedBy: caller.uid, updatedAt: now }, { merge: true });
    batch.set(adminDb.collection("adminLogs").doc(), {
      action: "admin_influencer_pricing_update",
      performedBy: caller.uid,
      targetId: `${INFLUENCER_PRICING_DOC_PATH.collection}/${INFLUENCER_PRICING_DOC_PATH.doc}`,
      before: before?.plans ?? null,
      after: plans,
      createdAt: now,
    });
    await batch.commit();

    return NextResponse.json({ success: true, plans });
  } catch (e) {
    console.error("[api/admin/influencer-pricing PUT]", e);
    return NextResponse.json({ error: "Failed to save influencer pricing." }, { status: 500 });
  }
}
