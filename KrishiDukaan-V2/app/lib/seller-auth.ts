/**
 * Seller-facing route authorization for the retailer manual-order endpoints.
 *
 * Determines WHICH seller the request acts for, and proves the caller is allowed to
 * act for that seller — the result's `phone`/`seller` is the ONLY source of
 * sellerPhone downstream, never the raw request body, so a retailer cannot create or
 * price an order under another seller by editing the frontend payload.
 *
 * The retailer dashboard is used in three legitimate contexts, all supported here:
 *   1. The shop OWNER, logged in with their own phone (the common case).
 *   2. A platform ADMIN "viewing" a shop (super-admin impersonation) — they log in
 *      with email/password, so their token carries no seller phone of its own.
 *   3. A shop STAFF/helper managing the owner's shop with the `orders` permission.
 * For (2) and (3) the dashboard already knows which shop is in context and sends its
 * phone as `requestedShopPhone`; we AUTHORIZE that the caller may act for it (admin,
 * or staff-with-orders, or it is their own shop). A plain retailer with no admin/
 * staff standing can only ever act as their own seller account.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from './firebase-admin';
import { phoneForUid, resolveSellerAccount, type SellerAccount } from './route-server';
import { isStaffOf } from './shop-team-server';

export type SellerCaller = { uid: string; phone: string; seller: SellerAccount };

/** +91XXXXXXXXXX / 91XXXXXXXXXX / 10-digit variants of a phone, for seller-doc keys. */
function phoneCandidates(raw: string | null | undefined): string[] {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  const digits = s.replace(/\D/g, '');
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  const out = new Set<string>([s]);
  if (ten.length === 10) {
    out.add(`+91${ten}`);
    out.add(`91${ten}`);
    out.add(ten);
  }
  return Array.from(out);
}

/** The last-10-digit key, so two phone strings in different formats compare equal. */
function tenKey(phone: string): string {
  const d = String(phone ?? '').replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
}

/** First seller account that resolves across a phone's format variants. */
async function resolveSellerFromVariants(raw: string | null | undefined): Promise<SellerAccount | null> {
  for (const p of phoneCandidates(raw)) {
    const seller = await resolveSellerAccount(p);
    if (seller) return seller;
  }
  return null;
}

/** Whether the verified caller is a platform admin (same check as the order routes). */
async function callerIsAdmin(uid: string, callerPhones: string[]): Promise<boolean> {
  const db = getAdminDb();
  const byUid = await db.collection('users').doc(uid).get();
  if (byUid.exists && byUid.data()?.role === 'admin') return true;
  for (const p of callerPhones) {
    const snap = await db.collection('users').doc(p).get();
    if (snap.exists && snap.data()?.role === 'admin') return true;
  }
  return false;
}

/**
 * Returns the authorized seller, or a NextResponse error (401 unauthenticated, 403
 * not permitted). Callers do: `const c = await requireSeller(req, shop); if (c
 * instanceof NextResponse) return c;` then use `c.phone` / `c.seller`.
 *
 * @param requestedShopPhone the shop the dashboard is acting for (owner/admin-view/
 *   staff context). Omit/null → the caller's own seller account.
 */
export async function requireSeller(
  req: NextRequest,
  requestedShopPhone?: string | null,
): Promise<SellerCaller | NextResponse> {
  const header = req.headers.get('Authorization') ?? '';
  const idToken = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: 'Missing authorization token.' }, { status: 401 });
  }

  let uid: string;
  let tokenPhone: string | undefined;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    uid = decoded.uid;
    tokenPhone = decoded.phone_number; // present on phone-OTP tokens
  } catch {
    return NextResponse.json({ error: 'Invalid authorization token.' }, { status: 401 });
  }

  // The caller's own phone(s): the uid→phone mapping AND the token's phone_number
  // claim, each across +91/10-digit variants. These are VERIFIED (from the token /
  // server-side lookup), so matching one against a requested shop proves ownership.
  const resolvedPhone = await phoneForUid(uid);
  const callerPhones = Array.from(
    new Set([...phoneCandidates(resolvedPhone), ...phoneCandidates(tokenPhone)]),
  );
  const callerTenKeys = new Set(callerPhones.map(tenKey).filter(Boolean));

  const requested = String(requestedShopPhone ?? '').trim();

  // ── A specific shop was requested (owner / admin-view / staff context) ────────
  if (requested) {
    const target = await resolveSellerFromVariants(requested);
    if (!target) {
      return NextResponse.json({ error: 'That shop is not a retailer/manufacturer account.' }, { status: 403 });
    }
    // 1) The caller IS the shop owner — their verified phone matches the shop. This
    //    does not depend on resolveSellerAccount(callerPhone) resolving on its own.
    if (callerTenKeys.has(tenKey(target.phone))) {
      return { uid, phone: target.phone, seller: target };
    }
    // 2) A platform admin may act for any shop (super-admin "view business").
    if (await callerIsAdmin(uid, callerPhones)) {
      return { uid, phone: target.phone, seller: target };
    }
    // 3) A staff/helper with the `orders` permission may act for the owner's shop.
    for (const cp of callerPhones) {
      if (await isStaffOf(cp, target.phone, 'orders')) {
        return { uid, phone: target.phone, seller: target };
      }
    }
    return NextResponse.json(
      { error: 'You are not allowed to create orders for this shop.' },
      { status: 403 },
    );
  }

  // ── No specific shop requested → the caller acts as their own seller account ──
  for (const p of callerPhones) {
    const seller = await resolveSellerAccount(p);
    if (seller) return { uid, phone: seller.phone, seller };
  }
  return NextResponse.json(
    { error: 'This action is only available to retailer/manufacturer accounts.' },
    { status: 403 },
  );
}
