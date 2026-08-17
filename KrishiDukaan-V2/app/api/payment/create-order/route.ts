import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { getAdminDb } from '../../../lib/firebase-admin';
import {
  DEFAULT_DURATIONS,
  PRICING_DOC_PATH,
  applyDiscount,
  parseDurations,
  parsePromo,
  priceFor,
  type DurationPrice,
} from '../../../lib/pricing';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/**
 * Live pricing ladder from settings/pricing, or the built-in defaults.
 *
 * The client never gets to say what anything costs — it sends a seat count and a
 * duration, and the amount is computed here. That property is unchanged by
 * moving the table into Firestore; only the source of the numbers moved.
 *
 * A read failure falls back to DEFAULT_DURATIONS rather than throwing, so a
 * missing or corrupt settings doc degrades to the previously hardcoded prices
 * instead of taking checkout down.
 */
async function loadDurations(): Promise<DurationPrice[]> {
  try {
    const snap = await getAdminDb()
      .collection(PRICING_DOC_PATH.collection)
      .doc(PRICING_DOC_PATH.doc)
      .get();
    if (!snap.exists) return DEFAULT_DURATIONS;
    return parseDurations(snap.data()) ?? DEFAULT_DURATIONS;
  } catch (e) {
    console.error('[create-order] pricing read failed, using defaults:', e);
    return DEFAULT_DURATIONS;
  }
}

/**
 * Resolve a promo code to a discount percentage.
 *
 * Reads the promoCodes/ collection — the SAME source SubscriptionView shows the
 * seller. Previously this route read a PROMO_CODES env var while the UI read
 * Firestore, so a code that existed in only one place meant the seller was shown
 * a discount and charged full price (or the reverse).
 *
 * The env var is still honoured as a fallback so any promo currently configured
 * that way keeps working; Firestore wins when both define the same code.
 */
async function resolveDiscount(rawCode: unknown): Promise<number> {
  const code = String(rawCode ?? '').trim().toUpperCase();
  if (!code) return 0;

  try {
    const snap = await getAdminDb()
      .collection('promoCodes')
      .where('code', '==', code)
      .where('active', '==', true)
      .limit(1)
      .get();
    if (!snap.empty) {
      const promo = parsePromo(snap.docs[0]!.data());
      if (promo) return promo.discountPercent;
    }
  } catch (e) {
    console.error('[create-order] promo read failed:', e);
  }

  // Legacy fallback: PROMO_CODES={"LAUNCH20":20}
  try {
    const raw = process.env.PROMO_CODES;
    if (raw) {
      const map = JSON.parse(raw) as Record<string, number>;
      const pct = Number(map[code]);
      if (Number.isFinite(pct) && pct > 0 && pct <= 100) return pct;
    }
  } catch {
    /* malformed env var — ignore */
  }

  return 0;
}

export async function POST(request: Request) {
  try {
    const { seatCount, durationMonths, promoCode, userId } = await request.json();

    const durations = await loadDurations();

    const seats = Math.max(1, parseInt(String(seatCount), 10) || 1);

    // Unknown/absent period falls back to the shortest offered one rather than
    // assuming a literal 1 month — the ladder is admin-editable now and may not
    // contain a 1-month entry.
    const requested = Number(durationMonths);
    const months =
      priceFor(durations, requested) !== null ? requested : durations[0]!.months;
    const unitPrice = priceFor(durations, months)!;

    const discountPercent = await resolveDiscount(promoCode);
    const subtotal = seats * unitPrice;
    const baseAmount = discountPercent
      ? applyDiscount(subtotal, discountPercent)
      : subtotal;

    const options = {
      amount: baseAmount * 100, // paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      notes: {
        userId:         userId || '',
        seatCount:      seats,
        durationMonths: months,
        promoCode:      promoCode || '',
        unitPrice,
        discountPercent,
      },
    };

    const order = await razorpay.orders.create(options);
    return NextResponse.json({
      ...order,
      seatCount:      seats,
      durationMonths: months,
      unitPrice,
      discountPercent,
      // Return the key used to create this order so the mobile always opens
      // Razorpay with the matching key (prevents key-mismatch errors).
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
