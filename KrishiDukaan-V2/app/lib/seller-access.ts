import { getAdminAuth, getAdminDb } from "./firebase-admin";

/**
 * Server-side seller (retailer / manufacturer) subscription gate.
 *
 * The dashboard and the post-login redirect must NOT decide a seller's access
 * from the denormalized `users/{phone}.isPaid` flag. That flag is a snapshot
 * written when a plan is bought and is never cleared when the plan expires
 * (there is no cron) — so an expired seller still reads `isPaid: true` and was
 * being let onto /dashboard. The authoritative truth is the same one the seat
 * screens already use (app/lib/subscription-status.ts, isSubscriptionActive):
 * an ACTIVE, unexpired `subscriptions` record.
 *
 * This resolves, from a verified Firebase ID token alone:
 *   1. who the caller is (uid → uidIndex → phone, the standard resolution),
 *   2. that their role is 'retailer' or 'manufacturer',
 *   3. that they hold access RIGHT NOW, which is either
 *        a) an active, unexpired subscription record, OR
 *        b) (retailers only) an active, unexpired manufacturer-assigned seat
 *           listing — the invited-retailer path, which grants access without a
 *           self-purchased subscription.
 *
 * An explicit admin kill-switch (`subscriptionStatus` on the user doc set to
 * 'revoked' or 'cancelled') always denies, so the admin Revoke/Cancel actions
 * keep working even if a stale subscription record is still marked active.
 */

export type SellerAccessStatus =
  | "unauthenticated" // no / invalid token
  | "forbidden"       // authenticated but not a seller (retailer/manufacturer)
  | "no-subscription" // seller, but no active (unexpired) subscription or seat
  | "active";         // seller with active access

export type SellerRole = "retailer" | "manufacturer";

export interface SellerAccess {
  status: SellerAccessStatus;
  uid: string | null;
  phone: string | null;
  role: SellerRole | null;
  expiry: Date | null;
}

const KILL_SWITCH = new Set(["revoked", "cancelled"]);

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

function tsMillis(v: unknown): number | null {
  const t = v as { toMillis?: () => number } | undefined;
  return t && typeof t.toMillis === "function" ? t.toMillis() : null;
}

/**
 * The authoritative check: is there an ACTIVE, unexpired subscription RECORD
 * for this seller? Matched by ownerId (uid) OR ownerPhone, the two keys every
 * subscription write stamps (see createSubscription / adminManualActivate).
 * Expired or non-active records are ignored, so a lapsed plan correctly reads
 * as no-subscription. Returns the latest expiry among running plans.
 */
async function findActiveSubscription(
  uid: string,
  phone: string | null,
): Promise<{ expiry: Date } | null> {
  const adminDb = getAdminDb();
  const now = Date.now();
  const snaps = await Promise.all([
    adminDb.collection("subscriptions").where("ownerId", "==", uid).get(),
    ...(phone ? [adminDb.collection("subscriptions").where("ownerPhone", "==", phone).get()] : []),
  ]);
  const seen = new Set<string>();
  let bestExp: number | null = null;
  for (const snap of snaps) {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const x = d.data() as Record<string, unknown>;
      if (x.ownerType !== "retailer" && x.ownerType !== "manufacturer") continue;
      if (x.subscriptionStatus !== "active") continue;
      const exp = tsMillis(x.expiryDate);
      if (exp == null || exp <= now) continue; // expired / cancelled → ignore
      const start = tsMillis(x.startDate);
      if (start != null && start > now) continue; // scheduled, not yet running
      if (bestExp == null || exp > bestExp) bestExp = exp;
    }
  }
  return bestExp != null ? { expiry: new Date(bestExp) } : null;
}

/**
 * Invited-retailer path: an active, unexpired manufacturer-assigned seat
 * listing grants a retailer access without a self-purchased subscription.
 * Mirrors retailerHasActiveSeat in app/dashboard/_lib/subscriptions-firestore.ts
 * (retailerId = Auth UID post-signup, retailerDocId = E164 phone pre-signup).
 */
async function findActiveAssignedSeat(
  uid: string,
  phone: string | null,
): Promise<{ expiry: Date } | null> {
  const adminDb = getAdminDb();
  const now = Date.now();
  const snaps = await Promise.all([
    adminDb.collection("retailerSeatListings").where("retailerId", "==", uid).get(),
    ...(phone && phone !== uid
      ? [adminDb.collection("retailerSeatListings").where("retailerDocId", "==", phone).get()]
      : []),
  ]);
  const seen = new Set<string>();
  let bestExp: number | null = null;
  for (const snap of snaps) {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const x = d.data() as Record<string, unknown>;
      if (x.listingType !== "assigned") continue;
      if (x.status !== "active") continue;
      const exp = tsMillis(x.expiresAt);
      if (exp == null || exp <= now) continue;
      if (bestExp == null || exp > bestExp) bestExp = exp;
    }
  }
  return bestExp != null ? { expiry: new Date(bestExp) } : null;
}

export async function resolveSellerAccess(request: Request): Promise<SellerAccess> {
  const token = bearer(request);
  if (!token) return { status: "unauthenticated", uid: null, phone: null, role: null, expiry: null };

  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return { status: "unauthenticated", uid: null, phone: null, role: null, expiry: null };
  }

  const { phone, data } = await loadUser(uid);
  const role = data?.role;
  if (!data || (role !== "retailer" && role !== "manufacturer")) {
    return { status: "forbidden", uid, phone, role: null, expiry: null };
  }
  const sellerRole = role as SellerRole;

  // Admin kill-switch — Revoke/Cancel always denies, regardless of any stale
  // subscription record still marked active.
  if (KILL_SWITCH.has(String(data.subscriptionStatus ?? ""))) {
    return { status: "no-subscription", uid, phone, role: sellerRole, expiry: null };
  }

  try {
    const sub = await findActiveSubscription(uid, phone);
    if (sub) return { status: "active", uid, phone, role: sellerRole, expiry: sub.expiry };

    if (sellerRole === "retailer") {
      const seat = await findActiveAssignedSeat(uid, phone);
      if (seat) return { status: "active", uid, phone, role: sellerRole, expiry: seat.expiry };
    }
  } catch (e) {
    // On a query failure, fail CLOSED (no access) rather than falsely granting.
    console.error("[seller-access] lookup failed:", e);
    return { status: "no-subscription", uid, phone, role: sellerRole, expiry: null };
  }

  return { status: "no-subscription", uid, phone, role: sellerRole, expiry: null };
}

/** HTTP status for a non-active access result — used by protected API routes. */
export function httpStatusFor(status: SellerAccessStatus): number {
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
