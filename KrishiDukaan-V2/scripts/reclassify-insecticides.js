/**
 * DRY-RUN classifier for products that are almost certainly Insecticides but are
 * stored under "Other" (or a non-canonical custom category), plus an inventory
 * of every product still filed under "Sprayers".
 *
 * WHY THIS EXISTS
 * "Insecticides" only recently became a first-class category (it lives in
 * settings/productSchema and now in the web/mobile category lists). Before that,
 * a seller adding an insecticide had to pick "Other" and type a name, so those
 * products match no dropdown option and the edit form shows them as "Other".
 * This script surfaces the likely ones so a human can confirm before any rewrite.
 *
 * It is a SUGGESTION tool — matching is keyword-based and deliberately
 * conservative. Nothing is written without --apply, and even then it only
 * rewrites the `category` string (same mechanism as normalize-product-categories.js).
 *
 * The "Sprayers" section is informational only: the Sprayers filter chip was
 * removed but the category is kept (products stay reachable by search/link), so
 * NOTHING is proposed for them — they're listed purely so you can see how many
 * exist and decide later.
 *
 * Usage:
 *   node scripts/reclassify-insecticides.js            # dry run (default)
 *   node scripts/reclassify-insecticides.js --apply    # write the Insecticides reclassifications
 *
 * Auth: reuses the Firebase CLI login (`firebase login`). If it reports an
 * expired token, run `firebase login --reauth` first.
 */
const fs = require('fs');

const APPLY = process.argv.includes('--apply');
const PROJECT = process.env.FIREBASE_PROJECT_ID || 'krishidukan-e8315';
const CFG = (process.env.HOME || process.env.USERPROFILE) + '/.config/configstore/firebase-tools.json';
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// Common insecticide active ingredients + generic words. A product whose name or
// stored text contains one of these, AND which is NOT already in a canonical
// chemical category, is proposed as "Insecticides" for human review.
const INSECTICIDE_HINTS = [
  'insecticide', 'कीटकनाशक', 'कीटनाशक',
  'imidacloprid', 'acetamiprid', 'thiamethoxam', 'clothianidin', 'dinotefuran',
  'chlorpyrifos', 'cypermethrin', 'lambda', 'cyhalothrin', 'deltamethrin',
  'emamectin', 'fipronil', 'profenofos', 'monocrotophos', 'dimethoate',
  'spinosad', 'spinetoram', 'buprofezin', 'flubendiamide', 'chlorantraniliprole',
  'cyantraniliprole', 'acephate', 'carbofuran', 'quinalphos', 'dichlorvos',
  'malathion', 'fenvalerate', 'thiacloprid', 'pymetrozine', 'diafenthiuron',
  'indoxacarb', 'novaluron', 'fipronil', 'bifenthrin', 'abamectin',
];

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
  return raw.map((v) => v.mapValue?.fields?.name?.stringValue).filter(Boolean);
}

/** All searchable text on a product, lowercased. */
function haystack(p) {
  const parts = [p.name, p.description, p.category];
  const ci = p.categoryInfo;
  if (ci && typeof ci === 'object') {
    for (const v of Object.values(ci)) {
      if (Array.isArray(v)) parts.push(v.join(' '));
      else if (v != null) parts.push(String(v));
    }
  }
  if (Array.isArray(p.composition)) {
    for (const c of p.composition) parts.push(`${c?.name ?? ''} ${c?.value ?? ''}`);
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function looksLikeInsecticide(p) {
  const text = haystack(p);
  return INSECTICIDE_HINTS.some((h) => text.includes(h));
}

async function main() {
  const token = await accessToken();
  console.log(`Project: ${PROJECT}`);
  console.log(APPLY ? 'MODE: APPLY (writing Insecticides reclassifications)\n' : 'MODE: DRY RUN (no writes — pass --apply to write)\n');

  const canonical = await canonicalCategories(token);
  const canonicalLower = new Set(canonical.map((c) => c.toLowerCase()));
  // Chemical categories whose products we never auto-move — a chosen chemical
  // category is a human's deliberate classification, not a gap to fill.
  const chemical = new Set(['pesticides', 'insecticides', 'fungicides', 'herbicides']);
  console.log(`Canonical categories (${canonical.length}): ${canonical.join(', ')}\n`);

  const products = await getAll(token, 'products');
  console.log(`Scanned ${products.length} products.\n`);

  const proposed = [];   // → Insecticides
  const sprayers = [];   // informational only

  for (const p of products) {
    const current = String(p.category ?? '').trim();
    const lower = current.toLowerCase();

    if (lower === 'sprayers') {
      sprayers.push({ id: p.id, name: p.name ?? '(no name)', current });
      continue;
    }

    // An exact spelling/case variant of "insecticide(s)" is a safe mechanical
    // fix (normalize-product-categories.js only handles exact case variants of
    // categories it already knows, which previously excluded Insecticides).
    const isVariantSpelling = /^insecticides?$/.test(lower) && current !== 'Insecticides';

    // Otherwise only suggest a move when it's NOT already a deliberate chemical
    // category AND the text clearly reads as an insecticide.
    const isGap = (lower === 'other' || !canonicalLower.has(lower)) && !chemical.has(lower);

    if (isVariantSpelling || (isGap && looksLikeInsecticide(p))) {
      proposed.push({
        id: p.id,
        name: p.name ?? '(no name)',
        current: current || '(empty)',
        to: 'Insecticides',
        reason: isVariantSpelling ? 'spelling/case variant' : 'keyword match',
      });
    }
  }

  console.log(`── Proposed → Insecticides: ${proposed.length} product(s)`);
  console.log('   (review each — keyword matches are suggestions, not certainties)\n');
  for (const r of proposed) {
    console.log(`   ${r.id}`);
    console.log(`      name    : ${r.name}`);
    console.log(`      current : ${r.current}   →   ${r.to}   [${r.reason}]`);
  }

  console.log(`\n── Products still under "Sprayers": ${sprayers.length} (NO change — category kept, chip hidden)`);
  for (const s of sprayers) {
    console.log(`   ${s.id}  ${s.name}`);
  }

  if (!APPLY) {
    console.log('\nDry run complete — no writes made. Re-run with --apply to perform the Insecticides reclassifications.');
    console.log('Sprayers are never written by this script.');
    return;
  }

  let done = 0;
  for (const r of proposed) {
    await patchCategory(token, r.id, r.to);
    done++;
    if (done % 25 === 0) console.log(`   …${done}/${proposed.length}`);
  }
  console.log(`\nDone. Reclassified ${done} product(s) to Insecticides. Sprayers left untouched.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
