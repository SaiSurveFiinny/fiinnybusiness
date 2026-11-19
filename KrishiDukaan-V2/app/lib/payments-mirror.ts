import type { Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from './firebase-admin';
import type { RazorpayRefundEntity } from './refund-sync';
import { type PaymentStatus, type PaymentBucket, classifyPayment, isTimeoutFailure } from './payments-shared';

// Re-exported so existing server/script imports keep resolving from here, while
// the single source of truth lives in the client-safe payments-shared module.
export { classifyPayment, isTimeoutFailure };
export type { PaymentStatus, PaymentBucket };

/**
 * `razorpayPayments` — our mirror of Razorpay's own payment records.
 * (Named to avoid the pre-existing `payments` collection, which is the
 * subscription-revenue ledger — an entirely separate concern.)
 *
 * WHY THIS EXISTS (see the Nov 2026 payment audit):
 * `paymentAttempts` conflates two different things — the checkout basket (what
 * the customer tried to buy) AND the payment outcome. It is keyed by Razorpay
 * ORDER id, and its failure rows came from the mobile client with no payment
 * id and usually no real error reason. So it cannot answer "what did Razorpay
 * actually do with this payment?".
 *
 * This collection answers exactly that, and nothing else. One document per
 * unique Razorpay PAYMENT id (`pay_…`), mirroring the gateway's payment entity:
 *   - retries are distinct payments → distinct docs (never collapsed);
 *   - repeated/out-of-order webhooks converge on the same doc (idempotent);
 *   - status only ever moves FORWARD (a late `authorized` can't bury a
 *     `captured`; a replayed event can't un-refund).
 *
 * It owns STATUS only. Basket/customer detail still lives on `paymentAttempts`
 * and is joined in at read time on `orderId`. Written exclusively server-side
 * (webhook + admin backfill); the matching Firestore rule denies client writes.
 */

export type PaymentDoc = {
  paymentId: string;
  orderId: string | null;
  status: PaymentStatus;
  /** Rupees. */
  amount: number;
  /** Rupees refunded so far (0 unless a refund has been processed). */
  amountRefunded: number;
  method: string | null;
  errorCode: string | null;
  errorReason: string | null;
  errorDescription: string | null;
  errorSource: string | null;
  errorStep: string | null;
  contact: string | null;
  email: string | null;
  /** Razorpay order notes (carries userId etc.) — handy for the basket join. */
  userId: string | null;
  /** Razorpay's own creation time for the payment. */
  createdAt: Date | null;
  /** Best-effort capture time (set when the capture webhook arrives). */
  capturedAt: Date | null;
  /** How this row last reached us. */
  source: 'webhook' | 'backfill';
  updatedAt: Date;
};

/** The minimal shape of a Razorpay payment entity we read — a subset shared by
 *  the webhook payload and the List Payments API. */
export type RazorpayPaymentEntity = {
  id: string;
  order_id?: string | null;
  status?: string | null;
  amount?: number | null; // paise
  amount_refunded?: number | null; // paise
  method?: string | null;
  error_code?: string | null;
  error_description?: string | null;
  error_reason?: string | null;
  error_source?: string | null;
  error_step?: string | null;
  contact?: string | null;
  email?: string | null;
  notes?: Record<string, unknown> | null;
  created_at?: number | null; // unix seconds
};

/** Forward-only ranking so status can never move backwards on a merge. A
 *  payment is either failed or captured (never both), so their relative order
 *  only matters for the max() and is otherwise irrelevant. */
const STATUS_RANK: Record<PaymentStatus, number> = {
  created: 0,
  authorized: 1,
  failed: 2,
  captured: 3,
  refunded: 4,
};

function normalizeStatus(s: string | null | undefined): PaymentStatus {
  switch (s) {
    case 'authorized':
    case 'captured':
    case 'refunded':
    case 'failed':
      return s;
    default:
      return 'created';
  }
}

/** The later of two statuses by lifecycle rank — the heart of idempotency. */
function higherStatus(prev: PaymentStatus | undefined, next: PaymentStatus): PaymentStatus {
  if (!prev) return next;
  return STATUS_RANK[next] >= STATUS_RANK[prev] ? next : prev;
}

function mapEntity(e: RazorpayPaymentEntity, source: PaymentDoc['source']): Omit<PaymentDoc, 'status'> {
  return {
    paymentId: e.id,
    orderId: e.order_id ?? null,
    amount: (Number(e.amount ?? 0) || 0) / 100,
    amountRefunded: (Number(e.amount_refunded ?? 0) || 0) / 100,
    method: e.method ?? null,
    errorCode: e.error_code ?? null,
    errorReason: e.error_reason ?? null,
    errorDescription: e.error_description ?? null,
    errorSource: e.error_source ?? null,
    errorStep: e.error_step ?? null,
    contact: e.contact ?? null,
    email: e.email ?? null,
    userId: e.notes && typeof e.notes.userId === 'string' ? e.notes.userId : null,
    createdAt: e.created_at ? new Date(e.created_at * 1000) : null,
    capturedAt: null,
    source,
    updatedAt: new Date(),
  };
}

/**
 * Upserts one Razorpay payment entity into `payments`, transactionally so that:
 *  - the stored status only ever advances (webhooks can arrive out of order);
 *  - a value already known (createdAt, capturedAt) is never nulled by a later
 *    event that didn't carry it.
 * Safe to call repeatedly with the same entity.
 */
export async function upsertPaymentFromEntity(
  e: RazorpayPaymentEntity,
  source: PaymentDoc['source'],
  opts: { capturedAt?: Date } = {},
  // Injectable so a one-off backfill can target a DIFFERENT project (UAT) than
  // the app default (production) — the upsert logic stays identical.
  db: Firestore = getAdminDb(),
): Promise<void> {
  if (!e.id) return;
  const ref = db.collection('razorpayPayments').doc(e.id);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? (snap.data() as Partial<PaymentDoc>) : null;

    const mapped = mapEntity(e, source);
    const status = higherStatus(prev?.status as PaymentStatus | undefined, normalizeStatus(e.status));

    // A partial refund leaves Razorpay's status at 'captured'; surface it as
    // refunded anyway so the Refunded view is complete and the buckets stay
    // mutually exclusive.
    const amountRefunded = Math.max(mapped.amountRefunded, Number(prev?.amountRefunded ?? 0));
    const finalStatus: PaymentStatus =
      amountRefunded > 0 ? 'refunded' : status;

    const data: Record<string, unknown> = {
      ...mapped,
      status: finalStatus,
      amountRefunded,
      capturedAt:
        opts.capturedAt ??
        (finalStatus === 'captured' && !prev?.capturedAt ? new Date() : (prev?.capturedAt ?? null)),
      // Never let a null from this event wipe a value an earlier event set.
      createdAt: mapped.createdAt ?? prev?.createdAt ?? null,
    };

    tx.set(ref, data, { merge: true });
  });
}

/**
 * Applies a refund entity to the payment it belongs to: records the refunded
 * amount and moves the payment to `refunded`. Idempotent — reprocessing the
 * same refund can only re-assert the same (or larger) refunded amount.
 */
export async function applyRefundToPayment(
  refund: RazorpayRefundEntity,
  db: Firestore = getAdminDb(),
): Promise<void> {
  const paymentId = refund.payment_id;
  if (!paymentId) return;
  const ref = db.collection('razorpayPayments').doc(paymentId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    // If the payment hasn't been mirrored yet, a later payment sync/webhook
    // will carry its own amount_refunded and reconcile — don't fabricate a row.
    if (!snap.exists) return;
    const prev = snap.data() as Partial<PaymentDoc>;
    const refundedRupees = (Number(refund.amount ?? 0) || 0) / 100;
    const amountRefunded = Math.max(Number(prev.amountRefunded ?? 0), refundedRupees);

    tx.set(
      ref,
      { status: 'refunded' as PaymentStatus, amountRefunded, updatedAt: new Date() },
      { merge: true },
    );
  });
}

