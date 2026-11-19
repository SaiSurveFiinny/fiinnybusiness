import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../lib/admin-auth';
import { createManualOrder, type CreateManualOrderResult, type ManualOrderItemInput } from '../../../lib/manual-order';

type CreateFailure = Extract<CreateManualOrderResult, { ok: false }>;

/**
 * POST /api/admin/manual-order
 *
 * Create an order for a customer whose Razorpay payment succeeded but whose order
 * was never written. Full admin only (not a section grant): this both moves
 * inventory and sends customer/seller WhatsApp, so it sits behind the stricter
 * bar, same as the refund and user-admin routes.
 *
 * Everything authoritative happens in createManualOrder (lib/manual-order.ts):
 * the order is re-priced server-side, the payment re-verified against Razorpay
 * (captured, right amount, right customer, not already used, not a subscription),
 * then written ONCE under a deterministic id so the existing order triggers run
 * inventory + both WhatsApp exactly once, and the invoice is generated. A retry
 * returns the existing order rather than creating a second one.
 *
 * Body: {
 *   sellerPhone: string,
 *   razorpayPaymentId: string,
 *   customer: { id, name, phone, email?, address?, deliveryState? },
 *   items: { productId, copyId?, qty, variantUnit? }[],
 * }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const caller = await requireAdmin(req);
  if (caller instanceof NextResponse) return caller;

  let body: {
    sellerPhone?: string;
    razorpayPaymentId?: string;
    razorpayPaymentIds?: string[];
    offline?: { method?: string; idempotencyKey?: string };
    customer?: {
      id?: string;
      name?: string;
      phone?: string;
      email?: string | null;
      address?: unknown;
      deliveryState?: string | null;
    };
    items?: ManualOrderItemInput[];
    deliveryCharge?: number | null;
    allowUnverifiedOverride?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const sellerPhone = String(body.sellerPhone ?? '').trim();
  // Accept either the array (1–N payments) or the single scalar (back-compat).
  const razorpayPaymentIds = Array.from(
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
  const customer = body.customer;
  const items = Array.isArray(body.items) ? body.items : [];

  // Offline (retailer-collected) payment path — mutually exclusive with Razorpay.
  const offlineMethod = String(body.offline?.method ?? '').trim();
  const offlineKey = String(body.offline?.idempotencyKey ?? '').trim();
  const isOffline = !!body.offline && !!offlineMethod;

  if (!sellerPhone) return NextResponse.json({ error: 'A retailer is required.' }, { status: 400 });
  if (!customer?.id) return NextResponse.json({ error: 'A customer is required.' }, { status: 400 });
  if (items.length === 0) return NextResponse.json({ error: 'At least one product is required.' }, { status: 400 });
  if (!isOffline && razorpayPaymentIds.length === 0) {
    return NextResponse.json({ error: 'A payment is required.' }, { status: 400 });
  }
  if (isOffline && !['cash', 'upi', 'other'].includes(offlineMethod)) {
    return NextResponse.json({ error: 'Invalid offline payment method.' }, { status: 400 });
  }
  if (isOffline && !offlineKey) {
    return NextResponse.json({ error: 'An idempotency key is required for an offline payment.' }, { status: 400 });
  }

  const deliveryOverride =
    body.deliveryCharge != null && Number.isFinite(body.deliveryCharge) ? Number(body.deliveryCharge) : null;

  try {
    const result = await createManualOrder({
      adminUid: caller.uid,
      sellerPhone,
      ...(isOffline
        ? { offline: { method: offlineMethod as 'cash' | 'upi' | 'other', idempotencyKey: offlineKey } }
        : { razorpayPaymentIds, allowUnverifiedOverride: body.allowUnverifiedOverride === true }),
      deliveryOverride,
      customer: {
        id: String(customer.id),
        name: String(customer.name ?? '').trim(),
        phone: String(customer.phone ?? '').trim(),
        email: customer.email ?? null,
        address: customer.address ?? null,
        deliveryState: customer.deliveryState ?? null,
      },
      items,
    });

    if (result.ok) {
      return NextResponse.json(result);
    }

    const fail = result as CreateFailure;
    return NextResponse.json(
      { error: fail.error, verification: fail.verification ?? null },
      { status: fail.status },
    );
  } catch (e) {
    console.error('[manual-order] create failed:', e);
    return NextResponse.json({ error: 'Order creation failed unexpectedly.' }, { status: 500 });
  }
}
