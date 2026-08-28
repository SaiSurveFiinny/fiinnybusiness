/**
 * Merges case-variant product categories onto their canonical spelling.
 *
 * A live scan found the SAME category stored under two different spellings —
 * `pesticides` (46 products) and `Pesticides` (37), plus `seeds`/`Seeds` and
 * `fertilizers`/`Fertilizers`. Firestore string equality is case-sensitive, so
 * every category filter, dropdown match and per-category count silently saw
 * these as two unrelated categories and returned roughly half the products.
 *
 * Canonical spellings come from `settings/productSchema` (the doc both the web
 * dashboard and the mobile app now read), so this can never invent a category
 * the apps don't offer.
 *
 * Only ever changes LETTER CASE — a product whose category differs from a
 * canonical one by anything more than case is reported and left alone, because
 * that's a judgement call (e.g. "Crop Care / Plant Protection") rather than a
 * mechanical fix.
 *
 * Usage:
 *   node scripts/normalize-product-categories.js            # dry run (default)
 *   node scripts/normalize-product-categories.js --apply    # write
 *
 * Auth: reuses the Firebase CLI login (`firebase login`). Idempotent — a
 * product already on the canonical spelling is skipped, so re-running is safe.
 */
const fs = require('fs');

const APPLY = process.argv.includes('--apply');
const PROJECT = process.env.FIREBASE_PROJECT_ID || 'krishidukan-e8315';
const CFG = (process.env.HOME || process.env.USERPROFILE) + '/.config/configstore/firebase-tools.json';
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

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
    throw new Error('Could not refresh the Firebase CLI token. Run `firebase login --reauth` first.');
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
    for (const d of j.documents || []) {
      out.push({ id: d.name.split('/').pop(), ...fields(d.fields || {}) });
    }
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function patchCategory(token, docId, category) {
  const path = `products/${encodeURIComponent(docId)}`;
  const res = await fetch(`${BASE}/${path}?updateMask.fieldPaths=category`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { category: { stringValue: category } } }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${j.error.status}: ${j.error.message}`);
}

async function canonicalCategories(token) {
  const res = await fetch(`${BASE}/settings/productSchema`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await res.json();
  if (j.error) throw new Error(`settings/productSchema: ${j.error.message}`);
  const raw = j.fields?.categories?.arrayValue?.values ?? [];
  const names = raw
    .map((v) => v.mapValue?.fields?.name?.stringValue)
    .filter(Boolean);
  if (names.length === 0) {
    throw new Error('settings/productSchema has no categories — run seed-product-schema.js first.');
  }
  return names;
}

async function main() {
  const token = await accessToken();
  console.log(`Project: ${PROJECT}`);
  console.log(APPLY ? 'MODE: APPLY (writing)\n' : 'MODE: DRY RUN (no writes — pass --apply to write)\n');

  const canonical = await canonicalCategories(token);
  const byLower = new Map(canonical.map((c) => [c.toLowerCase(), c]));
  console.log(`Canonical categories (${canonical.length}): ${canonical.join(', ')}\n`);

  const products = await getAll(token, 'products');
  console.log(`Scanned ${products.length} products.\n`);

  const toFix = [];
  const unmatched = new Map();

  for (const p of products) {
    const current = String(p.category ?? '').trim();
    if (!current) continue;
    const target = byLower.get(current.toLowerCase());
    if (!target) {
      unmatched.set(current, (unmatched.get(current) || 0) + 1);
      continue;
    }
    // Differs only by case (or surrounding whitespace) — safe to rewrite.
    if (target !== p.category) toFix.push({ id: p.id, from: p.category, to: target });
  }

  const grouped = new Map();
  for (const f of toFix) {
    const key = `${f.from} -> ${f.to}`;
    grouped.set(key, (grouped.get(key) || 0) + 1);
  }

  console.log(`── Case-variant fixes: ${toFix.length} product(s)`);
  for (const [key, count] of [...grouped.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(count).padStart(5)}  ${key}`);
  }

  if (unmatched.size > 0) {
    console.log(`\n── Left alone (not a case variant of any canonical category):`);
    for (const [name, count] of [...unmatched.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${String(count).padStart(5)}  "${name}"`);
    }
    console.log('   → these need a human decision; nothing was changed for them.');
  }

  if (!APPLY) {
    console.log('\nDry run complete — no writes made. Re-run with --apply to perform them.');
    return;
  }

  let done = 0;
  for (const f of toFix) {
    await patchCategory(token, f.id, f.to);
    done++;
    if (done % 25 === 0) console.log(`   …${done}/${toFix.length}`);
  }
  console.log(`\nDone. Updated ${done} product(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
