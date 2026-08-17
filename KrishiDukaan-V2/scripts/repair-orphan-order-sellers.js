/**
 * Backfills the seller key on orders that were written with none.
 *
 * A paid order with `sellerId: ''` matches no seller-dashboard query — web's
 * fetchIncomingOrdersForSeller filters `sellerId`/`sellerPhone`, mobile's
 * DashboardRepository filters `sellerPhone == phone` / `sellerId == uid` — so
 * it is invisible to the retailer forever despite the money having landed.
 *
 * Two distinct causes produce these, and both are repaired here:
 *
 *   1. The ordered product carries its owner directly (ownerPhone/retailerId/
 *      …). Recover from the product doc itself.
 *
 *   2. The ordered product is a CANONICAL catalog doc (source: 'admin') with
 *      no ownership fields at all, flagged online_delivery. The real seller
 *      lives on a separate copy doc (source: 'admin_assigned' /
 *      'manufacturer_assigned' / 'retailer_inventory_copy') that the
 *      marketplace merges in by product name. Recover from that sibling — and
 *      only when it is UNAMBIGUOUS, i.e. every candidate copy resolves to the
 *      same owner. Two retailers stocking the same catalog product means the
 *      order genuinely cannot be attributed offline; those are reported, never
 *      guessed at.
 *
 * Usage:
 *   node scripts/repair-orphan-order-sellers.js            # dry run (default)
 *   node scripts/repair-orphan-order-sellers.js --apply    # write
 *
 * Auth: reuses the Firebase CLI login (`firebase login`). Read-only unless
 * --apply is passed. Idempotent — orders that already have a sellerId are
 * skipped, so re-running is harmless.
 */
const fs = require('fs');

const APPLY = process.argv.includes('--apply');
const PROJECT = process.env.FIREBASE_PROJECT_ID || 'krishidukan-e8315';
const CFG = (process.env.HOME || process.env.USERPROFILE) + '/.config/configstore/firebase-tools.json';
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const PHONE_RE = /^\+?[0-9]{10,13}$/;
/** Order of preference: a phone first, because the security rule for a seller
 *  reading their own order is `sellerPhone == myPhone()`. */
const OWNER_FIELDS = ['retailerPhone', 'ownerPhone', 'retailerId', 'ownerId'];
/** Sources that mark a doc as a seller's copy of a canonical catalog product.
 *  Kept in sync with CatalogRepository.fetchAllMergedProducts (mobile) and
 *  the web merge in app/firebase.ts. */
const COPY_SOURCES = new Set(['admin_assigned', 'manufacturer_assigned', 'retailer_inventory_copy']);

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

async function patch(token, path, data) {
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${k}`).join('&');
  const body = { fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { stringValue: v }])) };
  const res = await fetch(`${BASE}/${path}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${j.error.status}: ${j.error.message}`);
}

/** First non-empty OWNER_FIELDS value on a doc, or ''. */
const ownerOf = (d) => {
  for (const f of OWNER_FIELDS) {
    const v = String(d?.[f] ?? '').trim();
    if (v) return v;
  }
  return '';
};
/** First OWNER_FIELDS value that actually looks like a phone, or ''. */
const phoneOf = (d) =>
  OWNER_FIELDS.map((f) => String(d?.[f] ?? '').trim()).find((v) => PHONE_RE.test(v)) ?? '';

const nameKey = (s) => String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');

(async () => {
  const token = await accessToken();
  const orders = await getAll(token, 'orders');
  const orphans = orders.filter((o) => !String(o.sellerId ?? '').trim());

  console.log(`${orders.length} orders scanned — ${orphans.length} with no seller key.`);
  if (orphans.length === 0) return;

  // The sibling-copy lookup needs the whole products collection indexed by
  // name; fetch it once rather than per-order.
  const products = await getAll(token, 'products');
  const byId = new Map(products.map((p) => [p.id, p]));
  const copiesByName = new Map();
  for (const p of products) {
    if (!COPY_SOURCES.has(p.source)) continue;
    if (!ownerOf(p)) continue;
    const k = nameKey(p.name);
    if (!k) continue;
    if (!copiesByName.has(k)) copiesByName.set(k, []);
    copiesByName.get(k).push(p);
  }
  console.log(`${products.length} products indexed — ${copiesByName.size} names have an owned seller copy.`);

  console.log(APPLY ? '\nMODE: APPLY (writing)\n' : '\nMODE: DRY RUN — pass --apply to write\n');

  let fixed = 0;
  let unresolved = 0;

  for (const o of orphans) {
    const label = o.invoiceNumber || o.id.slice(0, 8).toUpperCase();
    const productId = o.items?.[0]?.catalogId || o.items?.[0]?.listingId || o.items?.[0]?.productId;

    if (!productId) {
      console.log(`  ${label}: SKIP — no product id on the line items`);
      unresolved++;
      continue;
    }

    const prod = byId.get(productId);
    if (!prod) {
      console.log(`  ${label}: SKIP — products/${productId} not found`);
      unresolved++;
      continue;
    }

    // ── 1. The ordered doc owns itself.
    let owner = ownerOf(prod);
    let phone = phoneOf(prod);
    let via = `products/${productId}`;
    let sellerName = String(prod.store ?? prod.storeName ?? '').trim();

    // ── 2. Ownerless canonical doc — resolve through its seller copies.
    if (!owner) {
      const candidates = copiesByName.get(nameKey(prod.name)) ?? [];
      const distinctOwners = [...new Set(candidates.map(ownerOf))];

      if (distinctOwners.length === 0) {
        console.log(
          `  ${label}: SKIP — products/${productId} ("${String(prod.name).slice(0, 50)}") ` +
          `has no owner and no owned seller copy exists`
        );
        unresolved++;
        continue;
      }
      if (distinctOwners.length > 1) {
        console.log(
          `  ${label}: SKIP — AMBIGUOUS, ${distinctOwners.length} sellers stock ` +
          `"${String(prod.name).slice(0, 50)}": ${distinctOwners.join(', ')}. ` +
          `Attribute this one by hand.`
        );
        unresolved++;
        continue;
      }

      const copy = candidates.find((c) => ownerOf(c) === distinctOwners[0]);
      owner = ownerOf(copy);
      phone = phoneOf(copy);
      via = `products/${copy.id} (source: ${copy.source}, matched by name)`;
      sellerName = String(copy.store ?? copy.storeName ?? '').trim();
    }

    // Prefer a phone for sellerPhone; a UID there would make the seller's
    // read rule (`sellerPhone == myPhone()`) permanently unsatisfiable.
    const update = { sellerId: owner, sellerPhone: phone };
    // Only fill a blank sellerName — never overwrite one the order already has.
    if (sellerName && !String(o.sellerName ?? '').trim()) update.sellerName = sellerName;

    console.log(
      `  ${label}: sellerId '' -> '${owner}'` +
      (phone ? `, sellerPhone '' -> '${phone}'` : ', sellerPhone left empty (no phone on the owner doc)') +
      (update.sellerName ? `, sellerName '' -> '${update.sellerName}'` : '') +
      `  [via ${via}]`
    );

    if (APPLY) {
      await patch(token, `orders/${o.id}`, update);
      fixed++;
    }
  }

  console.log(
    `\n${APPLY ? `Repaired ${fixed}` : `Would repair ${orphans.length - unresolved}`} order(s).` +
    (unresolved ? ` ${unresolved} could not be resolved.` : '')
  );
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
