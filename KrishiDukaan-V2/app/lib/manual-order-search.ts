/**
 * Shared server-side lookups for the "Create order manually" wizards (admin AND
 * retailer). Extracted from app/api/admin/manual-order/search/route.ts so both the
 * admin route and the retailer route (app/api/seller/manual-order/search) run the
 * exact same customer/product resolution and can never drift.
 *
 * Everything here runs through the Admin SDK (the server trust boundary) — the
 * caller's authorization is enforced by the route, and the retailer route pins the
 * product search to the authenticated seller's own phone.
 */
import { getAdminDb } from './firebase-admin';

const SCAN_LIMIT = 500; // bounded per request; low-frequency admin/seller tool
const RESULT_LIMIT = 30;

/** Normalize an Indian phone to the +91XXXXXXXXXX the user/seller docs are keyed by. */
export function phoneVariants(raw: string): string[] {
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  const out = new Set<string>();
  if (ten.length === 10) {
    out.add(`+91${ten}`);
    out.add(`91${ten}`);
    out.add(ten);
  }
  out.add(raw.trim());
  return Array.from(out).filter(Boolean);
}

export const looksLikePhone = (q: string) => /\d{4,}/.test(q.replace(/\D/g, ''));

const capitalizeFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const titleCase = (s: string) => s.split(/\s+/).map(capitalizeFirst).join(' ');

export type CustomerResult = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  addressArea: string | null;
  addressCity: string | null;
  addressDistrict: string | null;
  addressState: string | null;
  addressPincode: string | null;
};

export type ProductResult = {
  copyId: string;
  productId: string;
  name: string;
  price: number;
  image: string | null;
  variants: { unit: string; price: number }[];
  gstApplicable: boolean;
  gstRate: number;
};

/**
 * Customers by name / phone / email. A "customer" has no dedicated role value —
 * it's a users doc with no role (OTP buyers) OR role 'customer'/'consumer', so we
 * must NOT filter by role in the query; we identify customers in memory instead.
 */
export async function searchCustomers(q: string): Promise<CustomerResult[]> {
  const db = getAdminDb();
  const qLower = q.toLowerCase();
  const results = new Map<string, CustomerResult>();
  const isCustomer = (d: FirebaseFirestore.DocumentData) => {
    const role = String(d.role ?? '');
    return role === '' || role === 'customer' || role === 'consumer';
  };

  // 1) Exact phone resolution — reliable for a known buyer, role-agnostic.
  if (looksLikePhone(q)) {
    const reads = phoneVariants(q).flatMap((variant) => [
      db.collection('users').doc(variant).get(),
      db.collection('uidIndex').doc(variant).get(),
    ]);
    const snaps = await Promise.all(reads);
    for (let i = 0; i < snaps.length; i++) {
      const snap = snaps[i];
      if (!snap.exists) continue;
      if (i % 2 === 0) {
        results.set(snap.id, mapCustomer(snap.id, snap.data()!)); // users/{phone}
      } else {
        const p = String(snap.data()?.phone ?? '').trim(); // uidIndex → phone
        if (p) {
          const uSnap = await db.collection('users').doc(p).get();
          if (uSnap.exists) results.set(uSnap.id, mapCustomer(uSnap.id, uSnap.data()!));
        }
      }
    }
  }

  // 1b) Phone PREFIX search. The newest-users scan (step 3) only covers recent
  //     customers, so a partial number like "9876" would miss an older buyer. A
  //     range query on the indexed `phone` field finds them at any age. Stored
  //     phones are "+91XXXXXXXXXX"; the user usually types the local number, but
  //     may include the "91" country code, so both prefixes are tried.
  {
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 2) {
      const prefixes = new Set<string>([`+91${digits}`]);
      if (digits.startsWith('91') && digits.length > 2) prefixes.add(`+${digits}`);
      const reads = Array.from(prefixes).map((pre) =>
        db
          .collection('users')
          .orderBy('phone')
          .startAt(pre)
          .endAt(pre + '')
          .limit(RESULT_LIMIT)
          .get()
          .catch(() => null),
      );
      for (const snap of await Promise.all(reads)) {
        if (!snap) continue;
        for (const d of snap.docs) {
          if (isCustomer(d.data())) results.set(d.id, mapCustomer(d.id, d.data()));
        }
      }
    }
  }

  // 2) Name prefix via the indexed `name` field (case-sensitive — try casings).
  if (!looksLikePhone(q) && q.length >= 2) {
    const casings = Array.from(new Set([q, q.toLowerCase(), titleCase(q), capitalizeFirst(q)]));
    const prefixReads = casings.map((c) =>
      db.collection('users').orderBy('name').startAt(c).endAt(c + '').limit(RESULT_LIMIT).get().catch(() => null),
    );
    for (const snap of await Promise.all(prefixReads)) {
      if (!snap) continue;
      for (const d of snap.docs) {
        if (isCustomer(d.data())) results.set(d.id, mapCustomer(d.id, d.data()));
      }
    }
  }

  // 3) Newest-users scan, filtered in memory — strong fallback for name/email/city.
  const scan = await db.collection('users').orderBy('createdAt', 'desc').limit(SCAN_LIMIT).get().catch(() => null);
  if (scan) {
    for (const d of scan.docs) {
      if (results.size >= RESULT_LIMIT * 4) break;
      const data = d.data();
      if (!isCustomer(data)) continue;
      const hay = [data.name, data.phone, data.email, d.id, data.city, data.state]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!qLower || hay.includes(qLower)) results.set(d.id, mapCustomer(d.id, data));
    }
  }

  return Array.from(results.values()).slice(0, RESULT_LIMIT);
}

/**
 * A seller's OWN catalogue copies (products keyed by the seller's phone, across
 * phone formats and the retailerPhone/ownerPhone/storePhone fields). Each row
 * carries the canonical productId used on the order item AND the copy doc id used
 * to price it exactly.
 */
export async function searchSellerProducts(sellerPhone: string, q: string): Promise<ProductResult[]> {
  const db = getAdminDb();
  const qLower = q.toLowerCase();
  const phones = phoneVariants(sellerPhone);
  const queries: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
  for (const phone of phones) {
    for (const field of ['retailerPhone', 'ownerPhone', 'storePhone']) {
      queries.push(db.collection('products').where(field, '==', phone).limit(SCAN_LIMIT).get());
    }
  }
  const snaps = await Promise.all(queries);
  const byId = new Map<string, ProductResult>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      if (!byId.has(d.id)) byId.set(d.id, mapProduct(d.id, d.data()));
    }
  }
  return Array.from(byId.values())
    .filter((p) => !qLower || p.name.toLowerCase().includes(qLower))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, RESULT_LIMIT * 3);
}

export function mapCustomer(id: string, d: FirebaseFirestore.DocumentData): CustomerResult {
  const s = (v: unknown) => (v ? String(v) : null);
  return {
    id,
    name: String(d.name ?? d.businessName ?? d.ownerName ?? '').trim() || '(no name)',
    phone: String(d.phone ?? id).trim(),
    email: d.email ? String(d.email) : null,
    city: d.city ? String(d.city) : null,
    state: d.state ? String(d.state) : null,
    address: d.address ? String(d.address) : null,
    // Structured delivery address — the checkout-written fields the order's
    // customerAddress string is composed from, and what the wizard edits/saves.
    addressArea: s(d.addressArea),
    addressCity: s(d.addressCity),
    addressDistrict: s(d.addressDistrict),
    addressState: s(d.addressState),
    addressPincode: s(d.addressPincode),
  };
}

export function mapProduct(copyId: string, d: FirebaseFirestore.DocumentData): ProductResult {
  // The id written onto the order item (what the stock-decrement trigger and the
  // rest of the app key off) is the canonical product id when this copy points at
  // one, else the copy's own doc id.
  const productId = String(d.manufacturerProductId ?? d.originalProductId ?? copyId);
  const variants = Array.isArray(d.variants)
    ? (d.variants as Record<string, unknown>[]).map((v) => ({
        unit: String(v.unit ?? ''),
        price: Number(v.price ?? 0),
      }))
    : [];
  return {
    copyId,
    productId,
    name: String(d.name ?? d.productName ?? '').trim() || productId,
    price: Number(d.price ?? d.sellingPrice ?? 0),
    image: d.image ? String(d.image) : d.imageUrl ? String(d.imageUrl) : null,
    variants,
    gstApplicable: d.gstApplicable === true,
    gstRate: Number(d.gstRate ?? 0),
  };
}
