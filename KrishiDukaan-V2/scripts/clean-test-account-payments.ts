/**
 * Clean abandoned/failed payment records for a fixed set of test/internal
 * accounts — "Customer Payments data sanity".
 *
 * Scope & safety invariants (deliberately conservative):
 *  - Reuses the SAME classifier the Admin → Payments dashboard uses
 *    (app/lib/payments-unify.ts → buildRows), so "abandoned"/"failed" here means
 *    exactly what an admin sees on screen. No second copy of the rules.
 *  - Deletes ONLY records whose unified category is `abandoned` or `failed`.
 *    Preserves `successful` (captured), `refunded` / partially-refunded,
 *    `pending` and `unresolved`.
 *  - Works at ORDER granularity: a razorpay order is selected for deletion ONLY
 *    when EVERY record tied to it is abandoned/failed. Any order that also has a
 *    successful / refunded / pending / unresolved record is SKIPPED and flagged
 *    for manual review — a good transaction can never be removed as collateral.
 *  - Touches only `razorpayPayments` and `paymentAttempts`. It NEVER touches
 *    `orders`, `users`, `manufacturers`, `retailers` or any account doc.
 *  - DRY RUN by default. Writes a JSON manifest to scripts/out/ either way.
 *    Deletes only with `--apply`.
 *
 * Usage:
 *   npx tsx scripts/clean-test-account-payments.ts                 # DRY RUN (prod)
 *   npx tsx scripts/clean-test-account-payments.ts --apply         # perform deletion
 *   npx tsx scripts/clean-test-account-payments.ts --project=karan-arjun-uat
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildRows,
  mapAttempt,
  mapPayment,
  type Attempt,
  type Payment,
  type PaymentRow,
  type Category,
} from '../app/lib/payments-unify';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const projectId = args.find((a) => a.startsWith('--project='))?.split('=')[1] ?? 'krishidukan-e8315';

// Accounts to clean. Matching is on the buyer's display name as it appears on
// the payment record (userName / customerName / razorpay contact), normalized.
// `names` lists every stored variant that maps to the account — e.g. account
// "Kunal Deore Agro Agency" is stored on its records simply as "kunal Deore"
// (confirmed by phone +918767263557).
const TARGETS: { account: string; names: string[] }[] = [
  { account: 'Arjun Admin', names: ['Arjun Admin'] },
  { account: 'Sai Influencer Test', names: ['Sai Influencer Test'] },
  { account: 'Sai Surve Fiinny', names: ['Sai Surve Fiinny'] },
  { account: 'Kunal Deore Agro Agency', names: ['Kunal Deore Agro Agency', 'Kunal Deore'] },
  { account: 'Karan Tanpure', names: ['Karan Tanpure'] },
];
const TARGET_NAMES = TARGETS.map((t) => t.account);

// Categories we are authorized to delete. Everything else is preserved.
const DELETABLE: ReadonlySet<Category> = new Set<Category>(['abandoned', 'failed']);
const KEEP: ReadonlySet<Category> = new Set<Category>([
  'successful',
  'refunded',
  'pending',
  'unresolved',
]);

const norm = (s: string | null | undefined) =>
  String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

const targetMatchers = TARGETS.map((t) => ({ account: t.account, names: t.names.map(norm) }));

/** The account a row's buyer name maps to, or null. Exact normalized match, OR
 *  the target name fully contained in the row name. Never matches on a bare
 *  first name — the whole target string must be present. */
function matchesTarget(name: string): string | null {
  const n = norm(name);
  for (const t of targetMatchers) {
    for (const tn of t.names) {
      if (n === tn || n.includes(tn)) return t.account;
    }
  }
  return null;
}

if (getApps().length === 0) initializeApp({ projectId });
const db: Firestore = getFirestore();

type Group = {
  orderId: string;
  matchedAccount: string;
  name: string;
  phone: string | null;
  categories: Category[];
  hasKeep: boolean; // order has a preserved (successful/refunded/pending/unresolved) record
  hasAttempt: boolean; // whether paymentAttempts/{orderId} exists
  // Deletion selection (per-record):
  rzpToDelete: string[]; // razorpayPayments doc ids with a deletable category
  deleteAttempt: boolean; // delete paymentAttempts/{orderId} — only when order is fully deletable
};

async function main() {
  console.log(`\n=== Clean test-account payments ===`);
  console.log(`project : ${projectId}`);
  console.log(`mode    : ${APPLY ? 'APPLY (will delete)' : 'DRY RUN (no writes)'}`);
  console.log(`accounts: ${TARGET_NAMES.join(' | ')}\n`);

  const [paySnap, attSnap] = await Promise.all([
    db.collection('razorpayPayments').get(),
    db.collection('paymentAttempts').get(),
  ]);

  const payments: Payment[] = paySnap.docs.map((d) => mapPayment(d.id, d.data()));
  const attempts: Attempt[] = attSnap.docs.map((d) => mapAttempt(d.id, d.data()));
  const attemptIds = new Set(attempts.map((a) => a.razorpayOrderId));

  const rows = buildRows(payments, attempts, Date.now());

  // Keep only rows belonging to a target account.
  const matched = rows
    .map((r) => ({ r, account: matchesTarget(r.name) }))
    .filter((x): x is { r: PaymentRow; account: string } => x.account !== null);

  // Group by orderId (fallback to the row key for the rare null-orderId row).
  const byOrder = new Map<string, Group>();
  for (const { r, account } of matched) {
    const key = r.orderId ?? r.key;
    let g = byOrder.get(key);
    if (!g) {
      g = {
        orderId: key,
        matchedAccount: account,
        name: r.name,
        phone: r.phone,
        categories: [],
        hasKeep: false,
        hasAttempt: r.orderId ? attemptIds.has(r.orderId) : false,
        rzpToDelete: [],
        deleteAttempt: false,
      };
      byOrder.set(key, g);
    }
    g.categories.push(r.category);
    if (KEEP.has(r.category)) g.hasKeep = true;
    // A deletable gateway record → delete that specific razorpayPayments doc.
    if (DELETABLE.has(r.category) && r.source === 'razorpay' && r.paymentId) {
      g.rzpToDelete.push(r.paymentId);
    }
  }

  // The paymentAttempts doc is SHARED by the whole order (one doc per order). It
  // is removed ONLY when the order has no preserved record — i.e. the order is
  // entirely abandoned/failed. In a mixed order it is kept, so the preserved
  // payment still has its basket/customer context.
  const affected: Group[] = [];
  for (const g of byOrder.values()) {
    g.deleteAttempt = g.hasAttempt && !g.hasKeep;
    if (g.rzpToDelete.length > 0 || g.deleteAttempt) affected.push(g);
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  const perAccount = new Map<string, { orders: number; rzpDocs: number; attemptDocs: number }>();
  let rzpDocCount = 0;
  let attemptDocCount = 0;
  let mixedCount = 0;
  for (const g of affected) {
    rzpDocCount += g.rzpToDelete.length;
    if (g.deleteAttempt) attemptDocCount += 1;
    if (g.hasKeep) mixedCount += 1;
    const a = perAccount.get(g.matchedAccount) ?? { orders: 0, rzpDocs: 0, attemptDocs: 0 };
    a.orders += 1;
    a.rzpDocs += g.rzpToDelete.length;
    a.attemptDocs += g.deleteAttempt ? 1 : 0;
    perAccount.set(g.matchedAccount, a);
  }

  console.log(`Matched records for target accounts : ${matched.length}`);
  console.log(`Orders with records to delete       : ${affected.length}  (of which mixed: ${mixedCount})`);
  console.log(`  → razorpayPayments docs to delete : ${rzpDocCount}`);
  console.log(`  → paymentAttempts docs to delete  : ${attemptDocCount}\n`);

  console.log('Per account (to delete):');
  for (const name of TARGET_NAMES) {
    const a = perAccount.get(name);
    console.log(
      `  ${name.padEnd(26)} orders=${a?.orders ?? 0}  rzp=${a?.rzpDocs ?? 0}  attempt=${a?.attemptDocs ?? 0}`,
    );
  }

  console.log('\n--- Records to be deleted (preserved records left in place) ---');
  for (const g of affected) {
    console.log(
      `  [${g.matchedAccount}] order=${g.orderId}  name="${g.name}" phone=${g.phone ?? '-'}  ` +
        `cats=[${g.categories.join(',')}]${g.hasKeep ? ' (MIXED)' : ''}  ` +
        `delRzp=[${g.rzpToDelete.join(',') || '-'}]  delAttempt=${g.deleteAttempt ? 'yes' : 'no'}`,
    );
  }

  // Distinct matched names — sanity check that matching did not over-reach.
  const distinctNames = new Map<string, number>();
  for (const { r } of matched) distinctNames.set(r.name, (distinctNames.get(r.name) ?? 0) + 1);
  console.log('\n--- Distinct buyer names matched (verify no over-match) ---');
  for (const [n, c] of [...distinctNames.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  "${n}" × ${c}`);
  }

  // ── Manifest ──────────────────────────────────────────────────────────────────
  const outDir = path.resolve(process.cwd(), 'scripts/out');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const manifestPath = path.join(outDir, `clean-test-account-payments-${stamp}.json`);
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        project: projectId,
        mode: APPLY ? 'apply' : 'dry-run',
        generatedAt: new Date().toISOString(),
        targetAccounts: TARGET_NAMES,
        summary: {
          matchedRecords: matched.length,
          affectedOrders: affected.length,
          mixedOrders: mixedCount,
          razorpayPaymentsDocs: rzpDocCount,
          paymentAttemptsDocs: attemptDocCount,
        },
        toDelete: affected.map((g) => ({
          account: g.matchedAccount,
          orderId: g.orderId,
          name: g.name,
          phone: g.phone,
          categories: g.categories,
          mixed: g.hasKeep,
          razorpayPaymentIds: g.rzpToDelete,
          deleteAttemptDoc: g.deleteAttempt ? g.orderId : null,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`\nManifest written: ${manifestPath}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing deleted. Re-run with --apply to perform the deletion.');
    process.exit(0);
  }

  // ── Backup (full doc data) so the deletion is reversible ──────────────────────
  const rzpDataById = new Map(paySnap.docs.map((d) => [d.id, d.data()]));
  const attDataById = new Map(attSnap.docs.map((d) => [d.id, d.data()]));
  const backup: { collection: string; id: string; data: unknown }[] = [];
  for (const g of affected) {
    for (const pid of g.rzpToDelete) {
      if (rzpDataById.has(pid)) backup.push({ collection: 'razorpayPayments', id: pid, data: rzpDataById.get(pid) });
    }
    if (g.deleteAttempt && attDataById.has(g.orderId)) {
      backup.push({ collection: 'paymentAttempts', id: g.orderId, data: attDataById.get(g.orderId) });
    }
  }
  const backupPath = path.join(outDir, `clean-test-account-payments-${stamp}.backup.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`Backup of ${backup.length} full documents written: ${backupPath}`);

  // ── Delete ────────────────────────────────────────────────────────────────────
  console.log('\nAPPLYING deletions...');
  let batch = db.batch();
  let n = 0;
  let deleted = 0;
  const flush = async () => {
    if (n > 0) {
      await batch.commit();
      deleted += n;
      batch = db.batch();
      n = 0;
    }
  };
  for (const g of affected) {
    for (const pid of g.rzpToDelete) {
      batch.delete(db.collection('razorpayPayments').doc(pid));
      if (++n >= 400) await flush();
    }
    if (g.deleteAttempt) {
      batch.delete(db.collection('paymentAttempts').doc(g.orderId));
      if (++n >= 400) await flush();
    }
  }
  await flush();
  console.log(`Done. Deleted ${deleted} documents across ${affected.length} orders.`);
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
