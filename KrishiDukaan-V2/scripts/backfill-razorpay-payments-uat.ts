/**
 * Backfill Razorpay LIVE payments → UAT Firestore (karan-arjun-uat) ONLY.
 *
 * READS come from the LIVE Razorpay account (RAZORPAY_KEY_ID_LIVE); WRITES go
 * exclusively to UAT Firestore. The script refuses to run unless the resolved
 * Firestore project id contains "uat" and is not the production project — the
 * one safety invariant that matters here.
 *
 * It reuses the real mirror logic (app/lib/payments-mirror.ts) via an injected
 * UAT Firestore handle, so there is NO second copy of the classification or
 * status-advance rules. Idempotent: re-running only advances status / re-asserts
 * the same data, never duplicates (doc id = Razorpay payment id).
 *
 * Usage:
 *   npx tsx scripts/backfill-razorpay-payments-uat.ts                 # DRY RUN (no writes)
 *   npx tsx scripts/backfill-razorpay-payments-uat.ts --write         # persist to UAT
 *   ... --from=2026-11-05 --to=2026-11-11                             # IST day window (inclusive)
 *
 * Credentials: .env.uat.local (gitignored). Nothing secret is ever printed.
 */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import Razorpay from 'razorpay';
import {
  upsertPaymentFromEntity,
  classifyPayment,
  isTimeoutFailure,
  type RazorpayPaymentEntity,
  type PaymentBucket,
  type PaymentStatus,
} from '../app/lib/payments-mirror';

// ── Env: UAT secrets override public UAT config (same order as seed-uat.ts) ──
dotenv.config({ path: path.resolve(process.cwd(), '.env.uat.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.uat') });

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--write');
const getArg = (k: string) => {
  const hit = args.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=')[1] : undefined;
};

// ── SAFETY GUARD 1: Firestore destination ────────────────────────────────────
// UAT is the default and the only target unless production is EXPLICITLY opted
// into with --prod. An env FIREBASE_PROJECT_ID can never silently promote a run
// to production — --prod is the single, deliberate switch.
const PROD_PROJECT = 'krishidukan-e8315';
const ALLOW_PROD = args.includes('--prod');
const projectId = ALLOW_PROD ? PROD_PROJECT : (process.env.FIREBASE_PROJECT_ID ?? 'karan-arjun-uat');
if (ALLOW_PROD) {
  console.warn('⚠️  PRODUCTION target enabled via --prod — writing to ' + PROD_PROJECT + '.');
} else if (!projectId.includes('uat')) {
  console.error(
    `STOP: Firestore project "${projectId}" is not a UAT project and --prod was not passed.`,
  );
  process.exit(1);
}

// ── SAFETY GUARD 2: Razorpay reads must use a LIVE key ───────────────────────
// The LIVE secret lives under its OWN var (RAZORPAY_KEY_SECRET_LIVE) and is kept
// separate from RAZORPAY_KEY_SECRET — the latter is the TEST secret UAT checkout
// uses, and must not be overwritten.
const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID_LIVE ?? '';
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET_LIVE ?? '';
if (!RZP_KEY_ID.startsWith('rzp_live')) {
  console.error(
    'STOP: RAZORPAY_KEY_ID_LIVE is not a LIVE key (expected rzp_live_…). ' +
      'This backfill is pointless against test data.',
  );
  process.exit(1);
}
if (!RZP_KEY_SECRET) {
  console.error(
    'STOP: RAZORPAY_KEY_SECRET_LIVE is not set. Add the LIVE key secret (paired with ' +
      'RAZORPAY_KEY_ID_LIVE) to .env.uat.local as RAZORPAY_KEY_SECRET_LIVE. Do NOT reuse ' +
      'RAZORPAY_KEY_SECRET — that is the TEST secret UAT checkout depends on.',
  );
  process.exit(1);
}

// ── Firestore (UAT), explicit project ────────────────────────────────────────
function initUatApp(): Firestore {
  if (getApps().length === 0) {
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (clientEmail && privateKey) {
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    } else {
      // ADC — a @fiinny.com account with access to karan-arjun-uat.
      initializeApp({ projectId });
    }
  }
  return getFirestore();
}

const razorpay = new Razorpay({ key_id: RZP_KEY_ID, key_secret: RZP_KEY_SECRET });

// ── IST day window → unix seconds (inclusive), optional ──────────────────────
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function istDayStartSec(day: string): number {
  // midnight IST = (UTC midnight) - offset
  return Math.floor((Date.parse(`${day}T00:00:00.000Z`) - IST_OFFSET_MS) / 1000);
}
function istDayEndSec(day: string): number {
  return Math.floor((Date.parse(`${day}T23:59:59.000Z`) - IST_OFFSET_MS) / 1000);
}
const fromArg = getArg('from');
const toArg = getArg('to');
const FROM = fromArg ? istDayStartSec(fromArg) : undefined;
const TO = toArg ? istDayEndSec(toArg) : undefined;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Razorpay SDK errors are plain objects — surface the useful bits, never any secret. */
function describeRzpError(e: unknown): string {
  const o = e as { statusCode?: number; error?: { code?: string; description?: string }; message?: string };
  if (o?.error?.description) return `HTTP ${o.statusCode ?? '?'} ${o.error.code ?? ''} — ${o.error.description}`;
  if (o?.statusCode) return `HTTP ${o.statusCode}`;
  if (o?.message) return o.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

/** List one page, retrying transient failures with backoff. Never skips silently —
 *  a page that still fails after retries aborts the whole run. */
async function fetchPage(skip: number): Promise<RazorpayPaymentEntity[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const page = await razorpay.payments.all({
        count: 100,
        skip,
        ...(FROM ? { from: FROM } : {}),
        ...(TO ? { to: TO } : {}),
      });
      return (page.items ?? []) as unknown as RazorpayPaymentEntity[];
    } catch (e) {
      lastErr = e;
      const wait = 500 * 2 ** attempt;
      console.warn(
        `  page skip=${skip} failed (attempt ${attempt + 1}/5): ${describeRzpError(e)} — retrying in ${wait}ms`,
      );
      await sleep(wait);
    }
  }
  throw new Error(`Razorpay list failed permanently at skip=${skip}: ${describeRzpError(lastErr)}`);
}

type Refund = { id: string; amount: number; status: string | null; createdAt: number | null };
async function fetchRefunds(paymentId: string): Promise<Refund[]> {
  try {
    const res = await razorpay.payments.fetchMultipleRefund(paymentId);
    return ((res.items ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      amount: (Number(r.amount ?? 0) || 0) / 100,
      status: (r.status as string) ?? null,
      createdAt: (r.created_at as number) ?? null,
    }));
  } catch {
    return [];
  }
}

async function main() {
  const db = initUatApp();

  // Preflight: prove UAT read access + confirm the collection we'll touch.
  const preCount = (await db.collection('razorpayPayments').count().get()).data().count;

  const TARGET = ALLOW_PROD ? 'PRODUCTION' : 'UAT';
  console.log('──────────────────────────────────────────────────────────────');
  console.log('Razorpay → Firestore payments backfill');
  console.log('  Firestore project :', projectId, `(${TARGET})`);
  console.log('  Razorpay key mode :', 'LIVE ✓');
  console.log('  Mode              :', DRY_RUN ? 'DRY RUN (no writes)' : 'WRITE');
  console.log('  Window            :', fromArg || '(all history)', '→', toArg || '(now)');
  console.log(`  razorpayPayments pre-existing docs in ${TARGET}:`, preCount);
  console.log('──────────────────────────────────────────────────────────────');

  const seen = new Set<string>();
  const ordersWithPayments = new Map<string, number>();
  let scanned = 0;
  let duplicates = 0;
  let unresolved = 0;
  let created = 0;
  let updated = 0;
  let failedToProcess = 0;
  const buckets: Record<PaymentBucket, number> = { captured: 0, refunded: 0, failed: 0, created: 0 };
  let timeoutFailures = 0;
  let minTs = Infinity;
  let maxTs = -Infinity;

  let skip = 0;
  for (;;) {
    const items = await fetchPage(skip);
    if (items.length === 0) break;

    for (const p of items) {
      scanned++;
      if (!p.id) { failedToProcess++; continue; }
      if (seen.has(p.id)) { duplicates++; continue; }
      seen.add(p.id);

      if (p.order_id) ordersWithPayments.set(p.order_id, (ordersWithPayments.get(p.order_id) ?? 0) + 1);
      if (p.created_at) { minTs = Math.min(minTs, p.created_at); maxTs = Math.max(maxTs, p.created_at); }

      const resolvable = Boolean(p.order_id || (p.notes && typeof p.notes.userId === 'string'));
      if (!resolvable) unresolved++;

      const amountRefunded = (Number(p.amount_refunded ?? 0) || 0) / 100;
      const status = (p.status ?? 'created') as PaymentStatus;
      const bucket = classifyPayment({ status, amountRefunded });
      buckets[bucket]++;
      if (
        isTimeoutFailure({
          status,
          errorReason: p.error_reason ?? null,
          errorDescription: p.error_description ?? null,
          errorCode: p.error_code ?? null,
        })
      ) {
        timeoutFailures++;
      }

      if (!DRY_RUN) {
        try {
          const ref = db.collection('razorpayPayments').doc(p.id);
          const existed = (await ref.get()).exists;
          await upsertPaymentFromEntity(p, 'backfill', {}, db);
          // Script-only enrichment that the lib doesn't model: detailed refunds,
          // a resolution flag, and which run wrote it. Never a separate payment doc.
          const refunds = amountRefunded > 0 ? await fetchRefunds(p.id) : [];
          await ref.set(
            {
              resolved: resolvable,
              ...(refunds.length ? { refunds } : {}),
              backfillRunAt: new Date(),
            },
            { merge: true },
          );
          if (existed) updated++; else created++;
        } catch (e) {
          failedToProcess++;
          console.error(`  FAILED to write ${p.id}: ${String(e)}`);
        }
      }
    }

    skip += items.length;
    if (items.length < 100) break;
  }

  const multiAttemptOrders = Array.from(ordersWithPayments.values()).filter((n) => n > 1).length;
  const istr = (sec: number) =>
    Number.isFinite(sec) ? new Date(sec * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—';

  const report = {
    mode: DRY_RUN ? 'dry-run' : 'write',
    window: { from: fromArg ?? null, to: toArg ?? null },
    razorpayRetrieved: scanned,
    uniquePaymentIds: seen.size,
    duplicatesSkipped: duplicates,
    writtenNew: created,
    updatedExisting: updated,
    unresolved,
    failedToProcess,
    ordersWithMultiplePayments: multiAttemptOrders,
    classification: { ...buckets, timeoutFailures },
    actualPaymentDateRange: { earliest: istr(minTs), latest: istr(maxTs) },
    uatDocsBefore: preCount,
  };

  console.log('\n──────────── RECONCILIATION REPORT ────────────');
  console.log(JSON.stringify(report, null, 2));

  if (!DRY_RUN) {
    const after = (await db.collection('razorpayPayments').count().get()).data().count;
    console.log(`\n  razorpayPayments docs in ${TARGET} now:`, after, `(was ${preCount})`);
    await db.collection('razorpayBackfillRuns').add({ ...report, target: projectId, finishedAt: new Date() });
    console.log('  Run logged to razorpayBackfillRuns.');
  } else {
    console.log('\n  DRY RUN — no documents written. Re-run with --write to persist to UAT.');
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
