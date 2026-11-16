import { NextRequest, NextResponse } from 'next/server';
import { requireSection } from '../../../../lib/admin-auth';
import {
  priceManualOrder,
  verifyPaymentForManualOrder,
  verifyManualOrderPayments,
  type ManualOrderItemInput,
} from '../../../../lib/manual-order';

/**
 * POST /api/admin/manual-order/review
 *
 * The Review + payment-match step. Re-prices the selected products server-side
 * through the authoritative pricing helpers (never trusting any client total)
 * and, when a payment is supplied, verifies it against Razorpay for that exact
 * total and customer — returning the blockers/warnings the UI shows.
 *
 * Body: {
 *   sellerPhone: string,
 *   items: { productId, copyId?, qty, variantUnit? }[],
 *   customerId?: string,
 *   customerDeliveryState?: string,
 *   razorpayPaymentId?: string,
 * }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const caller = await requireSection(req, 'orders');
  if (caller instanceof NextResponse) return caller;

  let body: {
    sellerPhone?: string;
    items?: ManualOrderItemInput[];
    customerId?: string;
    customerDeliveryState?: string;
    razorpayPaymentId?: string;
    /** 1–N payments backing this order; their combined amount must equal the total.
     *  Takes precedence over the single razorpayPaymentId. */
    razorpayPaymentIds?: string[];
    /** Admin delivery override (₹). Omit/null to use the calculated charge. */
    deliveryCharge?: number | null;
    /** Preview the admin-override path (payment trusted without Razorpay/ledger). */
    allowUnverifiedOverride?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const sellerPhone = String(body.sellerPhone ?? '').trim();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!sellerPhone) return NextResponse.json({ error: 'A retailer is required.' }, { status: 400 });
  if (items.length === 0) return NextResponse.json({ error: 'At least one product is required.' }, { status: 400 });

  try {
    const deliveryOverride =
      body.deliveryCharge != null && Number.isFinite(body.deliveryCharge) ? Number(body.deliveryCharge) : null;
    const pricing = await priceManualOrder(sellerPhone, items, body.customerDeliveryState ?? null, deliveryOverride);

    // Normalize the selected payment id(s). The array is preferred; the scalar is a
    // single-payment alias kept for older callers.
    const paymentIds = Array.from(
      new Set(
        (body.razorpayPaymentIds?.length
          ? body.razorpayPaymentIds
          : body.razorpayPaymentId
          ? [body.razorpayPaymentId]
          : []
        )
          .map((s) => String(s ?? '').trim())
          .filter(Boolean),
      ),
    );

    // `verification` (single) is retained for back-compat with the admin-override
    // preview; `multiVerification` is the combined 1–N result the wizard reads.
    let verification = null;
    let multiVerification = null;
    if (paymentIds.length === 1 && body.allowUnverifiedOverride) {
      verification = await verifyPaymentForManualOrder({
        razorpayPaymentId: paymentIds[0],
        customerId: body.customerId ?? null,
        expectedTotalRupees: pricing.grandTotal,
        allowUnverifiedOverride: true,
      });
    } else if (paymentIds.length > 0) {
      multiVerification = await verifyManualOrderPayments({
        razorpayPaymentIds: paymentIds,
        customerId: body.customerId ?? null,
        expectedTotalRupees: pricing.grandTotal,
      });
    }

    return NextResponse.json({ pricing, verification, multiVerification });
  } catch (e) {
    console.error('[manual-order/review] failed:', e);
    return NextResponse.json({ error: 'Could not price the order.' }, { status: 500 });
  }
}
