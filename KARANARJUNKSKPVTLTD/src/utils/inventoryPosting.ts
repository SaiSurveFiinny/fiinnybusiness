import {
    writeBatch, doc, getDoc, getDocs, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { getTenantCollection, getTenantDoc } from './tenantPath';
import { recordPurchaseMovements } from './stockDeduction';

// ─────────────────────────────────────────────────────────────────────────────
// Supplier Invoice → Inventory posting
//
// Each supplier-invoice line updates:
//   (a) `products` master — prices, manufacturer, stock (in loosePieces)
//   (b) `inventoryBatches` — keyed by ${productId}_${batchNo}_${invoiceId}, so
//       each invoice's delivery is its own record even if a batch number is
//       reused across dates; re-saving the same invoice stays idempotent.
//
// Stock is stored in `product.loosePieces` (total units). POS deducts from
// loosePieces, so POS stock tracking continues to work without changes.
//
// Idempotency: PostedLine carries batchDocId + units. On re-save the caller
// passes back prevPosted; we reverse the previous delta then apply the new one.
// ─────────────────────────────────────────────────────────────────────────────

export interface PostedLine {
    productId: string;
    batchDocId: string;
    units: number;
}

export interface SupplierLineForPost {
    description: string;
    mfgCompany?: string;
    batchNo?: string;
    mfgDate?: string;
    expDate?: string;
    hsnCode?: string;
    unit?: string;
    quantity?: number;   // total loose units received
    rate?: number;       // purchase cost without GST
    mrp?: number;
    retailerPrice?: number;
    sellingPrice?: number;
    gstPct?: number;
    productNumber?: string;
    type?: string;
    unitSize?: number;
    unitMeasure?: string;
}

interface ExistingProductLite { id: string; name: string; }

const norm = (s: string) => (s || '').trim().toLowerCase();
const num = (key: string, v: unknown): Record<string, number> => {
    if (v === undefined || v === null || v === '') return {};
    const n = Number(v);
    return Number.isFinite(n) ? { [key]: n } : {};
};
const str = (key: string, v: unknown): Record<string, string> => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s ? { [key]: s } : {};
};

// Scoped to the invoice: a batch number can legitimately repeat across separate
// deliveries (same manufacturer lot code), and each delivery needs its own
// quantity/price/date record rather than silently overwriting the prior one.
// Re-saving the SAME invoice still resolves to the same doc (idempotent edits).
function makeBatchDocId(productId: string, batchNo: string | undefined, invoiceId: string, index: number): string {
    const b = (batchNo || '').trim();
    return b
        ? `${productId}_${b.replace(/[/\\.\s[\]#*?]/g, '_')}_${invoiceId}`
        : `${invoiceId}_${index}`;
}

export async function postSupplierInvoiceToInventory(
    tenantId: string,
    invoiceId: string,
    lines: SupplierLineForPost[],
    supplierName: string,
    existingProducts: ExistingProductLite[],
    prevPosted: PostedLine[] = [],
    invoiceNumber?: string,
): Promise<PostedLine[]> {
    if (!tenantId || !invoiceId) return prevPosted;

    const active = lines.filter(l => (l.description || '').trim());

    // ── Resolve product ids ────────────────────────────────────────────────
    const byName = new Map(existingProducts.map(p => [norm(p.name), p.id]));
    const resolved: Array<{ line: SupplierLineForPost; productId: string; isNew: boolean; index: number }> = [];
    for (let i = 0; i < active.length; i++) {
        const line = active[i];
        let productId = byName.get(norm(line.description));
        let isNew = false;
        if (!productId) {
            const snap = await getDocs(query(
                getTenantCollection(db, tenantId, 'products'),
                where('name', '==', line.description.trim()),
            ));
            productId = snap.empty
                ? (() => { isNew = true; const id = doc(getTenantCollection(db, tenantId, 'products')).id; byName.set(norm(line.description), id); return id; })()
                : snap.docs[0].id;
        }
        resolved.push({ line, productId, isNew, index: i });
    }

    // ── Aggregate deltas ───────────────────────────────────────────────────
    type ProductAgg = { looseDelta: number; master?: Record<string, unknown>; isNew: boolean };
    const productAgg = new Map<string, ProductAgg>();
    const ensureProduct = (id: string, isNew = false) => {
        if (!productAgg.has(id)) productAgg.set(id, { looseDelta: 0, isNew });
        const a = productAgg.get(id)!;
        if (isNew) a.isNew = true;
        return a;
    };

    type BatchAgg = { unitsDelta: number; productId: string; line?: SupplierLineForPost };
    const batchAgg = new Map<string, BatchAgg>();
    const ensureBatch = (bdId: string, productId: string) => {
        if (!batchAgg.has(bdId)) batchAgg.set(bdId, { unitsDelta: 0, productId });
        return batchAgg.get(bdId)!;
    };

    // Reverse previous (new PostedLine format; old format missing batchDocId is silently skipped)
    for (const p of prevPosted) {
        if (!p.productId || !p.batchDocId) continue;
        ensureProduct(p.productId).looseDelta -= Number(p.units) || 0;
        ensureBatch(p.batchDocId, p.productId).unitsDelta -= Number(p.units) || 0;
    }

    // Apply current lines
    const newPosted: PostedLine[] = [];
    for (const r of resolved) {
        const units = Math.max(0, Number(r.line.quantity) || 0);
        const bdId = makeBatchDocId(r.productId, r.line.batchNo, invoiceId, r.index);

        const pa = ensureProduct(r.productId, r.isNew);
        pa.looseDelta += units;
        pa.master = {
            name: r.line.description.trim(),
            ...str('mfgCompany', r.line.mfgCompany),
            ...num('purchasePrice', r.line.rate),
            ...num('maxRetailPrice', r.line.mrp),
            ...num('retailerPrice', r.line.retailerPrice),
            ...num('sellingPrice', r.line.sellingPrice),
            ...num('gstPct', r.line.gstPct),
            ...str('productNumber', r.line.productNumber),
            ...str('type', r.line.type),
            ...num('unitSize', r.line.unitSize),
            ...str('unitMeasure', r.line.unitMeasure),
            ...str('baseUnit', r.line.unit),
            ...str('batchNumber', r.line.batchNo),
            ...str('expiryDate', r.line.expDate),
            ...str('mfgDate', r.line.mfgDate),
            ...str('hsnCode', r.line.hsnCode),
        };

        ensureBatch(bdId, r.productId).unitsDelta += units;
        batchAgg.get(bdId)!.line = r.line;

        newPosted.push({ productId: r.productId, batchDocId: bdId, units });
    }

    // ── Read current state ─────────────────────────────────────────────────
    const currentProducts = new Map<string, { loosePieces: number; data: Record<string, unknown> }>();
    await Promise.all(Array.from(productAgg.entries()).map(async ([id, a]) => {
        if (a.isNew) { currentProducts.set(id, { loosePieces: 0, data: {} }); return; }
        try {
            const snap = await getDoc(getTenantDoc(db, tenantId, 'products', id));
            const d = snap.exists() ? snap.data() as Record<string, unknown> : {};
            currentProducts.set(id, { loosePieces: Number(d.loosePieces ?? 0) || 0, data: d });
        } catch { currentProducts.set(id, { loosePieces: 0, data: {} }); }
    }));

    const currentBatches = new Map<string, { quantity: number }>();
    await Promise.all(Array.from(batchAgg.keys()).map(async bdId => {
        try {
            const snap = await getDoc(getTenantDoc(db, tenantId, 'inventoryBatches', bdId));
            const d = snap.exists() ? snap.data() as Record<string, unknown> : {};
            currentBatches.set(bdId, { quantity: Number(d.quantity ?? 0) || 0 });
        } catch { currentBatches.set(bdId, { quantity: 0 }); }
    }));

    // ── Atomic write ───────────────────────────────────────────────────────
    const wb = writeBatch(db);

    for (const [id, a] of productAgg.entries()) {
        const cur = currentProducts.get(id) ?? { loosePieces: 0, data: {} };
        const newLoose = Math.max(0, cur.loosePieces + a.looseDelta);
        const ref = getTenantDoc(db, tenantId, 'products', id);
        const mergedMrp = Number(a.master?.maxRetailPrice ?? cur.data?.maxRetailPrice ?? 0) || 0;
        const mergedPtr = Number(a.master?.retailerPrice ?? cur.data?.retailerPrice ?? 0) || 0;
        const margin = mergedMrp > 0 ? `${Math.round(((mergedMrp - mergedPtr) / mergedMrp) * 100)}%` : 'N/A';
        const base: Record<string, unknown> = {
            loosePieces: newLoose,
            margin,
            lastPurchasedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            ...(a.master || {}),
        };
        if (a.isNew) {
            wb.set(ref, { category: 'B2B', baseUnit: 'pcs', boxCapacity: 1, quantity: 0, gstPct: 0, maxRetailPrice: 0, retailerPrice: 0, purchasePrice: 0, sellingPrice: 0, ...base, createdAt: serverTimestamp() });
        } else {
            wb.set(ref, base, { merge: true });
        }
    }

    for (const [bdId, ba] of batchAgg.entries()) {
        const cur = currentBatches.get(bdId) ?? { quantity: 0 };
        const newQty = Math.max(0, cur.quantity + ba.unitsDelta);
        const ref = getTenantDoc(db, tenantId, 'inventoryBatches', bdId);
        if (!ba.line) {
            wb.set(ref, { quantity: newQty, updatedAt: serverTimestamp() }, { merge: true });
        } else {
            const l = ba.line;
            wb.set(ref, {
                productId: ba.productId,
                productName: l.description.trim(),
                batchNumber: (l.batchNo || '').trim(),
                mfgDate: l.mfgDate || '',
                expiryDate: l.expDate || '',
                mrp: Number(l.mrp) || 0,
                purchaseRate: Number(l.rate) || 0,
                quantity: newQty,
                unit: (l.unit || '').trim() || 'pcs',
                supplier: (supplierName || '').trim(),
                sourceInvoiceId: invoiceId,
                updatedAt: serverTimestamp(),
            }, { merge: true });
        }
    }

    await wb.commit();

    // Record purchase movements (best-effort — never block if this fails)
    recordPurchaseMovements(
        tenantId,
        newPosted.map((p, i) => ({
            productId: p.productId,
            productName: resolved[i]?.line.description?.trim() ?? '',
            batchNumber: (resolved[i]?.line.batchNo ?? '').trim(),
            qtyIn: p.units,
            batchDocId: p.batchDocId,
        })),
        invoiceId,
        invoiceNumber || invoiceId,
        supplierName,
    ).catch(console.error);

    return newPosted;
}
