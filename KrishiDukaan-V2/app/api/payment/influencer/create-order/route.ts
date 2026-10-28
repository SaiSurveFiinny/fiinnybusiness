import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { getAdminAuth, getAdminDb } from '../../../../lib/firebase-admin';
import { recordAttempt } from '../../../../lib/payment-attempts';
import {
  DEFAULT_INFLUENCER_PLANS,
  INFLUENCER_PRICING_DOC_PATH,
  influencerPlanFor,
  parseInfluencerPlans,
  periodLabel,
  type InfluencerPlan,
} from '../../../../lib/influencer-pricing';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/**
 * Live influencer pricing from settings/influencerPricing, or the built-in
 * defaults. The client never says what anything costs — it sends a period, the
 * amount is computed here. A read failure falls back to defaults rather than
 * throwing, so a missing/corrupt doc degrades gracefully (mirrors create-order).
 */
async function loadPlans(): Promise<InfluencerPlan[]> {
  try {
    const snap = await getAdminDb()
      .collection(INFLUENCER_PRICING_DOC_PATH.collection)
      .doc(INFLUENCER_PRICING_DOC_PATH.doc)
      .get();
    if (!snap.exists) return DEFAULT_INFLUENCER_PLANS;
    return parseInfluencerPlans(snap.data()) ?? DEFAULT_INFLUENCER_PLANS;
  } catch (e) {
    console.error('[influencer/create-order] pricing read failed, using defaults:', e);
    return DEFAULT_INFLUENCER_PLANS;
  }
}

/**
 * The account role behind this request, from a verified Firebase ID token —
 * never from the body. Same uid → uidIndex → phone resolution the rest of the
 * codebase uses. Returns null when there is no usable token.
 */
async function resolveCallerRole(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7));
    const adminDb = getAdminDb();
    const [byUid, idx] = await Promise.all([
      adminDb.collection('users').doc(decoded.uid).get(),
      adminDb.collection('uidIndex').doc(decoded.uid).get(),
    ]);
    if (byUid.exists && byUid.data()?.role) return String(byUid.data()!.role);
    const phone = idx.exists ? String(idx.data()?.phone ?? '') : '';
    if (phone) {
      const byPhone = await adminDb.collection('users').doc(phone).get();
      if (byPhone.exists && byPhone.data()?.role) return String(byPhone.data()!.role);
    }
  } catch (e) {
    console.error('[influencer/create-order] role resolution failed:', e);
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const { durationMonths, userId } = await request.json();

    // Influencer plans are influencer-only. A non-influencer token is refused
    // outright — this is the gate that keeps influencer pricing from ever
    // applying to a retailer/manufacturer/customer, and vice-versa.
    const role = await resolveCallerRole(request);
    if (role !== 'influencer') {
      return NextResponse.json(
        { error: 'Influencer subscription plans are available to influencer accounts only.' },
        { status: 403 },
      );
    }

    const plans = await loadPlans();
    const plan = influencerPlanFor(plans, Number(durationMonths));

    // Unknown period, or a plan an admin has disabled — refuse rather than
    // silently substitute, so the amount charged always matches what was shown.
    if (!plan || !plan.enabled) {
      return NextResponse.json(
        { error: 'This plan has just been updated. Please refresh the page and choose your plan again.' },
        { status: 409 },
      );
    }

    const months = plan.months;
    const amount = plan.price; // flat, server-computed; the client never sends it
    const planName = `Influencer ${periodLabel(months)}`;

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // paise
      currency: 'INR',
      receipt: `inf_receipt_${Date.now()}`,
      notes: {
        userId: userId || '',
        durationMonths: months,
        // verify/ relays these back off the gateway so the record written
        // afterwards can never be re-derived from a stale price table.
        planName,
        planTier: 'influencer',
        seatCount: 1,
        kind: 'influencer_subscription',
        amountCharged: amount,
      },
    });

    // Same lifecycle record as every other order, so the admin Payments view
    // covers influencer subscription failures too.
    await recordAttempt({
      razorpayOrderId: order.id,
      kind: 'subscription',
      userId: String(userId || ''),
      amount,
      subtotal: amount,
      seatCount: 1,
      durationMonths: months,
      source: request.headers.get('x-client') === 'mobile' ? 'mobile' : 'web',
      note: `${planName} subscription`,
    });

    return NextResponse.json({
      ...order,
      durationMonths: months,
      planName,
      amountCharged: amount,
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Error creating influencer Razorpay order:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
