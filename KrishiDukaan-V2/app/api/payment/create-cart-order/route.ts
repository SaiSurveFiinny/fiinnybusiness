import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { getAdminDb, getAdminAuth } from '../../../lib/firebase-admin';
import { recordAttempt, type AttemptItem } from '../../../lib/payment-attempts';
import { allocateShares, assertTransfersFit, computeSellerSplit, type SellerSplit } from '../../../lib/route-split';
import { loadRouteConfig, resolveSellerAccount } from '../../../lib/route-server';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

type CartItemInput = {
  productId:    string;
  sellerId:     string;
  sellerPhone?: string;
  qty:          number;
};

/**
 * Returns the active discount percentage from inventory fields (0–99), or 0.
 * Mirrors the client-side getActiveDiscountPct() logic.
 */
function serverActiveDiscountPct(data: FirebaseFirestore.DocumentData): number {
  if (!data.discountEnabled || !data.discountPct || data.discountPct <= 0) return 0;
  const now   = Date.now();
  const start = (data.discountStartDate as { toMillis?(): number } | null)?.toMillis?.() ?? 0;
  const end   = (data.discountEndDate   as { toMillis?(): number } | null)?.toMillis?.() ?? Infinity;
  if (now < start || now > end) return 0;
  return Number(data.discountPct);
}

/**
 * POST /api/payment/create-cart-order
 *
 * Verifies item prices server-side (Firestore Admin), adds the client-supplied
 * delivery charge, then creates a Razorpay order with the final amount.
 *
 * Body:
 *   items[]          – cart items (productId, sellerId, sellerPhone?, qty)
 *   userId           – Firebase Auth UID of the buyer
 *   clientSubtotal   – product subtotal computed client-side
 *   clientDelivery   – delivery charge computed client-side
 *   clientGrandTotal – clientSubtotal + clientDelivery
 *   note?            – human-readable label for the Razorpay order
 */
export async function POST(request: Request) {
  try {
    // Verify Firebase ID token from Authorization header
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }
    let callerUid: string;
    try {
      callerUid = (await getAdminAuth().verifyIdToken(idToken)).uid;
    } catch {
      return NextResponse.json({ error: 'Invalid authorization token' }, { status: 401 });
    }

    const body = await request.json();
    const {
      items,
      userId,
      clientSubtotal,
      clientDelivery,
      clientGrandTotal,
      note,
      customerName,
      customerPhone,
      customerAddress,
      deliveryBySeller,
    } = body as {
      items:             CartItemInput[];
      userId:            string;
      clientSubtotal?:   number;
      clientDelivery?:   number;
      clientGrandTotal?: number;
      note?:             string;
      // Captured before payment so a payment.captured webhook can rebuild the
      // order server-side if the client never gets to write it. Optional:
      // an older app build that doesn't send them still checks out fine.
      customerName?:     string;
      customerPhone?:    string;
      customerAddress?:  unknown;
      deliveryBySeller?: Record<string, number>;
    };

    console.log('[create-cart-order] received:', {
      itemCount: items?.length,
      clientSubtotal,
      clientDelivery,
      clientGrandTotal,
      userId,
    });

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 });
    }

    // ── Server-side price verification ────────────────────────────────────────
    const db = getAdminDb();
    let serverSubtotal = 0;
    // Built as prices are resolved so the attempt record shows exactly which
    // products, at which price, a failed payment was for.
    const pricedItems: AttemptItem[] = [];
    // Per-seller subtotals, keyed the same way orders are: phone first, falling
    // back to the id. Route pays a linked account, so an ambiguous seller key
    // here is not a mismatched dashboard query - it is money to the wrong shop.
    const subtotalBySeller = new Map<string, number>();

    for (const item of items) {
      const qty = Math.max(1, Math.floor(Number(item.qty) || 1));
      // `let`: resolved from the product doc below when the cart item carries
      // no seller at all. That happens when a customer buys a manufacturer's
      // own canonical listing (no retailer copy, empty availability[]) — the
      // app sends sellerPhone: ''. Left unresolved, the order was unroutable
      // (no Route transfer, so the seller was never paid automatically) AND
      // the post-payment order write had nothing to key the order to, so no
      // order was created at all — a real ₹200 payment on 20 Sep 2026.
      let sellerKey = String(item.sellerPhone ?? '').trim() || String(item.sellerId ?? '').trim();

      // Try multiple query strategies to find the inventory doc:
      //   1. ownerId == sellerId (UID-keyed, most common for new accounts)
      //   2. retailerId == sellerId (legacy UID field)
      //   3. ownerPhone == sellerPhone (phone-keyed, when sellerId is a phone)
      //   4. retailerPhone == sellerPhone (legacy phone field)
      const queries: Promise<FirebaseFirestore.QuerySnapshot>[] = [
        db.collection('inventory')
          .where('productId', '==', item.productId)
          .where('ownerId', '==', item.sellerId)
          .limit(1)
          .get(),
        db.collection('inventory')
          .where('productId', '==', item.productId)
          .where('retailerId', '==', item.sellerId)
          .limit(1)
          .get(),
      ];

      if (item.sellerPhone) {
        queries.push(
          db.collection('inventory')
            .where('productId', '==', item.productId)
            .where('ownerPhone', '==', item.sellerPhone)
            .limit(1)
            .get(),
          db.collection('inventory')
            .where('productId', '==', item.productId)
            .where('retailerPhone', '==', item.sellerPhone)
            .limit(1)
            .get(),
        );
      }

      // Fetched in parallel with the pricing queries: it names the product for
      // the attempt record, and the canonical-price fallback below needs it too.
      const [snaps, prodSnap] = await Promise.all([
        Promise.all(queries),
        db.collection('products').doc(item.productId).get(),
      ]);
      const invDoc = snaps.find((s) => !s.empty)?.docs[0] ?? null;
      const prodData = prodSnap.exists ? prodSnap.data()! : null;

      if (!sellerKey && prodData) {
        // Canonical product bought directly: its owner IS the seller.
        sellerKey =
          String(prodData.ownerPhone ?? prodData.manufacturerPhone ?? prodData.retailerPhone ?? '').trim();
        if (!sellerKey && prodData.ownerId) {
          // Legacy UID-keyed owner — map through uidIndex, same as everywhere else.
          const idx = await db.collection('uidIndex').doc(String(prodData.ownerId)).get();
          sellerKey = idx.exists ? String(idx.data()?.phone ?? '').trim() : '';
        }
        if (sellerKey) {
          console.log('[create-cart-order] resolved seller for', item.productId, 'from product doc →', sellerKey);
        }
      }

      let finalPrice: number;
      let priceSource: AttemptItem['priceSource'] = 'none';
      let itemName = '';

      if (invDoc) {
        const d         = invDoc.data();
        const basePrice = Number(d.sellingPrice ?? d.price ?? 0);
        const discPct   = serverActiveDiscountPct(d);
        const discAmt   = Math.round((basePrice * discPct) / 100 * 100) / 100;
        const discFixed = d.discountType === 'fixed_amount' && d.discountEnabled
          ? Math.max(0, Number(d.discountFixedAmt ?? 0))
          : 0;
        finalPrice = Math.round(Math.max(0, basePrice - discAmt - discFixed) * 100) / 100;
        priceSource = 'inventory';
        itemName = String(d.productName ?? d.name ?? '');
        console.log('[create-cart-order] inventory doc found for', item.productId,
          '| base:', basePrice, 'disc:', discPct + '%', 'fixed:', discFixed, 'final:', finalPrice);
      } else {
        // Fallback 1: look up the seller's product copy by manufacturerProductId/originalProductId
        // (this is what mobile sends as productId — the canonical doc ID)
        const sellerCopyQueries: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
        const phoneKey = item.sellerPhone;
        if (phoneKey) {
          sellerCopyQueries.push(
            db.collection('products')
              .where('manufacturerProductId', '==', item.productId)
              .where('retailerPhone', '==', phoneKey)
              .limit(1).get(),
            db.collection('products')
              .where('originalProductId', '==', item.productId)
              .where('retailerPhone', '==', phoneKey)
              .limit(1).get(),
          );
        }
        const copySnaps = sellerCopyQueries.length > 0 ? await Promise.all(sellerCopyQueries) : [];
        const copyDoc = copySnaps.find(s => !s.empty)?.docs[0] ?? null;

        if (copyDoc) {
          const d = copyDoc.data();
          const basePrice = Number(d.price ?? d.sellingPrice ?? 0);
          const discPct   = serverActiveDiscountPct(d);
          const discAmt   = Math.round((basePrice * discPct) / 100 * 100) / 100;
          const discFixed = d.discountType === 'fixed_amount' && d.discountEnabled
            ? Math.max(0, Number(d.discountFixedAmt ?? 0))
            : 0;
          finalPrice = Math.round(Math.max(0, basePrice - discAmt - discFixed) * 100) / 100;
          priceSource = 'seller-copy';
          itemName = String(d.name ?? d.productName ?? '');
          console.log('[create-cart-order] seller copy found for', item.productId,
            '| base:', basePrice, 'disc:', discPct + '%', 'final:', finalPrice);
        } else {
          // Fallback 2: read seller's sellingPrice from canonical product's availability[]
          if (!prodData) {
            console.warn('[create-cart-order] no product doc for', item.productId, '— skipping');
            finalPrice = 0;
            priceSource = 'none';
          } else {
            const availability = Array.isArray(prodData.availability) ? prodData.availability : [];
            const avEntry = phoneKey
              ? availability.find((e: Record<string,unknown>) =>
                  e.storePhone === phoneKey || e.storeId === phoneKey)
              : null;
            if (avEntry && Number(avEntry.sellingPrice) > 0) {
              finalPrice = Number(avEntry.sellingPrice);
              priceSource = 'availability';
              console.log('[create-cart-order] availability[] entry found for', item.productId,
                '| price:', finalPrice);
            } else {
              finalPrice = Number(prodData.price ?? 0);
              priceSource = 'canonical';
              console.log('[create-cart-order] canonical price fallback for', item.productId,
                '| price:', finalPrice);
            }
          }
        }
      }

      const lineTotal = Math.round(finalPrice * qty * 100) / 100;
      serverSubtotal += lineTotal;

      pricedItems.push({
        productId:   item.productId,
        name:        itemName || String(prodData?.name ?? prodData?.productName ?? item.productId),
        qty,
        unitPrice:   finalPrice,
        lineTotal,
        // Whatever was resolved above — so the attempt record (and any order
        // rebuilt from it by the webhook) always names the seller.
        sellerId:    String(item.sellerId ?? '').trim() || sellerKey,
        sellerPhone: String(item.sellerPhone ?? '').trim() || sellerKey || null,
        sellerName:  null,
        priceSource,
      });
      if (sellerKey) {
        subtotalBySeller.set(sellerKey, (subtotalBySeller.get(sellerKey) ?? 0) + lineTotal);
      }
    }

    serverSubtotal = Math.round(serverSubtotal * 100) / 100;

    console.log('[create-cart-order] serverSubtotal:', serverSubtotal,
      '| clientSubtotal:', clientSubtotal,
      '| clientDelivery:', clientDelivery,
      '| clientGrandTotal:', clientGrandTotal);

    // ── Determine the Razorpay amount ─────────────────────────────────────────
    // Prefer the server-computed subtotal (can't be tampered with).
    // Fall back to the client-computed subtotal only if the server lookup returned 0.
    // Always add client-provided delivery charge (trusted: independently verified
    // by the same delivery-settings Firestore doc read during order creation).
    const safeClientSubtotal  = Math.max(0, Number(clientSubtotal)  || 0);
    const safeClientDelivery  = Math.max(0, Number(clientDelivery)  || 0);
    const safeClientGrand     = Math.max(0, Number(clientGrandTotal)|| 0);

    const subtotalForPayment  = serverSubtotal > 0 ? serverSubtotal : safeClientSubtotal;
    let   totalForPayment     = Math.round((subtotalForPayment + safeClientDelivery) * 100) / 100;

    // Last resort: use the client grand total if everything else is still 0
    if (totalForPayment <= 0 && safeClientGrand > 0) {
      totalForPayment = safeClientGrand;
      console.warn('[create-cart-order] falling back to clientGrandTotal:', totalForPayment);
    }

    if (totalForPayment <= 0) {
      console.error('[create-cart-order] total is still 0 after all fallbacks');
      return NextResponse.json(
        { error: 'Order total is zero. Please ensure your items have valid prices.' },
        { status: 400 },
      );
    }

    const amountPaise = Math.round(totalForPayment * 100);
    console.log('[create-cart-order] creating Razorpay order | ₹', totalForPayment,
      '| paise:', amountPaise);

    const { transfers, splitSummary } = await buildRouteTransfers(
      amountPaise,
      subtotalBySeller,
    );

    const order = await razorpay.orders.create({
      amount:   amountPaise,
      currency: 'INR',
      receipt:  `cart_${Date.now()}`,
      notes: {
        userId:          userId   || '',
        note:            note     || 'Cart Order',
        itemCount:       String(items.length),
        serverSubtotal:  String(serverSubtotal),
        deliveryCharge:  String(safeClientDelivery),
        routedSellers:   String(splitSummary.length),
      },
      ...(transfers.length > 0 ? { transfers } : {}),
    });

    // Recorded before the customer sees the checkout sheet, so a lost sale is
    // visible to admin even when the client never reports back — a killed app,
    // a closed tab, or a dismissed sheet all leave this row as 'created'.
    // Awaited but internally non-throwing: it cannot fail the order.
    await recordAttempt({
      razorpayOrderId: order.id,
      kind:            'cart',
      userId:          callerUid,
      amount:          totalForPayment,
      subtotal:        subtotalForPayment,
      deliveryCharge:  safeClientDelivery,
      items:           pricedItems,
      source:          request.headers.get('x-client') === 'mobile' ? 'mobile' : 'web',
      note:            note || 'Cart Order',
      customerName:    typeof customerName === 'string' ? customerName.trim() : undefined,
      customerPhone:   typeof customerPhone === 'string' ? customerPhone.trim() : undefined,
      customerAddress: customerAddress ?? undefined,
      deliveryBySeller:
        deliveryBySeller && typeof deliveryBySeller === 'object' ? deliveryBySeller : undefined,
    });

    return NextResponse.json({
      ...order,
      serverSubtotal,
      deliveryCharge: safeClientDelivery,
      serverTotal:    totalForPayment,
      splitSummary,
      // Return the key used to create this order so the mobile client
      // always opens Razorpay with the matching key (prevents key-mismatch errors).
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('[create-cart-order] unhandled error:', error);
    return NextResponse.json({ error: 'Failed to create payment order' }, { status: 500 });
  }
}

interface SplitSummaryRow {
  sellerKey: string;
  accountId: string;
  grossPaise: number;
  commissionPaise: number;
  gatewayFeePaise: number;
  transferPaise: number;
}

/**
 * Turn per-seller subtotals into Razorpay Route transfers.
 *
 * Two properties this has to guarantee, because Razorpay enforces the first at
 * checkout in front of the customer and nobody enforces the second:
 *
 *  1. Transfers never exceed the order amount.
 *  2. Every paise of the order is accounted for - the seller shares are
 *     allocated by largest remainder rather than independent rounding, so three
 *     sellers on a Rs 100.01 order cannot silently lose a paise between them.
 *
 * Sellers WITHOUT a linked account are skipped, not failed. Onboarding is lazy:
 * a seller is asked to set up payouts when they get their first order, so most
 * orders early on will have no transfer at all and settle exactly as they do
 * today. An unroutable seller must never block a customer's payment.
 */
async function buildRouteTransfers(
  orderAmountPaise: number,
  subtotalBySeller: Map<string, number>,
): Promise<{
  transfers: Array<{ account: string; amount: number; currency: string; on_hold: boolean; notes: Record<string, string> }>;
  splitSummary: SplitSummaryRow[];
}> {
  const empty = { transfers: [], splitSummary: [] };
  if (subtotalBySeller.size === 0 || orderAmountPaise <= 0) return empty;

  try {
    const config = await loadRouteConfig();

    // Allocate the ACTUAL captured amount across sellers in proportion to their
    // subtotals. Deriving each share from the order total rather than summing
    // per-seller figures means delivery charges and any client/server rounding
    // difference are distributed rather than left stranded.
    const shares = allocateShares(orderAmountPaise, Array.from(subtotalBySeller.entries()));
    if (shares.length === 0) return empty;

    const accounts = await Promise.all(
      shares.map(async (sh) => ({ ...sh, seller: await resolveSellerAccount(sh.key) })),
    );

    const transfers: Array<{ account: string; amount: number; currency: string; on_hold: boolean; notes: Record<string, string> }> = [];
    const splitSummary: SplitSummaryRow[] = [];
    const splits: SellerSplit[] = [];

    for (const row of accounts) {
      const accountId = row.seller?.razorpayAccountId;
      if (!accountId || row.paise <= 0) continue;

      let split: SellerSplit;
      try {
        split = computeSellerSplit(row.paise, config);
      } catch (e) {
        // A share too small to survive the deductions is left with the platform
        // rather than sent as an invalid transfer that would fail the payment.
        console.warn('[create-cart-order] skipping transfer for', row.key, String(e));
        continue;
      }

      splits.push(split);
      transfers.push({
        account: accountId,
        amount: split.transferPaise,
        currency: 'INR',
        on_hold: config.holdTransfers,
        notes: { sellerKey: row.key, commissionPaise: String(split.commissionPaise) },
      });
      splitSummary.push({
        sellerKey: row.key,
        accountId,
        grossPaise: split.grossPaise,
        commissionPaise: split.commissionPaise,
        gatewayFeePaise: split.gatewayFeePaise,
        transferPaise: split.transferPaise,
      });
    }

    if (transfers.length === 0) return empty;
    assertTransfersFit(orderAmountPaise, splits);
    return { transfers, splitSummary };
  } catch (e) {
    // Route is an improvement on settlement, not a prerequisite for selling.
    // If anything here fails the order is created without transfers and the
    // money settles the way it does today.
    console.error('[create-cart-order] transfer build failed, creating order unsplit:', e);
    return empty;
  }
}
