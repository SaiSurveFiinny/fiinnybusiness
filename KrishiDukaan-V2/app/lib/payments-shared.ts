/**
 * Pure, dependency-free payment classification — safe to import from BOTH the
 * server mirror (app/lib/payments-mirror.ts, which pulls in firebase-admin) and
 * the client dashboard (app/admin/payments, which must not). One definition of
 * "what bucket is this payment in", shared by the writer and the reader.
 */

/** Razorpay payment lifecycle, as the gateway reports it. */
export type PaymentStatus = 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';

/** Mutually-exclusive gateway bucket. `authorized` and `created` share the
 *  "created" (unresolved) bucket — an authorized-but-uncaptured payment is
 *  deliberately NOT counted as captured. */
export type PaymentBucket = 'captured' | 'refunded' | 'failed' | 'created';

export function classifyPayment(p: { status: PaymentStatus; amountRefunded?: number }): PaymentBucket {
  if ((p.amountRefunded ?? 0) > 0 || p.status === 'refunded') return 'refunded';
  if (p.status === 'captured') return 'captured';
  if (p.status === 'failed') return 'failed';
  return 'created';
}

/** A failed payment that timed out — the business "Abandoned" view, a strict
 *  sub-set of Failed (never its own payment attempt). */
export function isTimeoutFailure(p: {
  status: PaymentStatus;
  errorReason?: string | null;
  errorDescription?: string | null;
  errorCode?: string | null;
}): boolean {
  if (p.status !== 'failed') return false;
  const txt = `${p.errorReason ?? ''} ${p.errorDescription ?? ''} ${p.errorCode ?? ''}`.toLowerCase();
  return txt.includes('timed_out') || txt.includes('timeout') || txt.includes('timed out');
}
