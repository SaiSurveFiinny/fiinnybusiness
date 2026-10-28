import { getAdminAuth, getAdminDb } from "./firebase-admin";

/**
 * Server-side influencer subscription gate.
 *
 * The influencer dashboard and its protected APIs must NOT trust the client's
 * own view of whether it is subscribed — hiding a link or doing the check only
 * in a React layout is not enforcement. This resolves, from a verified Firebase
 * ID token alone:
 *   1. who the caller is (uid → uidIndex → phone, the standard resolution),
 *   2. that their role is 'influencer',
 *   3. that they hold an ACTIVE, unexpired subscription.
 *
 * It reads the same `users/{phone}` fields the client-side
 * readInfluencerSubscriptionStatus() reads, with the same strict rule (active +
 * isPaid + a future expiry), so the server and the UI can never disagree about
 * who is allowed in.
 */

export type InfluencerAccessStatus =
  | "unauthenticated" // no / invalid token
  | "forbidden"       // authenticated but not an influencer
  | "no-subscription" // influencer, but no active (unexpired) subscription
  | "active";         // influencer with an active subscription

export interface InfluencerAccess {
  status: InfluencerAccessStatus;
  uid: string | null;
  phone: string | null;
  planName: string | null;
  expiry: Date | null;
}

function bearer(request: Request): string | null {
  const h = request.headers.get("Authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

/** Resolve the user doc behind a verified token (uid-keyed, else phone-keyed). */
async function loadUser(uid: string): Promise<{ phone: string | null; data: Record<string, unknown> | null }> {
  const adminDb = getAdminDb();
  const [byUid, idx] = await Promise.all([
    adminDb.collection("users").doc(uid).get(),
    adminDb.collection("uidIndex").doc(uid).get(),
  ]);
  if (byUid.exists) {
    const data = byUid.data() as Record<string, unknown>;
    return { phone: (data.phone as string) ?? null, data };
  }
  const phone = idx.exists ? String(idx.data()?.phone ?? "") || null : null;
  if (phone) {
    const byPhone = await adminDb.collection("users").doc(phone).get();
    if (byPhone.exists) return { phone, data: byPhone.data() as Record<string, unknown> };
  }
  return { phone, data: null };
}

/**
 * The authoritative check: is there an ACTIVE, unexpired influencer
 * subscription RECORD for this user?
 *
 * Access is decided off the `subscriptions` document (the record created from a
 * server-verified Razorpay payment) — NOT off the denormalized user-doc flags.
 * Those flags are a convenience mirror the client writes; if that secondary
 * write never lands (a dropped request, the idempotent/duplicate path, a stale
 * read) the payment is still real and must still grant access. Reading the
 * payment record here means a successful payment is honoured even when the
 * mirror is missing, and an already-paid influencer is never asked to pay
 * again to unlock access.
 *
 * Matched by ownerId (uid) OR ownerPhone, the two keys activation writes.
 * Expired or non-active records are ignored, so a lapsed subscription correctly
 * reads as no-subscription.
 */
async function findActiveInfluencerSubscription(
  uid: string,
  phone: string | null,
): Promise<{ planName: string | null; expiry: Date } | null> {
  const adminDb = getAdminDb();
  const now = Date.now();
  try {
    const snaps = await Promise.all([
      adminDb.collection("subscriptions").where("ownerId", "==", uid).get(),
      ...(phone
        ? [adminDb.collection("subscriptions").where("ownerPhone", "==", phone).get()]
        : []),
    ]);
    const seen = new Set<string>();
    let best: { expMs: number; planName: string | null } | null = null;
    for (const snap of snaps) {
      for (const d of snap.docs) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        const x = d.data() as Record<string, unknown>;
        if (x.ownerType !== "influencer") continue;
        if (x.subscriptionStatus !== "active") continue;
        const exp = x.expiryDate as { toMillis?: () => number } | undefined;
        const expMs = exp && typeof exp.toMillis === "function" ? exp.toMillis() : null;
        if (expMs == null || expMs <= now) continue; // expired / cancelled → ignore
        if (!best || expMs > best.expMs) best = { expMs, planName: (x.planName as string) ?? null };
      }
    }
    return best ? { planName: best.planName, expiry: new Date(best.expMs) } : null;
  } catch (e) {
    // On a query failure, fail CLOSED (no access) rather than falsely granting.
    console.error("[influencer-access] subscription lookup failed:", e);
    return null;
  }
}

export async function resolveInfluencerAccess(request: Request): Promise<InfluencerAccess> {
  const token = bearer(request);
  if (!token) return { status: "unauthenticated", uid: null, phone: null, planName: null, expiry: null };

  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return { status: "unauthenticated", uid: null, phone: null, planName: null, expiry: null };
  }

  const { phone, data } = await loadUser(uid);
  if (!data || data.role !== "influencer") {
    return { status: "forbidden", uid, phone, planName: null, expiry: null };
  }

  const sub = await findActiveInfluencerSubscription(uid, phone);
  if (!sub) {
    return { status: "no-subscription", uid, phone, planName: null, expiry: null };
  }

  return { status: "active", uid, phone, planName: sub.planName, expiry: sub.expiry };
}

/** HTTP status for a non-active access result — used by protected API routes. */
export function httpStatusFor(status: InfluencerAccessStatus): number {
  switch (status) {
    case "unauthenticated":
      return 401;
    case "forbidden":
      return 403;
    case "no-subscription":
      return 402; // Payment Required — the client redirects to the paywall
    default:
      return 200;
  }
}
