import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { requireAdmin } from "../../../lib/admin-auth";
import { FieldValue } from "firebase-admin/firestore";

// POST /api/admin/delete-user
//
// Fully removes an email-based admin-portal account (team / salesExecutive /
// admin) by its Firebase UID, which is also the Firestore doc id for these
// accounts (users/{uid}):
//
//   1. Delete the Firebase Auth account (so the user can no longer sign in).
//   2. Delete the users/{uid} Firestore document (so they stop appearing in
//      the Teams / Users & Roles listing). For a "team" account this also
//      drops its `adminSections` grants, since those live on the doc itself —
//      no separate permissions collection to clean up.
//
// Both steps are idempotent: an already-missing Auth account or Firestore doc
// is treated as success, not an error. The two deletions run independently and
// partial failures are logged and reported so the caller can safely retry
// (the retry finishes whatever step failed).
//
// Deliberately NOT deleted here: historical orders, payments, payouts, dealer
// visits and other business/audit records the account produced — those are
// preserved. For seller (retailer/manufacturer) accounts the browser calls
// adminDeleteUser() (app/firebase.ts) first for their phone-keyed cleanup, then
// this route for the Auth account; deleting users/{uid} here is a harmless
// no-op in that flow because the seller doc is keyed by phone and already gone.
export async function POST(req: NextRequest) {
  try {
    // Deleting an account on the say-so of a uid in the request body is the
    // same hole create-user had. The token decides who the caller is.
    const caller = await requireAdmin(req);
    if (caller instanceof NextResponse) return caller;

    const body = await req.json();
    const { targetUid } = body as { targetUid?: string };
    if (!targetUid) return NextResponse.json({ error: "targetUid required." }, { status: 400 });

    // An admin must not be able to delete their own account out from under
    // themselves mid-session.
    if (targetUid === caller.uid) {
      return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
    }

    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    // Snapshot the Firestore doc up front so the audit log records who/what was
    // removed even after the doc is gone.
    const userRef = adminDb.collection("users").doc(targetUid);
    const snap = await userRef.get().catch(() => null);
    const data = snap?.exists ? snap.data() ?? {} : {};

    const warnings: string[] = [];
    let authDeleted = false;
    let docDeleted = false;

    // ── 1. Firebase Auth account ──────────────────────────────────────────────
    try {
      await adminAuth.deleteUser(targetUid);
      authDeleted = true;
    } catch (e: any) {
      if (e?.code === "auth/user-not-found") {
        // Already gone — nothing to do.
      } else {
        console.error("[delete-user] auth deletion failed:", e);
        warnings.push(`auth: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // ── 2. Firestore user document (and the team grants it carries) ───────────
    try {
      if (snap?.exists) {
        await userRef.delete();
        docDeleted = true;
      }
    } catch (e: any) {
      console.error("[delete-user] firestore doc deletion failed:", e);
      warnings.push(`firestore: ${e instanceof Error ? e.message : String(e)}`);
    }

    // ── 3. Audit trail (never blocks the response) ────────────────────────────
    await adminDb
      .collection("adminLogs")
      .doc()
      .set({
        action: "admin_delete_user",
        targetUid,
        targetEmail: String((data as any).email ?? ""),
        targetRole: String((data as any).role ?? ""),
        performedBy: caller.uid,
        authDeleted,
        docDeleted,
        warnings,
        createdAt: FieldValue.serverTimestamp(),
      })
      .catch((e) => console.error("[delete-user] audit log write failed:", e));

    // A real error on either deletion is surfaced as a 500 so the caller knows
    // the account is not fully removed and can retry — the operation is
    // idempotent, so retrying finishes the part that failed. "Already missing"
    // is not a warning and still yields success.
    if (warnings.length > 0) {
      return NextResponse.json(
        {
          error: "User deletion partially failed. Retry to complete.",
          authDeleted,
          docDeleted,
          warnings,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, authDeleted, docDeleted });
  } catch (e: unknown) {
    console.error("[delete-user]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete user." },
      { status: 500 },
    );
  }
}
