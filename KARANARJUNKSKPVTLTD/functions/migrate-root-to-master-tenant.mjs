/**
 * migrate-root-to-master-tenant.mjs
 *
 * COPY-ONLY migration: root-level collections → /tenants/master/{collection}
 *
 * Rules:
 *   - Preserves every document ID and all fields.
 *   - Does NOT delete or modify originals.
 *   - Skips (does not overwrite) documents that already exist in the destination.
 *   - Reports source vs destination counts and per-collection results.
 *   - Reports every failure individually.
 *
 * Run: node scripts/migrate-root-to-master-tenant.mjs
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ── Init ──────────────────────────────────────────────────────────────────────
const app = initializeApp({
  credential: applicationDefault(),
  projectId: 'finny-erp-uat',
});
const db = getFirestore(app);

// ── Collections to migrate ────────────────────────────────────────────────────
// These are top-level Firestore collections used by the master tenant today.
// Excluded per spec: users, tenants, ui_schemas, vcheckoutSessions
const COLLECTIONS = [
  'retailers',
  'products',
  'suppliers',
  'manufacturers',
  'transporters',
  'orders',
  'salesOrders',
  'purchaseOrders',
  'supplierInvoices',
  'supplierPayments',
  'supplierPaymentReminders',
  'inventoryBatches',
  'stockMovements',
  'expenses',
  'onlineOrders',
  'storeProducts',
  'auditLogs',
  'counters',
  'settings',
];

// ── Batch writer ──────────────────────────────────────────────────────────────
// Firestore batches are capped at 500 operations.
const BATCH_SIZE = 400;

async function flushBatch(batch) {
  await batch.commit();
  return db.batch();
}

// ── Copy a single flat collection ─────────────────────────────────────────────
// Returns { copied, skipped, failed, errors }
async function migrateCollection(collName) {
  const srcRef  = db.collection(collName);
  const dstRef  = db.collection(`tenants/master/${collName}`);

  let srcSnap;
  try {
    srcSnap = await srcRef.get();
  } catch (e) {
    return { copied: 0, skipped: 0, failed: 0, errors: [`FETCH ERROR: ${e.message}`] };
  }

  if (srcSnap.empty) {
    return { copied: 0, skipped: 0, failed: 0, errors: [], empty: true };
  }

  // Fetch existing destination doc IDs to avoid overwrites.
  let existingIds = new Set();
  try {
    const dstSnap = await dstRef.select().get(); // select() fetches IDs only — no field data
    dstSnap.docs.forEach(d => existingIds.add(d.id));
  } catch (e) {
    // If the destination collection doesn't exist yet, that's fine.
  }

  let batch      = db.batch();
  let opsInBatch = 0;
  let copied     = 0;
  let skipped    = 0;
  let failed     = 0;
  const errors   = [];

  for (const srcDoc of srcSnap.docs) {
    if (existingIds.has(srcDoc.id)) {
      skipped++;
      continue;
    }

    try {
      const data = srcDoc.data();
      const dstDocRef = dstRef.doc(srcDoc.id);
      batch.set(dstDocRef, data);
      opsInBatch++;
      copied++;

      if (opsInBatch >= BATCH_SIZE) {
        await flushBatch(batch);
        batch = db.batch();
        opsInBatch = 0;
      }
    } catch (e) {
      failed++;
      errors.push(`  doc ${srcDoc.id}: ${e.message}`);
    }
  }

  // Flush remaining
  if (opsInBatch > 0) {
    try {
      await batch.commit();
    } catch (e) {
      failed += opsInBatch;
      copied -= opsInBatch;
      errors.push(`  final batch commit failed: ${e.message}`);
    }
  }

  return { copied, skipped, failed, errors, sourceTotal: srcSnap.size };
}

// ── Also migrate subcollections of a given document ──────────────────────────
// Used for: settings (which has sub-docs like settings/invoiceBranding).
// Firestore collections are flat — document sub-collections must be listed.
async function migrateSubcollections(collName) {
  const srcRef = db.collection(collName);
  let srcSnap;
  try {
    srcSnap = await srcRef.get();
  } catch {
    return [];
  }

  const results = [];
  for (const srcDoc of srcSnap.docs) {
    const subcols = await srcDoc.ref.listCollections();
    for (const subcol of subcols) {
      const subPath    = `${collName}/${srcDoc.id}/${subcol.id}`;
      const dstSubPath = `tenants/master/${collName}/${srcDoc.id}/${subcol.id}`;

      const subSnap = await subcol.get();
      let batch      = db.batch();
      let opsInBatch = 0;
      let copied     = 0;
      let skipped    = 0;

      const dstSubRef = db.collection(dstSubPath);
      const dstExisting = new Set();
      try {
        const dstSnap = await dstSubRef.select().get();
        dstSnap.docs.forEach(d => dstExisting.add(d.id));
      } catch { /* collection may not exist yet */ }

      for (const subDoc of subSnap.docs) {
        if (dstExisting.has(subDoc.id)) { skipped++; continue; }
        batch.set(dstSubRef.doc(subDoc.id), subDoc.data());
        opsInBatch++;
        copied++;
        if (opsInBatch >= BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          opsInBatch = 0;
        }
      }
      if (opsInBatch > 0) await batch.commit();

      results.push({ path: subPath, copied, skipped, sourceTotal: subSnap.size });
    }
  }
  return results;
}

// ── Verify samples ────────────────────────────────────────────────────────────
async function verifySample(collName) {
  const srcRef = db.collection(collName);
  const dstRef = db.collection(`tenants/master/${collName}`);

  const [srcSnap, dstSnap] = await Promise.all([
    srcRef.limit(3).get(),
    dstRef.limit(3).get(),
  ]);

  const checks = [];
  for (const srcDoc of srcSnap.docs) {
    const dstDoc = await dstRef.doc(srcDoc.id).get();
    const srcData = srcDoc.data();
    const dstData = dstDoc.data() || {};
    const srcKeys = Object.keys(srcData).sort();
    const dstKeys = Object.keys(dstData).sort();
    const fieldMatch = JSON.stringify(srcKeys) === JSON.stringify(dstKeys);
    checks.push({ id: srcDoc.id, fieldMatch, srcFields: srcKeys.length, dstFields: dstKeys.length });
  }
  return checks;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Root → /tenants/master  COPY-ONLY Migration');
  console.log(` Project : finny-erp-uat`);
  console.log(` Started : ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const report = [];
  let totalCopied = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const collName of COLLECTIONS) {
    process.stdout.write(`Migrating /${collName} ... `);
    const result = await migrateCollection(collName);

    totalCopied  += result.copied;
    totalSkipped += result.skipped;
    totalFailed  += result.failed;

    if (result.empty) {
      console.log('EMPTY (collection does not exist or has no documents — skipped)');
    } else {
      const status = result.failed === 0 ? '✓' : '✗';
      console.log(`${status}  src=${result.sourceTotal ?? '?'}  copied=${result.copied}  skipped=${result.skipped}  failed=${result.failed}`);
    }

    if (result.errors?.length) {
      result.errors.forEach(e => console.log(`    ERROR: ${e}`));
    }

    report.push({ collection: collName, ...result });

    // Migrate subcollections (e.g. settings/invoiceBranding subcollections)
    const subResults = await migrateSubcollections(collName);
    for (const sub of subResults) {
      console.log(`  ↳ subcol /${sub.path}  src=${sub.sourceTotal}  copied=${sub.copied}  skipped=${sub.skipped}`);
      totalCopied += sub.copied;
      totalSkipped += sub.skipped;
    }
  }

  // ── Verification samples ──────────────────────────────────────────────────
  console.log('\n── Verification Samples ─────────────────────────────────────');
  const verifyCollections = ['retailers', 'products', 'salesOrders', 'counters', 'settings'];
  for (const collName of verifyCollections) {
    const checks = await verifySample(collName);
    if (checks.length === 0) {
      console.log(`  ${collName}: (no source docs to verify)`);
      continue;
    }
    const allMatch = checks.every(c => c.fieldMatch);
    const icon = allMatch ? '✓' : '✗';
    console.log(`  ${icon} ${collName}:`);
    checks.forEach(c => {
      const matchLabel = c.fieldMatch ? 'fields match' : `FIELD MISMATCH src=${c.srcFields} dst=${c.dstFields}`;
      console.log(`      doc ${c.id}  ${matchLabel}`);
    });
  }

  // ── Key relationship checks ───────────────────────────────────────────────
  console.log('\n── Relationship Checks ──────────────────────────────────────');

  // Check that salesOrder retailerIds exist as retailers
  try {
    const soSnap = await db.collection('salesOrders').limit(10).get();
    const retailerIds = [...new Set(soSnap.docs.map(d => d.data().retailerId).filter(Boolean))];
    let linkedOk = 0, linkedMissing = 0;
    for (const rid of retailerIds) {
      const r = await db.collection('tenants/master/retailers').doc(rid).get();
      if (r.exists) linkedOk++; else linkedMissing++;
    }
    console.log(`  salesOrders→retailers  matched=${linkedOk}  missing=${linkedMissing}`);
  } catch (e) {
    console.log(`  salesOrders→retailers check skipped: ${e.message}`);
  }

  // Check products referenced in salesOrders exist
  try {
    const soSnap = await db.collection('salesOrders').limit(5).get();
    const productIds = [...new Set(
      soSnap.docs.flatMap(d => (d.data().items || []).map(i => i.productId)).filter(Boolean)
    )];
    let pOk = 0, pMissing = 0;
    for (const pid of productIds.slice(0, 10)) {
      const p = await db.collection('tenants/master/products').doc(pid).get();
      if (p.exists) pOk++; else pMissing++;
    }
    console.log(`  salesOrders→products   matched=${pOk}  missing=${pMissing}`);
  } catch (e) {
    console.log(`  salesOrders→products check skipped: ${e.message}`);
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' Migration Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Collections attempted : ${COLLECTIONS.length}`);
  console.log(`  Documents copied      : ${totalCopied}`);
  console.log(`  Documents skipped     : ${totalSkipped}  (already existed in /tenants/master/)`);
  console.log(`  Documents failed      : ${totalFailed}`);
  console.log(`  Finished              : ${new Date().toISOString()}`);
  console.log('');
  console.log('  Original root collections: UNTOUCHED (no deletes, no updates)');
  console.log('  Rollback: delete /tenants/master/* and originals are intact');
  console.log('');

  if (totalFailed > 0) {
    console.log('  ⚠️  Some documents failed — review errors above before proceeding');
    process.exit(1);
  } else {
    console.log('  ✓ Migration complete with no failures');
    process.exit(0);
  }
}

main().catch(e => {
  console.error('\nFATAL:', e);
  process.exit(1);
});
