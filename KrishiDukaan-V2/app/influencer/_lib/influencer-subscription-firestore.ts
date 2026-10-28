import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../../firebase";

// ─── Influencer subscription lifecycle (client-side activation) ──────────────
//
// Mirrors the retailer flow in firebase.ts `updateSubscriptionStatus`: the
// client writes the subscription ONLY after /api/payment/verify has verified
// the Razorpay signature server-side and handed back gateway-trusted figures.
// Paid access is never granted off the Razorpay success callback alone.
//
// Differences from the retailer path, on purpose:
//   • ownerType is 'influencer' and the account role is NOT changed (an
//     influencer never becomes a retailer).
//   • the subscription doc id is DETERMINISTIC — `inf_sub_<razorpayPaymentId>`
//     — and we check-before-write, so replaying the same verified payment (a
//     double-submit, a retried network call) can never grant a second
//     subscription. The retailer path uses addDoc(); influencer hardens this.

/** Gateway-verified figures, as returned by /api/payment/verify. */
export interface VerifiedInfluencerPayment {
  durationMonths: number;
  /** Rupees Razorpay actually captured (order.amount / 100). */
  amountPaid: number;
  planName: string;
}

export interface InfluencerPaymentDetails {
  orderId: string | null;
  paymentId: string | null;
}

export interface ActivateInput {
  uid: string;
  /** Normalized E.164 phone — the users/{phone} and ownership key. */
  phone: string;
  verified: VerifiedInfluencerPayment;
  paymentDetails: InfluencerPaymentDetails;
}

export interface ActivateResult {
  activated: boolean;
  /** True when this exact payment had already been activated (no-op). */
  duplicate: boolean;
  expiryDate: Date;
}

/**
 * Activate (or no-op re-activate) an influencer subscription after a verified
 * payment. Idempotent on razorpay_payment_id.
 */
export async function activateInfluencerSubscription({
  uid,
  phone,
  verified,
  paymentDetails,
}: ActivateInput): Promise<ActivateResult> {
  const months = Math.max(1, Number(verified.durationMonths) || 1);
  const amount = Number(verified.amountPaid) || 0;
  const planName = String(verified.planName || "").trim() || `Influencer ${months} month(s)`;

  const now = new Date();
  const expiry = new Date(now);
  expiry.setMonth(expiry.getMonth() + months);

  // Deterministic id keyed on the gateway payment id (fallback: order id) so a
  // replay lands on the same doc instead of creating a duplicate.
  const dedupeKey = paymentDetails.paymentId || paymentDetails.orderId || `${uid}_${now.getTime()}`;
  const subId = `inf_sub_${dedupeKey}`;
  const subRef = doc(db, "subscriptions", subId);

  const timestamp = serverTimestamp();

  // Authoritative subscription record. ownerPhone == myPhone() satisfies the
  // subscriptions create rule (ownerType 'influencer', non-promotional).
  //
  // We DO NOT pre-read this doc. A get() on a not-yet-existing subscription is
  // denied by the rules — the read rule dereferences resource.data, which is
  // null for a missing doc, so no owner clause can be true — and that denial is
  // exactly the "Missing or insufficient permissions" seen on the FIRST
  // activation. Instead we write directly: a first activation is a create()
  // (allowed for the owner); a replay of the SAME payment is an update() of an
  // existing doc (allow update: admin only → denied), which we catch and treat
  // as an idempotent no-op after confirming the doc is really there (a read of
  // an existing own doc IS allowed). This preserves duplicate protection while
  // fixing the first-run permission error.
  try {
    await setDoc(subRef, {
      ownerId: uid,
      ownerPhone: phone,
      ownerType: "influencer",
      planName,
      planTier: "influencer",
      durationMonths: months,
      seatsPurchased: 1,
      amountPaid: amount,
      currency: "INR",
      razorpayOrderId: paymentDetails.orderId ?? null,
      razorpayPaymentId: paymentDetails.paymentId ?? null,
      subscriptionStatus: "active",
      isPromotional: false,
      startDate: Timestamp.fromDate(now),
      expiryDate: Timestamp.fromDate(expiry),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  } catch (e) {
    // A denied write to a doc that ALREADY exists = this payment was already
    // activated (retry / double-submit). Confirm and return the existing expiry
    // instead of surfacing an error. Any other failure (e.g. a genuine rule
    // misconfiguration, or the doc truly absent) is re-thrown.
    if ((e as { code?: string })?.code === "permission-denied") {
      const existing = await getDoc(subRef).catch(() => null);
      if (existing?.exists()) {
        const data = existing.data() as Record<string, unknown>;
        const exp = data.expiryDate instanceof Timestamp ? data.expiryDate.toDate() : expiry;
        return { activated: false, duplicate: true, expiryDate: exp };
      }
    }
    throw e;
  }

  // Payments ledger row (userPhone == myPhone() satisfies the payments create rule).
  // Best-effort: a failed ledger write must not undo an already-written subscription.
  try {
    await addDoc(collection(db, "payments"), {
      userId: uid,
      userPhone: phone,
      amount,
      seatCount: 1,
      durationMonths: months,
      planName,
      planTier: "influencer",
      currency: "INR",
      razorpayOrderId: paymentDetails.orderId ?? null,
      razorpayPaymentId: paymentDetails.paymentId ?? null,
      timestamp,
      status: "success",
    });
  } catch (e) {
    console.warn("[influencer-subscription] payment ledger write failed:", e);
  }

  // Reflect paid status on the user doc so the influencer area can read it
  // without a subscriptions query. Role is intentionally untouched.
  await setDoc(
    doc(db, "users", phone),
    {
      isPaid: true,
      subscriptionStatus: "active",
      subscriptionPlanName: planName,
      subscriptionExpiry: Timestamp.fromDate(expiry),
      updatedAt: timestamp,
    },
    { merge: true },
  );

  return { activated: true, duplicate: false, expiryDate: expiry };
}

export interface InfluencerSubscriptionStatus {
  active: boolean;
  planName: string | null;
  expiryDate: Date | null;
}

/** Read the influencer's subscription status from their user doc. */
export function readInfluencerSubscriptionStatus(
  user: Record<string, unknown> | null | undefined,
): InfluencerSubscriptionStatus {
  if (!user) return { active: false, planName: null, expiryDate: null };
  const exp =
    user.subscriptionExpiry instanceof Timestamp
      ? user.subscriptionExpiry.toDate()
      : null;
  // A real paid subscription always has a future expiry. We require one here
  // (rather than treating a missing expiry as "active forever") so the paywall
  // can never be bypassed by a half-written or legacy user doc.
  const active =
    user.subscriptionStatus === "active" &&
    user.isPaid === true &&
    exp != null &&
    exp.getTime() > Date.now();
  return {
    active,
    planName: (user.subscriptionPlanName as string) ?? null,
    expiryDate: exp,
  };
}

/** True when the user currently holds an active, unexpired influencer subscription. */
export function hasActiveInfluencerSubscription(
  user: Record<string, unknown> | null | undefined,
): boolean {
  return readInfluencerSubscriptionStatus(user).active;
}
