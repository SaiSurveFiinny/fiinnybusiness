/**
 * One-off cleanup of TEST orders from the prod `orders` collection.
 *
 * Deletion rule (the ONLY criterion — never inferred from name/phone/shop/
 * payment/invoice): an order is a test order iff its createdAt is on or before
 * 2026-07-31 23:59:59 IST. Equivalently, delete when
 *
 *     createdAt < 2026-08-01T00:00:00+05:30  (= 2026-07-31T18:30:00Z)
 *
 * Everything dated 2026-08-01 IST or later is preserved untouched.
 *
 * Scope: only the top-level `orders` collection. Orders have no subcollections;
 * the invoice is a field on the order doc plus a PDF in Firebase Storage, and
 * the Razorpay payment reference is just a map on the order. This script does
 * NOT touch Razorpay, users, products, inventory, invoices in Storage, or any
 * other collection, and triggers no app business logic (pure Firestore REST
 * deletes — no notifications / refunds / inventory writes).
 *
 * Orders with NO createdAt (undeterminable date) are NEVER deleted; they are
 * reported separately for manual review.
 *
 * Usage:
 *   node scripts/cleanup-test-orders.js            # dry run — list + count only
 *   node scripts/cleanup-test-orders.js --apply    # actually delete
 *
 * Auth: reuses the Firebase CLI login (`firebase login`). Read-only unless
 * --apply is passed. Idempotent — re-running after a successful apply finds
 * nothing left to delete.
 */
const fs = require('fs');

const APPLY = process.argv.includes('--apply');
const PROJECT = process.env.FIREBASE_PROJECT_ID || 'krishidukan-e8315';
const CFG = (process.env.HOME || process.env.USERPROFILE) + '/.config/configstore/firebase-tools.json';
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// End-of-July-2026 in IST, expressed as a UTC instant. Anything strictly before
// this instant is a test order; anything at/after it is preserved.
const CUTOFF = new Date('2026-08-01T00:00:00+05:30'); // 2026-07-31T18:30:00.000Z
const IST = { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };

async function accessToken() {
  const { tokens } = JSON.parse(fs.readFileSync(CFG, 'utf8'));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: tokens.refresh_token, grant_type: 'refresh_token',
    }),
  });
  const j = await res.json();
  if (!j.access_token) {
    throw new Error(
      'Could not refresh the Firebase CLI token. Run `firebase login --reauth` first.\n' +
      JSON.stringify(j)
    );
  }
  return j.access_token;
}

function val(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return fields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
  return v;
}
const fields = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, val(v)]));

async function getAll(token, collection) {
  const out = [];
  let pageToken = '';
  do {
    const url = `${BASE}/${collection}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const j = await res.json();
    if (j.error) throw new Error(`${j.error.status}: ${j.error.message}`);
    for (const d of j.documents || []) out.push({ id: d.name.split('/').pop(), ...fields(d.fields || {}) });
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

/** Bulk-delete via the Firestore :commit endpoint, in batches of 500. */
async function deleteAll(token, ids) {
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const body = {
      writes: chunk.map((id) => ({
        delete: `projects/${PROJECT}/databases/(default)/documents/orders/${id}`,
      })),
    };
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:commit`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    const j = await res.json();
    if (j.error) throw new Error(`${j.error.status}: ${j.error.message}`);
    console.log(`  committed delete batch ${i / 500 + 1} (${chunk.length} docs)`);
  }
}

const inr = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const grandTotal = (o) => o.grandTotal ?? o.total ?? ((o.subtotal ?? 0) + (o.deliveryCharge ?? 0) + (o.totalGst ?? 0));

function row(o) {
  const created = o.createdAt ? new Date(o.createdAt) : null;
  const dateStr = created ? created.toLocaleString('en-IN', IST) + ' IST' : '(no createdAt)';
  const inv = o.invoiceNumber || `INV-${o.id.slice(0, 8).toUpperCase()}`;
  const cust = [o.customerName, o.customerPhone].filter(Boolean).join(' · ') || '—';
  const shop = o.sellerName || o.sellerId || '—';
  const pay = o.payment?.status || 'none';
  const rzp = o.payment?.razorpayPaymentId || '—';
  return `  ${o.id}  | ${inv} | ${dateStr} | ${cust} | ${shop} | ${inr(grandTotal(o))} | pay:${pay} | rzp:${rzp}`;
}

(async () => {
  const token = await accessToken();
  const orders = await getAll(token, 'orders');
  console.log(`Project: ${PROJECT}`);
  console.log(`Cutoff : delete createdAt < ${CUTOFF.toISOString()} (2026-07-31 23:59:59 IST)`);
  console.log(`${orders.length} orders scanned in /orders.\n`);

  const toDelete = [];
  const noDate = [];
  const keep = [];
  for (const o of orders) {
    if (!o.createdAt) { noDate.push(o); continue; }
    if (new Date(o.createdAt) < CUTOFF) toDelete.push(o);
    else keep.push(o);
  }

  toDelete.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  console.log('================ ORDERS TO DELETE (createdAt <= 2026-07-31 IST) ================');
  console.log('  OrderID | Invoice | Date | Customer | Shop/Seller | Amount | Payment | RazorpayPaymentId');
  toDelete.forEach((o) => console.log(row(o)));
  console.log(`\n>>> ${toDelete.length} order(s) MATCH the deletion rule and WILL be deleted.`);

  if (noDate.length) {
    console.log('\n---------- ORDERS WITH NO createdAt (NOT deleted — manual review) ----------');
    noDate.forEach((o) => console.log(row(o)));
    console.log(`(${noDate.length} order(s) have no date and are left untouched.)`);
  }

  console.log(`\n${keep.length} order(s) dated 2026-08-01 IST or later will be PRESERVED.`);

  if (!APPLY) {
    console.log('\nMODE: DRY RUN — nothing deleted. Re-run with --apply to delete the above.');
    return;
  }

  if (toDelete.length === 0) {
    console.log('\nMODE: APPLY — nothing matches; no deletes performed.');
    return;
  }

  console.log('\nMODE: APPLY — deleting…');
  await deleteAll(token, toDelete.map((o) => o.id));

  // Verification re-query.
  const after = await getAll(token, 'orders');
  const stragglers = after.filter((o) => o.createdAt && new Date(o.createdAt) < CUTOFF);
  const survived = after.filter((o) => !o.createdAt || new Date(o.createdAt) >= CUTOFF);
  console.log('\n================ POST-DELETE VERIFICATION ================');
  console.log(`Orders remaining: ${after.length}`);
  console.log(`Test orders (<= 2026-07-31 IST) still present: ${stragglers.length} ${stragglers.length === 0 ? '✓ none' : '✗ PROBLEM'}`);
  console.log(`Orders preserved (Aug 1+ / no-date): ${survived.length} (expected ${keep.length + noDate.length})`);
  if (stragglers.length) stragglers.forEach((o) => console.log('  STILL PRESENT: ' + row(o)));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
