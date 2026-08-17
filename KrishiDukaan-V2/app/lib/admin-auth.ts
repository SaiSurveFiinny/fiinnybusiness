import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "./firebase-admin";

export type AdminCaller = { uid: string; phone: string | null };

/**
 * Verifies the request's Firebase ID token AND that the resulting user is a
 * full admin (role === 'admin'). Combines the two existing-but-separate
 * patterns in the codebase: ID-token verification (create-cart-order/route.ts)
 * and the uid→uidIndex→phone admin-role resolution
 * (api/admin/create-user/route.ts) — the latter previously trusted a
 * client-supplied uid instead of a verified token.
 *
 * Team accounts (role === 'team') are deliberately NOT accepted here — plan/
 * subscription mutations touch pricing and entitlements directly, so this
 * bar is stricter than the read-only 'subscriptions' admin section team
 * members can already have.
 */
export async function requireAdmin(request: Request): Promise<AdminCaller | NextResponse> {
  const authHeader = request.headers.get("Authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired authorization token." }, { status: 401 });
  }

  const adminDb = getAdminDb();
  const [callerDoc, idxDoc] = await Promise.all([
    adminDb.collection("users").doc(uid).get(),
    adminDb.collection("uidIndex").doc(uid).get(),
  ]);

  let isAdmin = callerDoc.exists && callerDoc.data()?.role === "admin";
  let phone: string | null = idxDoc.exists ? String(idxDoc.data()?.phone ?? "") || null : null;

  if (!isAdmin && phone) {
    const phoneDoc = await adminDb.collection("users").doc(phone).get();
    isAdmin = phoneDoc.exists && phoneDoc.data()?.role === "admin";
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden — admin only." }, { status: 403 });
  }

  return { uid, phone };
}
