import { NextRequest, NextResponse } from 'next/server';
import { requireSeller } from '../../../lib/seller-auth';
import { createManualOrder, type CreateManualOrderResult, type ManualOrderItemInput } from '../../../lib/manual-order';
import { createPaymentLinkOrder, type CreatePaymentLinkResult } from '../../../lib/manual-order-link';

// This codebase casts the failure variant rather than relying on discriminated-
// union narrowing (same convention as app/api/admin/manual-order/route.ts).
type LinkFailure = Extract<CreatePaymentLinkResult, { ok: false }>;
type OrderFailure = Extract<CreateManualOrderResult, { ok: false }>;

/**
 * POST /api/seller/manual-order
 *
 * Create a manual order as the AUTHENTICATED retailer. sellerPhone is always the
 * caller's own phone (requireSeller) — never from the body — so a retailer can never
 * place an order under another seller.
 *
 * Two payment paths (mutually exclusive):
 *   A) payment.mode 'link'    → create the order IMMEDIATELY (status 'accepted',
 *      payment 'pending', awaitingPayment) and generate a Razorpay Payment Link; the
 *      payment_link.paid webhook reconciles it to paid. Reuses createPaymentLinkOrder.
 *   B) payment.mode 'offline' → the retailer collected the money directly
 *      (cash/UPI/other). Reuses the shared createManualOrder offline path → a real
 *      order placed + paid immediately.
 *
 * Body: {
 *   customer: { id, name, phone, email?, address?, deliveryState? },
 *   items: { productId, copyId?, qty, variantUnit? }[],
 *   payment: { mode:'offline', method, idempotencyKey }
 *          | { mode:'link', idempotencyKey, customerEmail? },
 * }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: {
    shopPhone?: string;
    customer?: {
      id?: string;
      name?: string;
      phone?: string;
      email?: string | null;
      address?: unknown;
      deliveryState?: string | null;
    };
    items?: ManualOrderItemInput[];
    payment?: {
      mode?: string;
      method?: string;
      idempotencyKey?: string;
      customerEmail?: string | null;
    };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const caller = await requireSeller(req, body.shopPhone);
  if (caller instanceof NextResponse) return caller;

  const customer = body.customer;
  const items = Array.isArray(body.items) ? body.items : [];
  const payment = body.payment ?? {};
  const mode = String(payment.mode ?? '').trim();
  const idempotencyKey = String(payment.idempotencyKey ?? '').trim();

  if (!customer?.id) return NextResponse.json({ error: 'A customer is required.' }, { status: 400 });
  if (items.length === 0) return NextResponse.json({ error: 'At least one product is required.' }, { status: 400 });
  if (!idempotencyKey) return NextResponse.json({ error: 'An idempotency key is required.' }, { status: 400 });

  const customerInput = {
    id: String(customer.id),
    name: String(customer.name ?? '').trim(),
    phone: String(customer.phone ?? '').trim(),
    email: customer.email ?? null,
    address: customer.address ?? null,
    deliveryState: customer.deliveryState ?? null,
  };

  try {
    // ── A) Payment link — create the order NOW (accepted/pending) + a link ───
    if (mode === 'link') {
      const result = await createPaymentLinkOrder({
        sellerPhone: caller.phone,
        customer: customerInput,
        items,
        idempotencyKey,
      });
      if (result.ok) return NextResponse.json({ mode: 'link', ...result });
      const fail = result as LinkFailure;
      return NextResponse.json({ error: fail.error }, { status: fail.status });
    }

    // ── B) Offline — real order placed + paid now ────────────────────────────
    if (mode === 'offline') {
      const method = String(payment.method ?? '').trim();
      if (!['cash', 'upi', 'other'].includes(method)) {
        return NextResponse.json({ error: 'Invalid offline payment method.' }, { status: 400 });
      }
      const result = await createManualOrder({
        adminUid: caller.uid, // audit uid — the retailer who created it
        sellerPhone: caller.phone,
        offline: { method: method as 'cash' | 'upi' | 'other', idempotencyKey },
        customer: customerInput,
        items,
      });
      if (result.ok) return NextResponse.json({ mode: 'offline', ...result });
      const fail = result as OrderFailure;
      return NextResponse.json({ error: fail.error }, { status: fail.status });
    }

    return NextResponse.json({ error: 'Unknown payment mode.' }, { status: 400 });
  } catch (e) {
    console.error('[seller/manual-order] create failed:', e);
    return NextResponse.json({ error: 'Order creation failed unexpectedly.' }, { status: 500 });
  }
}
