/**
 * Seeds `settings/productSchema` — the single source of truth for the product
 * category list and each category's structured "Category Info" fields.
 *
 * WHY THIS EXISTS
 * The category list used to be a hardcoded constant in TWO places: web's
 * PRODUCT_CATEGORIES (app/dashboard/_lib/category-info.ts) and a separate,
 * different Dart list in mobile's inventory_screen.dart. They had already
 * drifted (mobile offered Irrigation/Organic, which web didn't know and which
 * ZERO products use; web offered Bio-Stimulants/Sprayers/Other, which mobile
 * couldn't pick). Worse, a live scan of 2,010 active products found real
 * categories in NEITHER list — Adjuvants (333 products!), Fungicides,
 * Insecticides — so sellers had categories no dropdown could produce.
 *
 * Moving the list into Firestore means both platforms read one document, and a
 * new category can be added without shipping a mobile release.
 *
 * Both clients keep their hardcoded list as a FALLBACK, so a missing or
 * unreadable doc degrades to today's behaviour rather than an empty dropdown.
 *
 * Usage:
 *   node scripts/seed-product-schema.js            # dry run (default)
 *   node scripts/seed-product-schema.js --apply    # write
 *
 * Auth: reuses the Firebase CLI login (`firebase login`). Idempotent — it
 * rewrites the same document, so re-running is harmless.
 */
const fs = require('fs');

const APPLY = process.argv.includes('--apply');
const PROJECT = process.env.FIREBASE_PROJECT_ID || 'krishidukan-e8315';
const CFG = (process.env.HOME || process.env.USERPROFILE) + '/.config/configstore/firebase-tools.json';
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// ─── Field definitions ───────────────────────────────────────────────────────
// Mirrors CATEGORY_FIELDS in app/dashboard/_lib/category-info.ts exactly for
// the categories that already existed there.

const PESTICIDE_LIKE = [
  { key: 'activeIngredient', label: 'Active Ingredient', type: 'text', placeholder: 'e.g. Chlorpyrifos 50% EC' },
  { key: 'chemicalGroup', label: 'Chemical Group', type: 'text', placeholder: 'e.g. Organophosphate' },
  { key: 'targetPest', label: 'Target Pest', type: 'text', placeholder: 'e.g. Aphids, Thrips, White Flies' },
  { key: 'modeOfAction', label: 'Mode of Action', type: 'textarea', placeholder: 'e.g. Contact and systemic action...' },
  { key: 'dosage', label: 'Recommended Dosage', type: 'text', placeholder: 'e.g. 2 ml / Litre of water' },
  { key: 'waitingPeriod', label: 'Waiting Period', type: 'text', placeholder: 'e.g. 14 days before harvest' },
  { key: 'bestForCrops', label: 'Best For Crops', type: 'chips', placeholder: 'e.g. Cotton, Rice, Vegetables' },
];

// "Other" on web is already written for adjuvant-style products — its
// placeholder literally reads "Non-ionic surfactant. Improves spreading and
// sticking of spray solutions", so Adjuvants reuses this same shape.
const GENERIC_FIELDS = [
  { key: 'keyFeatures', label: 'Key Features / Product Info', type: 'textarea', placeholder: 'e.g. Non-ionic surfactant. Improves spreading and sticking of spray solutions...' },
  { key: 'benefits', label: 'Benefits', type: 'chips', placeholder: 'e.g. Reduces surface tension, Improves coverage, Enhances absorption' },
  { key: 'applicationMethod', label: 'Application Method', type: 'text', placeholder: 'e.g. Tank mix with pesticide or herbicide solution' },
  { key: 'dosage', label: 'Recommended Dosage', type: 'text', placeholder: 'e.g. 0.5 ml / Litre of spray solution' },
  { key: 'specifications', label: 'Specifications', type: 'textarea', placeholder: 'List key product specifications...' },
  { key: 'application', label: 'Application', type: 'textarea', placeholder: 'Describe how the product is used...' },
  { key: 'additionalNotes', label: 'Additional Notes', type: 'textarea', placeholder: 'Any other relevant information...' },
];

const CATEGORIES = [
  {
    name: 'Fertilizers',
    fields: [
      { key: 'application', label: 'Application', type: 'textarea', placeholder: 'e.g. Suitable for foliar spray and fertigation...' },
      { key: 'dosage', label: 'Recommended Dosage', type: 'text', placeholder: 'e.g. 3–5 gm / Litre' },
      { key: 'bestForCrops', label: 'Best For Crops', type: 'chips', placeholder: 'e.g. Tomatoes, Wheat, Sugarcane' },
    ],
  },
  { name: 'Pesticides', fields: PESTICIDE_LIKE },
  // NEW — 4 live products, previously unpickable in either dropdown.
  { name: 'Insecticides', fields: PESTICIDE_LIKE },
  // NEW — 5 live products.
  { name: 'Fungicides', fields: PESTICIDE_LIKE },
  {
    name: 'Herbicides',
    fields: [
      { key: 'activeIngredient', label: 'Active Ingredient', type: 'text', placeholder: 'e.g. Glyphosate 41% SL' },
      { key: 'targetWeeds', label: 'Target Weeds', type: 'text', placeholder: 'e.g. Broad-leaf weeds, Grasses' },
      { key: 'type', label: 'Type', type: 'text', placeholder: 'Selective / Non-Selective' },
      { key: 'applicationStage', label: 'Application Stage', type: 'text', placeholder: 'Pre-Emergence / Post-Emergence' },
      { key: 'dosage', label: 'Recommended Dosage', type: 'text', placeholder: 'e.g. 1.5 L / acre' },
      { key: 'bestForCrops', label: 'Best For Crops', type: 'chips', placeholder: 'e.g. Wheat, Maize, Soybean' },
    ],
  },
  {
    name: 'Bio-Stimulants',
    fields: [
      { key: 'keyIngredients', label: 'Key Ingredients', type: 'text', placeholder: 'e.g. Humic acid, Seaweed extract' },
      { key: 'benefits', label: 'Benefits', type: 'chips', placeholder: 'e.g. Improves root development, Enhances nutrient uptake' },
      { key: 'applicationMethod', label: 'Application Method', type: 'text', placeholder: 'e.g. Soil drench, foliar spray' },
      { key: 'dosage', label: 'Recommended Dosage', type: 'text', placeholder: 'e.g. 2–3 ml / Litre' },
      { key: 'growthStage', label: 'Growth Stage', type: 'text', placeholder: 'e.g. Vegetative, Flowering' },
      { key: 'bestForCrops', label: 'Best For Crops', type: 'chips', placeholder: 'e.g. Tomatoes, Grapes, Paddy' },
    ],
  },
  // NEW — 333 live products, the single biggest gap.
  { name: 'Adjuvants', fields: GENERIC_FIELDS },
  {
    name: 'Seeds',
    fields: [
      { key: 'varietyName', label: 'Variety Name', type: 'text', placeholder: 'e.g. HYV-123, Pusa Basmati' },
      { key: 'seedType', label: 'Seed Type', type: 'text', placeholder: 'Hybrid / Open Pollinated / OPV' },
      { key: 'germinationRate', label: 'Germination Rate', type: 'text', placeholder: 'e.g. 90–95%' },
      { key: 'maturityPeriod', label: 'Maturity Period', type: 'text', placeholder: 'e.g. 90–110 days' },
      { key: 'seedRate', label: 'Seed Rate', type: 'text', placeholder: 'e.g. 8–10 kg / acre' },
      { key: 'suitableSeason', label: 'Suitable Season', type: 'text', placeholder: 'Kharif / Rabi / Zaid' },
      { key: 'bestRegions', label: 'Best Regions', type: 'chips', placeholder: 'e.g. Maharashtra, Karnataka, Punjab' },
    ],
  },
  {
    name: 'Sprayers',
    fields: [
      { key: 'tankCapacity', label: 'Tank Capacity', type: 'text', placeholder: 'e.g. 16 Litres' },
      { key: 'material', label: 'Material', type: 'text', placeholder: 'e.g. HDPE, Stainless Steel' },
      { key: 'weight', label: 'Weight', type: 'text', placeholder: 'e.g. 2.5 kg (empty)' },
      { key: 'powerSource', label: 'Power Source', type: 'text', placeholder: 'Manual / Battery / Petrol' },
      { key: 'sprayRange', label: 'Spray Range', type: 'text', placeholder: 'e.g. 5–8 metres' },
      { key: 'nozzleType', label: 'Nozzle Type', type: 'text', placeholder: 'e.g. Adjustable fan nozzle' },
    ],
  },
  {
    name: 'Tools',
    fields: [
      { key: 'material', label: 'Material', type: 'text', placeholder: 'e.g. High-carbon steel' },
      { key: 'dimensions', label: 'Dimensions', type: 'text', placeholder: 'e.g. 40 × 15 cm' },
      { key: 'weight', label: 'Weight', type: 'text', placeholder: 'e.g. 1.2 kg' },
      { key: 'suitableFor', label: 'Suitable For', type: 'text', placeholder: 'e.g. Weeding, Digging' },
      { key: 'handleType', label: 'Handle Type', type: 'text', placeholder: 'e.g. Wooden, Fibreglass' },
      { key: 'warranty', label: 'Warranty', type: 'text', placeholder: 'e.g. 1 year manufacturer warranty' },
    ],
  },
  { name: 'Other', fields: GENERIC_FIELDS },
];

/** Fields stored as string[] rather than string. Mirrors CHIPS_FIELDS on web. */
const CHIPS_FIELDS = ['bestForCrops', 'bestRegions', 'benefits'];

/** Categories that show the Composition editor. Mirrors COMPOSITION_CATEGORIES
 *  on web, extended with the newly added chemical/adjuvant categories. */
const COMPOSITION_CATEGORIES = [
  'Fertilizers', 'Pesticides', 'Insecticides', 'Fungicides',
  'Herbicides', 'Bio-Stimulants', 'Adjuvants', 'Seeds', 'Other',
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

/** JS value -> Firestore REST typed value. */
function toVal(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toVal) } };
  if (typeof v === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, vv]) => [k, toVal(vv)])) } };
  }
  return { stringValue: String(v) };
}

async function main() {
  console.log(`Project: ${PROJECT}`);
  console.log(APPLY ? 'MODE: APPLY (writing)\n' : 'MODE: DRY RUN (no writes — pass --apply to write)\n');

  console.log(`Categories (${CATEGORIES.length}):`);
  for (const c of CATEGORIES) {
    console.log(`   ${c.name.padEnd(16)} ${c.fields.length} field(s)`);
  }
  console.log(`\nchipsFields: ${CHIPS_FIELDS.join(', ')}`);
  console.log(`compositionCategories: ${COMPOSITION_CATEGORIES.length}`);

  if (!APPLY) {
    console.log('\nDry run complete — no writes made. Re-run with --apply.');
    return;
  }

  const token = await accessToken();
  const body = {
    fields: {
      categories: toVal(CATEGORIES),
      chipsFields: toVal(CHIPS_FIELDS),
      compositionCategories: toVal(COMPOSITION_CATEGORIES),
      updatedAt: toVal(new Date()),
    },
  };
  const res = await fetch(`${BASE}/settings/productSchema`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${j.error.status}: ${j.error.message}`);
  console.log('\nWrote settings/productSchema.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
