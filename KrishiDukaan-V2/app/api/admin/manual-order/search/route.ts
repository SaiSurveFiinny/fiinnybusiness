import { NextRequest, NextResponse } from 'next/server';
import { requireSection } from '../../../../lib/admin-auth';
import { getAdminDb } from '../../../../lib/firebase-admin';
import {
  searchCustomers,
  searchSellerProducts,
  phoneVariants,
  looksLikePhone,
} from '../../../../lib/manual-order-search';

/**
 * GET /api/admin/manual-order/search?type=customer|retailer|product&q=&retailerPhone=
 *
 * Read-only lookups that feed the "Create order manually" wizard. Admin / team
 * with the `orders` section only. Customer + product resolution is shared with the
 * retailer wizard via app/lib/manual-order-search.ts; only the retailer (seller)
 * picker — which is admin-only (a retailer never selects another seller) — lives
 * here.
 *
 *  - customer : users with role "customer" (or no role), by name / phone / email.
 *  - retailer : the fulfilling seller, by name / phone / city. Covers every kind
 *               of seller resolveSellerAccount() accepts — retailers/ AND
 *               manufacturers/ docs, plus users with role retailer/manufacturer.
 *  - product  : the retailer's OWN catalogue copies.
 */

const SCAN_LIMIT = 500;
const RESULT_LIMIT = 30;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const caller = await requireSection(req, 'orders');
  if (caller instanceof NextResponse) return caller;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? '';
  const q = (searchParams.get('q') ?? '').trim();
  const qLower = q.toLowerCase();
  const retailerPhone = (searchParams.get('retailerPhone') ?? '').trim();
  const db = getAdminDb();

  try {
    if (type === 'customer') {
      return NextResponse.json({ results: await searchCustomers(q) });
    }

    if (type === 'retailer') {
      // Dedupe by phone across collections — a seller can have BOTH a
      // retailers/{phone} and a manufacturers/{phone} doc (same business).
      const results = new Map<string, Record<string, unknown>>();
      const keyOf = (id: string, d: FirebaseFirestore.DocumentData) => {
        const digits = String(d.phone ?? id).replace(/\D/g, '');
        return digits.length >= 10 ? digits.slice(-10) : id;
      };
      const add = (id: string, d: FirebaseFirestore.DocumentData) => {
        const k = keyOf(id, d);
        if (!results.has(k)) results.set(k, mapRetailer(id, d));
      };

      if (looksLikePhone(q)) {
        const reads = phoneVariants(q).flatMap((variant) => [
          db.collection('retailers').doc(variant).get(),
          db.collection('manufacturers').doc(variant).get(),
        ]);
        for (const snap of await Promise.all(reads)) {
          if (snap.exists) add(snap.id, snap.data()!);
        }
      }

      const [retailSnap, mfrSnap, userRetSnap, userMfrSnap] = await Promise.all([
        db.collection('retailers').limit(SCAN_LIMIT).get(),
        db.collection('manufacturers').limit(SCAN_LIMIT).get(),
        db.collection('users').where('role', '==', 'retailer').limit(SCAN_LIMIT).get(),
        db.collection('users').where('role', '==', 'manufacturer').limit(SCAN_LIMIT).get(),
      ]);
      for (const d of [...retailSnap.docs, ...mfrSnap.docs, ...userRetSnap.docs, ...userMfrSnap.docs]) {
        if (results.size >= RESULT_LIMIT * 4) break;
        const data = d.data();
        if (results.has(keyOf(d.id, data))) continue;
        const hay = [data.shopName, data.businessName, data.name, data.ownerName, d.id, data.phone, data.city, data.state]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!qLower || hay.includes(qLower)) add(d.id, data);
      }

      return NextResponse.json({ results: Array.from(results.values()).slice(0, RESULT_LIMIT) });
    }

    if (type === 'product') {
      if (!retailerPhone) {
        return NextResponse.json({ error: 'retailerPhone is required for product search.' }, { status: 400 });
      }
      return NextResponse.json({ results: await searchSellerProducts(retailerPhone, q) });
    }

    return NextResponse.json({ error: 'Unknown search type.' }, { status: 400 });
  } catch (e) {
    console.error('[manual-order/search] failed:', e);
    return NextResponse.json({ error: 'Search failed.' }, { status: 500 });
  }
}

/** Flatten a seller address (either a {line1,city,state,pincode} object or a
 *  plain string) into a single display line. */
function retailerAddressLine(d: FirebaseFirestore.DocumentData): string | null {
  const a = d.address;
  if (!a) {
    const parts = [d.city, d.state, d.pincode].filter(Boolean).map(String);
    return parts.length ? parts.join(', ') : null;
  }
  if (typeof a === 'string') return a.trim() || null;
  if (typeof a === 'object') {
    const o = a as Record<string, unknown>;
    const parts = [o.line1, o.area, o.city, o.district, o.state, o.pincode].filter(Boolean).map(String);
    return parts.length ? parts.join(', ') : null;
  }
  return null;
}

function mapRetailer(id: string, d: FirebaseFirestore.DocumentData): Record<string, unknown> {
  return {
    id,
    phone: String(d.phone ?? id).trim(),
    shopName: String(d.shopName ?? d.businessName ?? d.name ?? d.ownerName ?? '').trim() || id,
    city: d.city ? String(d.city) : null,
    state: d.state ? String(d.state) : null,
    gstin: d.gstin ?? d.gstNumber ?? null,
    address: retailerAddressLine(d),
  };
}
