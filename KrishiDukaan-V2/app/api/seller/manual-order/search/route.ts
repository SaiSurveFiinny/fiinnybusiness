import { NextRequest, NextResponse } from 'next/server';
import { requireSeller } from '../../../../lib/seller-auth';
import { searchCustomers, searchSellerProducts } from '../../../../lib/manual-order-search';

/**
 * GET /api/seller/manual-order/search?type=customer|product&q=
 *
 * Retailer-facing lookups for the dashboard "Create order manually" wizard. Guarded
 * by requireSeller (any valid retailer/manufacturer). There is no `retailer` type —
 * the seller is always the authenticated caller — and the product search is PINNED
 * to the caller's own phone, so a retailer can only ever browse their own catalogue.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const caller = await requireSeller(req, searchParams.get('shop'));
  if (caller instanceof NextResponse) return caller;

  const type = searchParams.get('type') ?? '';
  const q = (searchParams.get('q') ?? '').trim();

  try {
    if (type === 'customer') {
      return NextResponse.json({ results: await searchCustomers(q) });
    }
    if (type === 'product') {
      // Forced to the authenticated seller's phone — any client value is ignored.
      return NextResponse.json({ results: await searchSellerProducts(caller.phone, q) });
    }
    return NextResponse.json({ error: 'Unknown search type.' }, { status: 400 });
  } catch (e) {
    console.error('[seller/manual-order/search] failed:', e);
    return NextResponse.json({ error: 'Search failed.' }, { status: 500 });
  }
}
