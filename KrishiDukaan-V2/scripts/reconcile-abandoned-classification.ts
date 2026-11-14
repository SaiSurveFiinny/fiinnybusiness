/**
 * READ-ONLY reconciliation for the unified payment classification.
 *
 * Correlates the two prod collections by Razorpay ORDER id and reports how a
 * normalized scheme (Successful / Failed / Abandoned / Pending / Refunded)
 * would land — WITHOUT writing anything.
 *
 *   razorpayPayments  — gateway truth, keyed by payment id (orderId field).
 *   paymentAttempts   — app checkout record, keyed by Razorpay order id.
 *
 * Dedup rule: an order that has ANY razorpayPayments payment is represented by
 * those gateway rows; its app attempt is NOT counted again (overlap). An order
 * with no gateway payment is an app-only row (preserved). A payment is never
 * counted twice.
 *
 *   npx tsx scripts/reconcile-abandoned-classification.ts            # prod, all-time
 *   ... --project karan-arjun-uat                                    # against UAT instead
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { classifyPayment, isTimeoutFailure, type PaymentStatus } from '../app/lib/payments-shared';

const projectArg = process.argv.find((a) => a.startsWith('--project='))?.split('=')[1];
const projectId = projectArg ?? 'krishidukan-e8315';
if (getApps().length === 0) initializeApp({ projectId });
const db: Firestore = getFirestore();

const ABANDON_AFTER_MS = 30 * 60 * 1000;
const toMs = (v: any): number => (v?.toMillis ? v.toMillis() : v?._seconds ? v._seconds * 1000 : 0);

async function main() {
  const now = Date.now();
  const [raSnap, paSnap] = await Promise.all([
    db.collection('razorpayPayments').get(),
    db.collection('paymentAttempts').get(),
  ]);

  // ── Gateway side (razorpayPayments) ──────────────────────────────────────────
  const razorpayByOrder = new Map<string, number>();
  const gateway = { captured: 0, refunded: 0, failedGenuine: 0, abandonedTimeout: 0, pending: 0 };
  for (const d of raSnap.docs) {
    const x = d.data();
    const status = (x.status ?? 'created') as PaymentStatus;
    const amountRefunded = Number(x.amountRefunded ?? 0);
    if (x.orderId) razorpayByOrder.set(x.orderId, (razorpayByOrder.get(x.orderId) ?? 0) + 1);

    const bucket = classifyPayment({ status, amountRefunded });
    if (bucket === 'captured') gateway.captured++;
    else if (bucket === 'refunded') gateway.refunded++;
    else if (bucket === 'created') gateway.pending++;
    else {
      // failed → genuine vs timeout(abandoned)
      if (isTimeoutFailure({ status, errorReason: x.errorReason, errorDescription: x.errorDescription, errorCode: x.errorCode }))
        gateway.abandonedTimeout++;
      else gateway.failedGenuine++;
    }
  }

  // ── App side (paymentAttempts) ───────────────────────────────────────────────
  let appTotal = 0;
  let appFailed = 0;
  let appCreated = 0;
  let appPaid = 0;
  let overlapOrders = 0; // app order that also has a gateway payment
  const appOnly = { abandoned: 0, pending: 0, paidNoGateway: 0, other: 0 };
  let unresolved = 0;

  for (const d of paSnap.docs) {
    const x = d.data();
    appTotal++;
    const status = String(x.status ?? 'created'); // created | paid | failed
    if (status === 'failed') appFailed++;
    else if (status === 'created') appCreated++;
    else if (status === 'paid') appPaid++;

    const hasGateway = razorpayByOrder.has(d.id); // paymentAttempts id == razorpay order id
    if (hasGateway) {
      overlapOrders++;
      continue; // represented by gateway rows — do not double count
    }

    // App-only (no gateway payment entity ever existed for this order)
    const ageMs = now - toMs(x.createdAt);
    if (status === 'failed') appOnly.abandoned++; // app "failed" w/ no gateway payment = abandoned
    else if (status === 'created') {
      if (ageMs > ABANDON_AFTER_MS) appOnly.abandoned++;
      else appOnly.pending++;
    } else if (status === 'paid') {
      appOnly.paidNoGateway++; // paid in app but no mirrored payment — needs reconciliation
      unresolved++;
    } else appOnly.other++;
  }

  // ── Unified, deduped ──────────────────────────────────────────────────────────
  const unified = {
    successful: gateway.captured,
    refunded: gateway.refunded,
    failed: gateway.failedGenuine,
    abandoned: gateway.abandonedTimeout + appOnly.abandoned, // merged, no overlap (app-only by construction)
    pending: gateway.pending + appOnly.pending,
  };

  const report = {
    project: projectId,
    collections: { razorpayPayments: raSnap.size, paymentAttempts: paSnap.size },

    // §6 requested metrics
    appAttemptsClassifiedFailed: appFailed,
    appAttemptsToReclassifyAbandoned: appOnly.abandoned, // app-failed/created-aged with no gateway payment
    razorpayTimeoutAbandoned: gateway.abandonedTimeout,
    overlappingOrders: overlapOrders,
    uniqueAbandonedAfterDedup: unified.abandoned,
    genuineFailedPayments: gateway.failedGenuine,
    unresolvedRecords: unresolved,

    // Supporting breakdown
    gateway,
    appSide: { appTotal, appFailed, appCreated, appPaid, appOnly },
    unifiedCategories: unified,
    unifiedTotal:
      unified.successful + unified.refunded + unified.failed + unified.abandoned + unified.pending,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
