/**
 * GET/PUT the self-serve subscription pricing ladder (settings/pricing).
 *
 * This is the document that api/payment/create-order reads to price a checkout,
 * so a write here changes what sellers are charged. Admin-only, validated, and
 * written to adminLogs with before/after — same contract as the plans routes.
 */
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { requireAdmin } from "../../../lib/admin-auth";
import {
  DEFAULT_DURATIONS,
  PRICING_DOC_PATH,
  parseDurations,
} from "../../../lib/pricing";

const ref = () =>
  getAdminDb().collection(PRICING_DOC_PATH.collection).doc(PRICING_DOC_PATH.doc);

export async function GET(request: Request) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const snap = await ref().get();
    const parsed = snap.exists ? parseDurations(snap.data()) : null;
    return NextResponse.json({
      durations: parsed ?? DEFAULT_DURATIONS,
      // Tells the UI whether it is showing saved values or the built-in
      // fallback, so an admin knows the doc has never been written.
      usingDefaults: parsed === null,
      updatedAt: snap.exists ? snap.data()?.updatedAt ?? null : null,
    });
  } catch (e) {
    console.error("[api/admin/pricing GET]", e);
    return NextResponse.json({ error: "Failed to load pricing." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const body = await request.json();
    const durations = parseDurations(body);
    if (!durations) {
      return NextResponse.json(
        {
          error:
            "Invalid pricing. Each row needs a whole-number duration in months and a whole-number rupee price, with no duplicate durations.",
        },
        { status: 400 },
      );
    }
    if (durations.length === 0) {
      return NextResponse.json(
        { error: "At least one duration is required." },
        { status: 400 },
      );
    }

    const adminDb = getAdminDb();
    const now = FieldValue.serverTimestamp();
    const before = (await ref().get()).data() ?? null;

    const batch = adminDb.batch();
    batch.set(
      ref(),
      { durations, updatedBy: caller.uid, updatedAt: now },
      { merge: true },
    );
    batch.set(adminDb.collection("adminLogs").doc(), {
      action: "admin_pricing_update",
      performedBy: caller.uid,
      targetId: `${PRICING_DOC_PATH.collection}/${PRICING_DOC_PATH.doc}`,
      before: before?.durations ?? null,
      after: durations,
      createdAt: now,
    });
    await batch.commit();

    return NextResponse.json({ success: true, durations });
  } catch (e) {
    console.error("[api/admin/pricing PUT]", e);
    return NextResponse.json({ error: "Failed to save pricing." }, { status: 500 });
  }
}
