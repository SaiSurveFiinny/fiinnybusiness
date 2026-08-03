/**
 * FIFO stock deduction — shared by POS and B2B Invoice.
 *
 * Each deduction:
 *   1. Validates that sufficient stock exists across all batches.
 *   2. Produces deterministic Firestore update payloads (no writes here).
 *   3. The caller applies those payloads inside its own writeBatch.
 *   4. After committing, the caller calls recordStockMovements() to persist
 *      the audit trail — this is a best-effort write and never blocks the sale.
 *
 * FEFO (First-Expired First-Out) is used when batch expiry dates are present,
 * because selling near-expired stock first is the right behaviour for agri/
 * pharma goods. Products without expiry dates go last.
 */

import { getDocs, query, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getTenantCollection, getTenantDoc } from './tenantPath';
import { getDoc } from 'firebase/firestore';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SaleLine {
  productId: string;
  productName: string;
  qty: number;
  batchNo?: string;   // preferred batch — deducted first when set
}

interface BatchDoc {
  id: string;
  productId: string;
  batchNumber: string;
  expiryDate?: string;
  quantity: number;
}

export interface BatchUpdate {
  batchDocId: string;
  newQty: number;
  batchNumber: string;
  productId: string;
  productName: string;
  qtyDeducted: number;
}

export interface ProductStockUpdate {
  productId: string;
  newLoosePieces: number;
  newQuantity?: number;  // only set when falling back to old box model
}

export interface StockMovementInput {
  productId: string;
  productName: string;
  batchNumber: string;
  qtyIn: number;
  qtyOut: number;
  remainingBatchQty: number;
  remainingStock: number;
  type: 'purchase' | 'sale_pos' | 'sale_b2b';
  sourceType: string;
  sourceId: string;
  sourceNumber: string;
  date: string;
}

export interface DeductionResult {
  valid: boolean;
  errors: string[];
  warnings: string[];   // non-fatal: negative stock allowed when caller opts in
  batchUpdates: BatchUpdate[];
  productUpdates: ProductStockUpdate[];
  movements: Omit<StockMovementInput, 'type' | 'sourceType' | 'sourceId' | 'sourceNumber' | 'date'>[];
}

// ── FEFO sort ─────────────────────────────────────────────────────────────────

function fefoSort(a: BatchDoc, b: BatchDoc): number {
  if (!a.expiryDate && !b.expiryDate) return 0;
  if (!a.expiryDate) return 1;   // no expiry → sell last
  if (!b.expiryDate) return -1;
  return a.expiryDate.localeCompare(b.expiryDate);
}

// ── Core: prepare (read-only, no Firestore writes) ───────────────────────────

/**
 * Reads current batch state, validates stock, and returns the exact Firestore
 * updates needed. The caller applies these inside its own writeBatch.
 *
 * @param allowNegative When true, insufficient stock generates a warning and
 *   still produces deduction updates (stock goes negative). When false
 *   (default), insufficient stock is a fatal error and no updates are produced.
 */
export async function prepareStockDeduction(
  tenantId: string,
  lines: SaleLine[],
  allowNegative = false,
): Promise<DeductionResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const batchUpdates: BatchUpdate[] = [];
  const productUpdates: ProductStockUpdate[] = [];
  const movements: DeductionResult['movements'] = [];

  for (const line of lines) {
    if (!line.productId || line.qty <= 0) continue;

    // Fetch all batches for this product
    const snap = await getDocs(
      query(
        getTenantCollection(db, tenantId, 'inventoryBatches'),
        where('productId', '==', line.productId),
      ),
    );

    const allBatches = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as BatchDoc))
      .filter(b => (b.quantity ?? 0) > 0)
      .sort(fefoSort);

    const hasBatches = allBatches.length > 0;
    const batchTotal = allBatches.reduce((s, b) => s + (b.quantity ?? 0), 0);

    if (!hasBatches || batchTotal === 0) {
      // ── Fallback: product-level stock (pre-batch-system products) ─────────
      const prodSnap = await getDoc(getTenantDoc(db, tenantId, 'products', line.productId));
      if (!prodSnap.exists()) { errors.push(`Product "${line.productName}" not found.`); continue; }
      const pData = prodSnap.data() as { loosePieces?: number; quantity?: number; boxCapacity?: number };
      const cap = pData.boxCapacity ?? 1;
      const totalPieces = (pData.loosePieces ?? 0) + (pData.quantity ?? 0) * cap;

      if (totalPieces < line.qty) {
        const msg = `Low stock for "${line.productName}": available ${totalPieces}, requested ${line.qty}.`;
        if (!allowNegative) { errors.push(msg); continue; }
        warnings.push(msg);
      }
      // Compute new box / loose split (keep old model for these products)
      let newLoose = (pData.loosePieces ?? 0) - line.qty;
      let newBoxes = pData.quantity ?? 0;
      while (newLoose < 0 && newBoxes > 0) { newBoxes--; newLoose += cap; }
      productUpdates.push({ productId: line.productId, newLoosePieces: newLoose, newQuantity: newBoxes });
      movements.push({ productId: line.productId, productName: line.productName, batchNumber: '', qtyIn: 0, qtyOut: line.qty, remainingBatchQty: 0, remainingStock: totalPieces - line.qty });
      continue;
    }

    // ── Batch-level stock ────────────────────────────────────────────────────
    if (batchTotal < line.qty) {
      const msg = `Low stock for "${line.productName}": available ${batchTotal}, requested ${line.qty}.`;
      if (!allowNegative) { errors.push(msg); continue; }
      warnings.push(msg);
    }

    // Preferred batch first (user specified batchNo on the invoice line)
    let sorted = allBatches;
    if (line.batchNo) {
      sorted = [
        ...allBatches.filter(b => b.batchNumber === line.batchNo),
        ...allBatches.filter(b => b.batchNumber !== line.batchNo),
      ];
    }

    // FEFO deduction across batches
    let remaining = line.qty;
    for (const b of sorted) {
      if (remaining <= 0) break;
      const deduct = Math.min(b.quantity, remaining);
      const newQty = b.quantity - deduct;
      remaining -= deduct;
      batchUpdates.push({ batchDocId: b.id, newQty, batchNumber: b.batchNumber, productId: line.productId, productName: line.productName, qtyDeducted: deduct });
      movements.push({ productId: line.productId, productName: line.productName, batchNumber: b.batchNumber, qtyIn: 0, qtyOut: deduct, remainingBatchQty: newQty, remainingStock: batchTotal - line.qty });
    }
    // Update product.loosePieces to match new batch total (may be negative when allowNegative)
    productUpdates.push({ productId: line.productId, newLoosePieces: batchTotal - line.qty });
  }

  return { valid: errors.length === 0, errors, warnings, batchUpdates, productUpdates, movements };
}

// ── Record movements (best-effort, called after the sale batch commits) ───────

export async function recordStockMovements(
  tenantId: string,
  baseMovements: DeductionResult['movements'],
  meta: Pick<StockMovementInput, 'type' | 'sourceType' | 'sourceId' | 'sourceNumber' | 'date'>,
): Promise<void> {
  if (!tenantId || baseMovements.length === 0) return;
  try {
    const today = meta.date;
    await Promise.all(
      baseMovements.map(m =>
        addDoc(getTenantCollection(db, tenantId, 'stockMovements'), {
          ...m,
          ...meta,
          date: today,
          createdAt: serverTimestamp(),
        }),
      ),
    );
  } catch (e) {
    console.error('[stockMovements] Failed to record movements:', e);
  }
}

// ── Purchase movement recording (called by inventoryPosting) ──────────────────

export async function recordPurchaseMovements(
  tenantId: string,
  lines: Array<{ productId: string; productName: string; batchNumber: string; qtyIn: number; batchDocId: string }>,
  sourceId: string,
  sourceNumber: string,
  supplierName?: string,
): Promise<void> {
  if (!tenantId || lines.length === 0) return;
  const date = new Date().toISOString().slice(0, 10);
  try {
    await Promise.all(
      lines.map(async l => {
        // Read remaining batch qty for the movement record
        let remainingBatchQty = l.qtyIn;
        try {
          const snap = await getDoc(getTenantDoc(db, tenantId, 'inventoryBatches', l.batchDocId));
          if (snap.exists()) remainingBatchQty = Number((snap.data() as any).quantity ?? l.qtyIn);
        } catch { /* non-fatal */ }

        return addDoc(getTenantCollection(db, tenantId, 'stockMovements'), {
          productId: l.productId,
          productName: l.productName,
          batchNumber: l.batchNumber,
          qtyIn: l.qtyIn,
          qtyOut: 0,
          remainingBatchQty,
          remainingStock: remainingBatchQty,
          type: 'purchase',
          sourceType: 'Purchase Invoice',
          sourceId,
          sourceNumber,
          supplierName: supplierName || '',
          date,
          createdAt: serverTimestamp(),
        });
      }),
    );
  } catch (e) {
    console.error('[stockMovements] Failed to record purchase movements:', e);
  }
}
