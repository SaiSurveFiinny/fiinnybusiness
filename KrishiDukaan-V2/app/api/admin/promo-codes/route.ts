/**
 * List and create subscription promo codes (promoCodes/).
 *
 * Until now nothing in the codebase wrote this collection — codes had to be
 * added by hand in the Firestore console, and api/payment/create-order read a
 * PROMO_CODES env var instead, so the two could disagree and charge a seller
 * full price after showing them a discount. create-order now reads this
 * collection; these routes are how it gets populated.
 *
 * Doc id is the uppercased code, which makes a duplicate code impossible.
 */
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { requireAdmin } from "../../../lib/admin-auth";

interface ParsedPromo {
  code: string;
  discountPercent: number;
  active: boolean;
  note: string;
}

function validate(body: unknown): { error: string } | ParsedPromo {
  const b = (body ?? {}) as Record<string, unknown>;

  const code = String(b.code ?? "").trim().toUpperCase();
  if (!code) return { error: "Code is required." };
  // Firestore doc ids cannot contain "/", and a code with spaces or punctuation
  // will never match what a seller types.
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    return {
      error:
        "Code must be 3–32 characters, using only letters, numbers, hyphens and underscores.",
    };
  }

  const discountPercent = Number(b.discountPercent);
  if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
    return { error: "Discount must be between 1 and 100 percent." };
  }

  return {
    code,
    discountPercent,
    active: b.active !== false,
    note: String(b.note ?? "").trim(),
  };
}

export async function GET(request: Request) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const snap = await getAdminDb().collection("promoCodes").get();
    const codes = snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          code: String(x.code ?? d.id),
          discountPercent: Number(x.discountPercent ?? 0),
          active: x.active !== false,
          note: String(x.note ?? ""),
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
    return NextResponse.json({ codes });
  } catch (e) {
    console.error("[api/admin/promo-codes GET]", e);
    return NextResponse.json({ error: "Failed to load promo codes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const parsed = validate(await request.json());
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const docRef = adminDb.collection("promoCodes").doc(parsed.code);
    if ((await docRef.get()).exists) {
      return NextResponse.json(
        { error: `Promo code ${parsed.code} already exists.` },
        { status: 409 },
      );
    }

    const now = FieldValue.serverTimestamp();
    const batch = adminDb.batch();
    batch.set(docRef, { ...parsed, createdBy: caller.uid, createdAt: now, updatedAt: now });
    batch.set(adminDb.collection("adminLogs").doc(), {
      action: "admin_promo_create",
      performedBy: caller.uid,
      targetId: parsed.code,
      after: parsed,
      createdAt: now,
    });
    await batch.commit();

    return NextResponse.json({ success: true, id: parsed.code });
  } catch (e) {
    console.error("[api/admin/promo-codes POST]", e);
    return NextResponse.json({ error: "Failed to create promo code." }, { status: 500 });
  }
}
