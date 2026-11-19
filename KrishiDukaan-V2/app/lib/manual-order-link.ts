/**
 * Retailer "Create order via Payment Link".
 *
 * MODEL
 * -----
 * The order is CREATED AND PERSISTED IMMEDIATELY — it does not wait for payment.
 * The retailer has, by creating it, accepted the order, so it is written with
 * status 'accepted' and payment status 'pending', carrying the generated Razorpay
 * Payment Link. It shows up in the retailer's Orders straight away.
 *
 * AUTHORITATIVE PAYMENT-LINK RECORD
 * ---------------------------------
 * Alongside the order, a `razorpayPaymentLinks/{plinkId}` doc is written at creation
 * and maintained INDEPENDENTLY of the order. This is the reliable map between a
 * Razorpay Payment Link and our data: the webhook keys off the Payment Link ID
 * (always present in the event), updates this record to 'paid' even if the order
 * can't be located, and preserves the verified payment so it can be linked later.
 * It is NOT the unreliable paymentAttempts collection.
 *
 * The `awaitingPayment: true` flag marks the order as created-but-unpaid: order
 * triggers and the invoice sweep skip it, so an unpaid order fires no customer/seller
 * confirmation and generates no invoice. When the Razorpay webhook confirms payment,
 * the order flips payment → 'paid', clears `awaitingPayment` (status stays 'accepted'),
 * generates the invoice and sends the customer confirmation — ONCE.
 *
 * IDEMPOTENCY
 * -----------
 *  - orderId = `man_lnk_<key>` (≤38 chars so it fits Razorpay's 40-char reference_id).
 *    A retry returns the same order + same link, never a second one.
 *  - markPaymentLinkOrderPaid only acts while the order is still pending, and the link
 *    record update is a plain idempotent set — a duplicate/late/out-of-order webhook is
 *    a safe no-op.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from './firebase-admin';
import { razorpayClient } from './route-server';
import { resolveSellerAccount } from './route-server';
import { ensureOrderInvoice, type InvoiceOutcome } from './order-invoice';
import { queueOrderConfirmationCustomer } from './wa-notify';
import { priceManualOrder, type ManualOrderItemInput } from './manual-order';

// The order id doubles as the Razorpay payment-link `reference_id`, which Razorpay
// caps at 40 chars. `man_lnk_` (8) + up to 30 of the sanitized idempotency key = ≤38.
// Hyphens are stripped too (a 36-char UUID → 32 hex) so a raw randomUUID() fits.
const orderIdFor = (idempotencyKey: string) =>
  `man_lnk_${idempotencyKey.replace(/[^a-zA-Z0-9]/g, '').slice(0, 30)}`;

const LINKS = 'razorpayPaymentLinks';

export type PaymentLinkCustomer = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  address?: unknown;
  deliveryState?: string | null;
};

export type CreatePaymentLinkInput = {
  sellerPhone: string;
  customer: PaymentLinkCustomer;
  items: ManualOrderItemInput[];
  /** Client-generated once per attempt so retries reuse the same order + link. */
  idempotencyKey: string;
};

export type CreatePaymentLinkResult =
  | {
      ok: true;
      orderId: string;
      paymentLinkId: string;
      shortUrl: string;
      amount: number;
      status: string;
      paymentStatus: string;
      alreadyExisted: boolean;
    }
  | { ok: false; status: number; error: string };

/** E.164-ish contact for Razorpay (it wants a country code). */
function toContact(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return ten.length === 10 ? `+91${ten}` : phone.trim();
}

/** Create the Razorpay payment link for an order, keyed back to it by reference_id. */
async function createRazorpayLink(params: {
  orderId: string;
  amountRupees: number;
  sellerPhone: string;
  sellerName: string;
  customer: PaymentLinkCustomer;
}): Promise<{ id: string; short_url: string }> {
  return (await razorpayClient.paymentLink.create({
    amount: Math.round(params.amountRupees * 100),
    currency: 'INR',
    accept_partial: false,
    description: `Order from ${params.sellerName}`,
    reference_id: params.orderId,
    customer: {
      name: params.customer.name || 'Customer',
      contact: toContact(params.customer.phone),
      ...(params.customer.email ? { email: String(params.customer.email) } : {}),
    },
    notify: { sms: false, email: false },
    reminder_enable: true,
    notes: { kdOrderId: params.orderId, sellerPhone: params.sellerPhone, kind: 'manual_order' },
  })) as unknown as { id: string; short_url: string };
}

/**
 * The authoritative, order-independent record of a payment link. Written at creation
 * (status 'created') and updated by the webhook (paid/cancelled/expired) keyed by the
 * Payment Link ID. Lets the webhook record a verified payment even if the order can't
 * be found, and lets a later order be linked to it.
 */
async function persistLinkRecord(params: {
  paymentLinkId: string;
  shortUrl: string;
  orderId: string;
  sellerPhone: string;
  amount: number;
}): Promise<void> {
  await getAdminDb().collection(LINKS).doc(params.paymentLinkId).set(
    {
      id: params.paymentLinkId,
      shortUrl: params.shortUrl,
      referenceId: params.orderId,
      orderId: params.orderId,
      sellerPhone: params.sellerPhone,
      amount: params.amount,
      currency: 'INR',
      status: 'created',
      razorpayPaymentId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function createPaymentLinkOrder(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult> {
  const db = getAdminDb();

  if (!input.sellerPhone) return { ok: false, status: 400, error: 'A seller is required.' };
  if (!input.customer?.id) return { ok: false, status: 400, error: 'A customer is required.' };
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, status: 400, error: 'At least one product is required.' };
  }
  const key = String(input.idempotencyKey ?? '').trim();
  if (!key) return { ok: false, status: 400, error: 'An idempotency key is required.' };

  const orderId = orderIdFor(key);
  const ref = db.collection('orders').doc(orderId);

  const seller = await resolveSellerAccount(input.sellerPhone);
  const sellerType = seller?.collection === 'manufacturers' ? 'manufacturer' : 'retailer';
  const sellerName = seller?.shopName || input.sellerPhone;

  // ── Idempotent retry: the order already exists ───────────────────────────────
  const existing = await ref.get();
  if (existing.exists) {
    const d = existing.data()!;
    const payment = (d.payment ?? {}) as Record<string, unknown>;
    if (payment.paymentLinkId && payment.paymentLinkUrl) {
      return {
        ok: true,
        orderId,
        paymentLinkId: String(payment.paymentLinkId),
        shortUrl: String(payment.paymentLinkUrl),
        amount: Number(d.grandTotal ?? 0),
        status: String(d.status ?? 'accepted'),
        paymentStatus: String(payment.status ?? 'pending'),
        alreadyExisted: true,
      };
    }
    // The order was written but link creation failed earlier — make the link now.
    try {
      const link = await createRazorpayLink({
        orderId,
        amountRupees: Number(d.grandTotal ?? 0),
        sellerPhone: input.sellerPhone,
        sellerName,
        customer: input.customer,
      });
      await ref.set(
        { payment: { paymentLinkId: link.id, paymentLinkUrl: link.short_url }, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      await persistLinkRecord({ paymentLinkId: link.id, shortUrl: link.short_url, orderId, sellerPhone: input.sellerPhone, amount: Number(d.grandTotal ?? 0) });
      return {
        ok: true,
        orderId,
        paymentLinkId: link.id,
        shortUrl: link.short_url,
        amount: Number(d.grandTotal ?? 0),
        status: String(d.status ?? 'accepted'),
        paymentStatus: 'pending',
        alreadyExisted: true,
      };
    } catch (e) {
      console.error('[manual-order-link] paymentLink.create (retry) failed:', e);
      return { ok: false, status: 502, error: `Could not create the payment link: ${errText(e)}` };
    }
  }

  // ── Authoritative server pricing (rules-based delivery; no override) ─────────
  const pricing = await priceManualOrder(input.sellerPhone, input.items, input.customer.deliveryState, null);
  if (pricing.grandTotal <= 0) {
    return { ok: false, status: 400, error: 'Order total is zero — check the selected products and prices.' };
  }

  const sellerGstin = seller ? (seller.data.gstin ?? seller.data.gstNumber ?? null) : null;
  const nowIso = new Date().toISOString();
  const items = pricing.lines.map((l) => ({
    productId: l.productId,
    name: l.name,
    price: l.unitPrice,
    qty: l.qty,
    lineTotal: l.lineTotal,
    ...(l.variantUnit ? { variantUnit: l.variantUnit } : {}),
    ...(l.gstApplicable
      ? { gstApplicable: true, gstRate: l.gstRate, gstAmount: l.gstPerUnit, gstIncluded: l.gstIncluded }
      : {}),
  }));

  const orderDoc: Record<string, unknown> = {
    customerId: input.customer.id,
    customerName: input.customer.name,
    customerPhone: input.customer.phone,
    ...(input.customer.email ? { customerEmail: input.customer.email } : {}),
    customerAddress: input.customer.address ?? 'ADDRESS PENDING — contact customer',
    ...(input.customer.deliveryState ? { customerDeliveryState: input.customer.deliveryState } : {}),
    sellerId: input.sellerPhone,
    sellerPhone: input.sellerPhone,
    sellerName,
    sellerType,
    ...(sellerGstin ? { sellerGstNumber: String(sellerGstin) } : {}),
    items,
    subtotal: pricing.subtotal,
    ...(pricing.totalGst > 0 ? { totalGst: pricing.totalGst } : {}),
    ...(pricing.totalGstAdded > 0 ? { totalGstAdded: pricing.totalGstAdded } : {}),
    deliveryCharge: pricing.deliveryCharge,
    deliveryBreakdown: pricing.deliveryBreakdown,
    grandTotal: pricing.grandTotal,
    total: pricing.grandTotal,
    deliveryMode: 'delivery',
    status: 'accepted',
    statusHistory: [{ status: 'accepted', at: nowIso }],
    manualOrder: true,
    awaitingPayment: true,
    payment: {
      mode: 'razorpay',
      status: 'pending',
      amount: pricing.grandTotal,
    },
    recovered: {
      by: 'retailer_manual_order_link',
      at: nowIso,
      basis: 'retailer-created order, awaiting payment via Razorpay payment link',
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) tx.set(ref, orderDoc);
  });

  let link: { id: string; short_url: string };
  try {
    link = await createRazorpayLink({
      orderId,
      amountRupees: pricing.grandTotal,
      sellerPhone: input.sellerPhone,
      sellerName,
      customer: input.customer,
    });
  } catch (e) {
    console.error('[manual-order-link] paymentLink.create failed:', e);
    return { ok: false, status: 502, error: `Order created, but the payment link could not be generated: ${errText(e)}` };
  }

  await ref.set(
    { payment: { paymentLinkId: link.id, paymentLinkUrl: link.short_url }, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  await persistLinkRecord({ paymentLinkId: link.id, shortUrl: link.short_url, orderId, sellerPhone: input.sellerPhone, amount: pricing.grandTotal });

  return {
    ok: true,
    orderId,
    paymentLinkId: link.id,
    shortUrl: link.short_url,
    amount: pricing.grandTotal,
    status: 'accepted',
    paymentStatus: 'pending',
    alreadyExisted: false,
  };
}

// ── Webhook reconciliation ────────────────────────────────────────────────────

export type MarkPaidOutcome =
  | { action: 'paid'; orderId: string; invoice: InvoiceOutcome }
  | { action: 'already_paid'; orderId: string }
  | { action: 'amount_mismatch'; orderId: string; expected: number; got: number }
  | { action: 'skipped'; reason: string };

export type RecordPaidOutcome = {
  record: 'paid' | 'skipped';
  linkId: string;
  order: MarkPaidOutcome['action'] | 'none';
  orderId: string | null;
};

/**
 * Reconcile a PAID Razorpay Payment Link. Keyed by the Payment Link ID (always in
 * the event), independent of any order id in the payload. ALWAYS updates the
 * authoritative `razorpayPaymentLinks` record first (so a verified payment is never
 * lost), then links it to its order (by the record's stored orderId, the payload
 * hints, or a query on `payment.paymentLinkId`) and marks that order paid.
 */
export async function recordPaymentLinkPaid(params: {
  paymentLinkId: string;
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  amountPaise: number | null;
  referenceId?: string | null;
  notesOrderId?: string | null;
}): Promise<RecordPaidOutcome> {
  const db = getAdminDb();
  const plinkId = String(params.paymentLinkId ?? '').trim();
  if (!plinkId) return { record: 'skipped', linkId: '', order: 'none', orderId: null };

  const recRef = db.collection(LINKS).doc(plinkId);
  const recSnap = await recRef.get();
  const rec = (recSnap.data() ?? {}) as Record<string, unknown>;

  // 1) Authoritative, order-independent record → paid (idempotent set; create if
  //    the record is somehow missing, e.g. a link made outside this flow).
  await recRef.set(
    {
      id: plinkId,
      status: 'paid',
      razorpayPaymentId: params.razorpayPaymentId ?? null,
      ...(params.razorpayOrderId ? { razorpayOrderId: params.razorpayOrderId } : {}),
      ...(params.referenceId ? { referenceId: params.referenceId } : {}),
      amountPaid: params.amountPaise != null ? Math.round(params.amountPaise) / 100 : (rec.amount ?? null),
      paidAt: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // 2) Link to the order and mark it paid. Reliable resolution order: the record's
  //    stored orderId, then payload hints, then a query on payment.paymentLinkId.
  const orderIdHint =
    String(rec.orderId ?? '').trim() ||
    String(params.notesOrderId ?? '').trim() ||
    String(params.referenceId ?? '').trim() ||
    null;

  const outcome = await markPaymentLinkOrderPaid({
    orderId: orderIdHint,
    paymentLinkId: plinkId,
    razorpayPaymentId: params.razorpayPaymentId,
    razorpayOrderId: params.razorpayOrderId,
    amountPaise: params.amountPaise,
  });

  const resolvedOrderId = 'orderId' in outcome ? outcome.orderId : null;
  // Backfill the record's orderId once we know it (payment-before-record case).
  if (resolvedOrderId && !rec.orderId) {
    await recRef.set({ orderId: resolvedOrderId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return { record: 'paid', linkId: plinkId, order: outcome.action, orderId: resolvedOrderId };
}

/**
 * Flip the order tied to a paid Payment Link to paid. The order is found by its id,
 * or — reliably, independent of the payload — by a query on `payment.paymentLinkId`.
 * Idempotent: no-ops when the order is already paid.
 */
export async function markPaymentLinkOrderPaid(params: {
  orderId?: string | null;
  paymentLinkId?: string | null;
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  amountPaise: number | null;
}): Promise<MarkPaidOutcome> {
  const db = getAdminDb();

  let snap: FirebaseFirestore.DocumentSnapshot | null = null;
  if (params.orderId) {
    const s = await db.collection('orders').doc(params.orderId).get();
    if (s.exists) snap = s;
  }
  if (!snap && params.paymentLinkId) {
    const q = await db
      .collection('orders')
      .where('payment.paymentLinkId', '==', params.paymentLinkId)
      .limit(1)
      .get();
    if (!q.empty) snap = q.docs[0];
  }
  if (!snap) {
    return { action: 'skipped', reason: `no order for ${params.orderId ?? params.paymentLinkId ?? '?'}` };
  }

  const orderId = snap.id;
  const ref = snap.ref;
  const order = snap.data()!;
  const payment = (order.payment ?? {}) as Record<string, unknown>;
  if (payment.status === 'paid') return { action: 'already_paid', orderId };

  // Verify the captured amount matches the order total to the paise — but only when a
  // positive amount is actually present. A missing/zero amount in the payload must NOT
  // be read as a mismatch (that is how a real payment silently stays pending); the
  // payment_link.paid event is itself Razorpay's confirmation that it was paid.
  const expectedPaise = Math.round(Number(order.grandTotal ?? payment.amount ?? 0) * 100);
  if (params.amountPaise != null && params.amountPaise > 0 && expectedPaise > 0 && Math.round(params.amountPaise) !== expectedPaise) {
    console.error(
      `[manual-order-link] AMOUNT MISMATCH for ${orderId}: captured ${params.amountPaise} vs expected ${expectedPaise} — left pending for review`,
    );
    await ref.set(
      {
        payment: {
          amountMismatch: true,
          capturedAmount: Math.round(params.amountPaise) / 100,
          ...(params.razorpayPaymentId ? { razorpayPaymentId: params.razorpayPaymentId } : {}),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { action: 'amount_mismatch', orderId, expected: expectedPaise / 100, got: Math.round(params.amountPaise) / 100 };
  }

  const nowIso = new Date().toISOString();
  await ref.set(
    {
      awaitingPayment: FieldValue.delete(), // keep status 'accepted'; only payment changes
      payment: {
        status: 'paid',
        ...(params.razorpayOrderId ? { razorpayOrderId: params.razorpayOrderId } : {}),
        ...(params.razorpayPaymentId ? { razorpayPaymentId: params.razorpayPaymentId } : {}),
        amount: params.amountPaise != null && params.amountPaise > 0
          ? Math.round(params.amountPaise) / 100
          : Number(order.grandTotal ?? 0),
        paidAt: nowIso,
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // Now paid: generate the invoice (order is already 'accepted') and send the customer
  // their confirmation. Best-effort — a failure here does not un-pay the order.
  const invoice = await ensureOrderInvoice(orderId).catch((e) => {
    console.error('[manual-order-link] invoice generation failed', orderId, e);
    return { ok: false, error: String(e) } as InvoiceOutcome;
  });

  const customerPhone = String(order.customerPhone ?? '').trim();
  if (customerPhone) {
    await queueOrderConfirmationCustomer(customerPhone, String(order.customerName ?? ''), orderId, {
      source: { event: 'manual_order_paid', entityType: 'order', entityId: orderId },
    }).catch((e) => console.error('[manual-order-link] customer WA enqueue failed', orderId, e));
  }

  return { action: 'paid', orderId, invoice };
}

/** Record a cancelled/expired payment link on its authoritative record (the order, if
 *  any, is left Accepted/Pending — never auto-cancelled). */
export async function markPaymentLinkClosed(paymentLinkId: string, status: 'cancelled' | 'expired'): Promise<void> {
  const plinkId = String(paymentLinkId ?? '').trim();
  if (!plinkId) return;
  await getAdminDb().collection(LINKS).doc(plinkId).set(
    { id: plinkId, status, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

function errText(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as { error?: { description?: string }; statusCode?: number; message?: string };
    if (anyE.error?.description) return `${anyE.statusCode ?? ''} ${anyE.error.description}`.trim();
    if (anyE.message) return String(anyE.message);
  }
  return String(e);
}
