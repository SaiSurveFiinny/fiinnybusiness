/**
 * Repairs two gaps left by the mobile app's older add-product flow.
 *
 * FIX A — missing `inventory` docs.
 *   Mobile's DashboardRepository.addListing used to write only the `products`
 *   doc. The web dashboard's inventory table joins products -> inventory by
 *   productId and silently drops any product with no matching inventory doc,
 *   so anything a retailer added from mobile was invisible on web (visible in
 *   the marketplace and on mobile, which read the product doc directly).
 *   addListing now writes both; this backfills the products already stranded.
 *
 * FIX B — missing account-level `onlineDelivery` flag.
 *   The web Delivery Settings page gates its whole charges/slabs UI on
 *   users/{phone}.onlineDelivery, and a MISSING field reads as false. Nothing
 *   on mobile ever wrote it, so a retailer who ticked "online delivery" while
 *   adding a product on mobile still saw "Online delivery disabled" and could
 *   never reach their delivery charges. The mobile flows now set it; this
 *   backfills sellers who already have online products but no flag.
 *
 * Usage:
 *   node scripts/repair-online-delivery-and-inventory.js            # dry run (default)
 *   node scripts/repair-online-delivery-and-inventory.js --apply    # write
 *
 * Auth: reuses the Firebase CLI login (`firebase login`). Read-only unless
 * --apply is passed. Idempotent — anything already repaired is skipped, so
 * re-running is harmless.
 */
const fs = require('fs');

const APPLY = process.argv.includes('--apply');
const PROJECT = process.env.FIREBASE_PROJECT_ID || 'krishidukan-e8315';
const CFG = (process.env.HOME || process.env.USERPROFILE) + '/.config/configstore/firebase-tools.json';
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

/** Sources that mark a doc as a seller's OWN listing (not a canonical catalog
 *  entry and not a manufacturer assignment, which creates its own inventory). */
const SELF_LISTED_SOURCES = new Set(['retailer_inventory_copy', 'retailer_inventory']);
/** Default reorder threshold used by both web createProductAndInventory and
 *  mobile addListing. */
const REORDER_THRESHOLD = 5;

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

/** JS value -> Firestore REST typed value. */
function toVal(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  return { stringValue: String(v) };
}

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

/**
 * Merge-patch specific fields onto an existing doc (creates it if absent).
 *
 * `collection` and `docId` are passed separately and the id is percent-encoded,
 * because phone-keyed ids start with "+" — which a URL path decodes to a SPACE.
 * Interpolating one raw produced `users/ 919370798157` and CREATED that doc
 * instead of updating `users/+919370798157`.
 */
async function patch(token, collection, docId, data) {
  const path = `${collection}/${encodeURIComponent(docId)}`;
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${k}`).join('&');
  const body = { fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toVal(v)])) };
  const res = await fetch(`${BASE}/${path}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${j.error.status}: ${j.error.message}`);
}

/** Create a doc with a server-assigned id. */
async function create(token, collection, data) {
  const body = { fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toVal(v)])) };
  const res = await fetch(`${BASE}/${collection}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${j.error.status}: ${j.error.message}`);
  return j.name.split('/').pop();
}

/** The phone a seller is keyed by, preferring phone-shaped fields. */
const PHONE_RE = /^\+?[0-9]{10,13}$/;
function sellerPhoneOf(p) {
  for (const f of ['retailerPhone', 'ownerPhone', 'sellerPhone']) {
    const v = String(p?.[f] ?? '').trim();
    if (PHONE_RE.test(v)) return v;
  }
  return '';
}

async function main() {
  const token = await accessToken();
  console.log(`Project: ${PROJECT}`);
  console.log(APPLY ? 'MODE: APPLY (writing)\n' : 'MODE: DRY RUN (no writes — pass --apply to write)\n');

  const [products, inventory, users] = await Promise.all([
    getAll(token, 'products'),
    getAll(token, 'inventory'),
    getAll(token, 'users'),
  ]);
  console.log(`Loaded ${products.length} products, ${inventory.length} inventory, ${users.length} users\n`);

  // ── FIX A: products with no inventory doc ────────────────────────────────
  const haveInventory = new Set(inventory.map((i) => String(i.productId ?? '')));
  const orphans = products.filter(
    (p) =>
      SELF_LISTED_SOURCES.has(String(p.source ?? '')) &&
      p.isActive !== false &&
      !haveInventory.has(p.id),
  );

  console.log(`── FIX A: self-listed products missing an inventory doc: ${orphans.length}`);
  for (const p of orphans) {
    const phone = sellerPhoneOf(p);
    const stock = Number(p.stockQuantity ?? p.stock ?? 0) || 0;
    const price = Number(p.price ?? 0) || 0;
    console.log(
      `   ${p.id}  "${p.name ?? '(unnamed)'}"  seller=${phone || '(unknown)'}  stock=${stock}  ₹${price}`,
    );
    if (!APPLY) continue;
    const id = await create(token, 'inventory', {
      ownerId: p.ownerId ?? p.retailerId ?? phone,
      ownerPhone: phone || null,
      ownerType: 'retailer',
      retailerId: p.retailerId ?? p.ownerId ?? '',
      retailerPhone: phone || null,
      productId: p.id,
      stockQuantity: stock,
      sellingPrice: price,
      reorderThreshold: REORDER_THRESHOLD,
      isAvailable: stock > 0,
      updatedAt: new Date(),
    });
    // The collection is keyed by a server-assigned id, and both writers also
    // store that id in the body — mirror that so the doc matches the others.
    await patch(token, 'inventory', id, { id });
    console.log(`      -> created inventory/${id}`);
  }

  // ── FIX B: sellers with online products but no account-level flag ────────
  const onlineSellers = new Set();
  for (const p of products) {
    const isOnline = p.isOnline === true || String(p.sellMode ?? '') === 'online_delivery';
    if (!isOnline || p.isActive === false) continue;
    const phone = sellerPhoneOf(p);
    if (phone) onlineSellers.add(phone);
  }

  const usersByPhone = new Map(users.map((u) => [u.id, u]));
  const needFlag = [...onlineSellers].filter((phone) => {
    const u = usersByPhone.get(phone);
    // Only sellers. A missing user doc is left alone — nothing to unlock, and
    // creating one here would invent an account.
    if (!u) return false;
    if (!['retailer', 'manufacturer'].includes(String(u.role ?? ''))) return false;
    return u.onlineDelivery !== true;
  });

  console.log(`\n── FIX B: sellers with online products but onlineDelivery not set: ${needFlag.length}`);
  for (const phone of needFlag) {
    const u = usersByPhone.get(phone);
    console.log(`   ${phone}  role=${u.role}  ${u.shopName ?? u.name ?? ''}`);
    if (!APPLY) continue;
    await patch(token, 'users', phone, { onlineDelivery: true });
    console.log(`      -> users/${phone}.onlineDelivery = true`);
  }

  console.log(
    APPLY
      ? '\nDone.'
      : '\nDry run complete — no writes made. Re-run with --apply to perform them.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
