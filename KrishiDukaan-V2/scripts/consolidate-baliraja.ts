/**
 * ONE-OFF consolidation for the Baliraja Agro retailer (UID CtluXghfvlhQPIUZXtyuenayviL2).
 *
 * There are two retailers/ docs for this account:
 *   - retailers/{uid}   (canonical) — clean shopName "Baliraja Agro Agency Jalna",
 *                        structured address map, geo, gstin, onlineDelivery, socialLinks.
 *   - retailers/{phone} (stale shadow) — shopName = the OWNER's name (wrong), a
 *                        lowercase businessName/name, plus a unique onlineDeliveryTerms.
 *
 * The shadow's wrong shopName is why the product page / dashboard showed the owner
 * name. We carry ONLY the fields the canonical doc is missing (onlineDeliveryTerms),
 * then delete the shadow. We deliberately do NOT copy the shadow's lowercase
 * businessName/name/storeName — the canonical shopName is the authoritative value.
 *
 * Usage:  npx tsx scripts/consolidate-baliraja.ts [--apply]
 */
import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID ?? 'krishidukan-e8315';
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const UID = 'CtluXghfvlhQPIUZXtyuenayviL2';
const apply = process.argv.includes('--apply');

// Fields the canonical doc may be missing that are safe & useful to carry over.
// NOTE: businessName / name / storeName are intentionally excluded.
const CARRY_IF_MISSING = ['onlineDeliveryTerms', 'tagline'] as const;

(async () => {
  const idx = await db.doc(`uidIndex/${UID}`).get();
  const phone = idx.exists ? String(idx.data()?.phone ?? '') : '';
  if (!phone) throw new Error('Could not resolve phone from uidIndex.');

  const uidRef = db.doc(`retailers/${UID}`);
  const phoneRef = db.doc(`retailers/${phone}`);
  const [uidSnap, phoneSnap] = await Promise.all([uidRef.get(), phoneRef.get()]);

  if (!uidSnap.exists) throw new Error(`Canonical retailers/${UID} missing — aborting.`);
  if (!phoneSnap.exists) { console.log('No shadow doc — nothing to do.'); return; }

  const canonical = uidSnap.data() as Record<string, unknown>;
  const shadow = phoneSnap.data() as Record<string, unknown>;

  const merge: Record<string, unknown> = {};
  for (const k of CARRY_IF_MISSING) {
    const missing = canonical[k] === undefined || canonical[k] === null || canonical[k] === '';
    if (missing && shadow[k] !== undefined && shadow[k] !== '') merge[k] = shadow[k];
  }

  console.log('CANONICAL retailers/%s — key fields that drive display:', UID);
  console.log('  shopName    :', canonical.shopName);
  console.log('  businessName:', canonical.businessName, '(absent → display falls back to shopName)');
  console.log('  ownerName   :', canonical.ownerName);
  console.log('');
  console.log('Will CARRY into canonical (only fields it was missing):',
    Object.keys(merge).length ? JSON.stringify(Object.keys(merge)) : '(none)');
  console.log('Will DELETE shadow retailers/%s  (shopName was "%s")', phone, shadow.shopName);
  console.log('');
  console.log('After consolidation, the display resolver lands on:');
  console.log('  - product page  → profiles/%s.businessName / retailers/%s.shopName', phone, UID);
  console.log('  - dashboard     → retailers/%s.shopName = "%s"', UID, canonical.shopName);

  if (!apply) { console.log('\nDRY RUN — pass --apply to carry fields + delete the shadow.'); return; }

  if (Object.keys(merge).length) {
    merge.updatedAt = FieldValue.serverTimestamp();
    await uidRef.set(merge, { merge: true });
  }
  await phoneRef.delete();
  console.log('\nDone. Shadow deleted; canonical retailers/%s is now the single source.', UID);
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
