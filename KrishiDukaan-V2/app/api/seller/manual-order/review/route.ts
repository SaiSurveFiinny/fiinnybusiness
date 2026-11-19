import { NextRequest, NextResponse } from 'next/server';
import { requireSeller } from '../../../../lib/seller-auth';
import { priceManualOrder, type ManualOrderItemInput } from '../../../../lib/manual-order';

/**
 * POST /api/seller/manual-order/review
 *
 * Re-prices the selected products server-side through the authoritative pricing
 * helpers (priceManualOrder) for the AUTHENTICATED retailer — the client never
 * supplies the seller. Delivery is rules-based only (no override on the retailer
 * flow). Returns `{ pricing }`.
 *
 * Body: { items: { productId, copyId?, qty, variantUnit? }[], customerDeliveryState? }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { items?: ManualOrderItemInput[]; customerDeliveryState?: string; shopPhone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const caller = await requireSeller(req, body.shopPhone);
  if (caller instanceof NextResponse) return caller;

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: 'At least one product is required.' }, { status: 400 });
  }

  try {
    const pricing = await priceManualOrder(caller.phone, items, body.customerDeliveryState ?? null, null);
    return NextResponse.json({ pricing });
  } catch (e) {
    console.error('[seller/manual-order/review] failed:', e);
    return NextResponse.json({ error: 'Could not price the order.' }, { status: 500 });
  }
}
