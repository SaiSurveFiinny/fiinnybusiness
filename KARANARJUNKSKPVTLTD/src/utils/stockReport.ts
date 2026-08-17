/**
 * Stock Report — pure calculation helpers.
 *
 * Extracted from StockReportPage so the reconciliation-critical logic (which
 * must agree with how POS / B2B invoices actually store their line items) can
 * be unit-tested in isolation. No Firestore, no React here.
 */

// ── Sale-order classification ───────────────────────────────────────────────
// POS bills use the "KA-<n>" numbering scheme; everything else is a B2B invoice.
export const isPosOrder = (orderNumber: string): boolean =>
    /^KA-\d+$/i.test((orderNumber || '').trim());

export type SaleChannel = 'sale_pos' | 'sale_b2b';
export const classifySale = (orderNumber: string): SaleChannel =>
    isPosOrder(orderNumber) ? 'sale_pos' : 'sale_b2b';

// ── GST ─────────────────────────────────────────────────────────────────────
/**
 * GST embedded inside a GST-INCLUSIVE amount.
 *
 * Both POS (MRP-based) and B2B (grossAmount = rate×qty) store line totals
 * inclusive of tax, so the tax component is `amount × pct / (100 + pct)`.
 * This matches the B2B invoice's own math: cgst+sgst = gross − gross/(1+p/100).
 */
export const gstFromInclusive = (amount: number, pct: number): number =>
    pct > 0 ? amount * pct / (100 + pct) : 0;

// ── Sale line resolution ─────────────────────────────────────────────────────
// POS lines carry mrp / amount / unit; B2B lines carry rate / grossAmount / per.
// Resolve to one shape so both invoice types reconcile against inventory.
export interface RawSaleLine {
    productId?: string;
    productName?: string;
    itemDescription?: string;
    quantity?: number | string;
    mrp?: number | string;
    rate?: number | string;
    amount?: number | string;
    grossAmount?: number | string;
    unit?: string;
    per?: string;
    gstPct?: number | string;
    batchNo?: string;
}

export interface ResolvedSaleLine {
    productId: string;
    productName: string;
    qty: number;
    rate: number;
    amount: number;
    unit: string;
    gstPct: number;
    batchNo: string;
    gst: number;
}

export interface ProductRef {
    name?: string;
    sellingPrice?: number;
    unit?: string;
    gstPct?: number;
}

export function resolveSaleLine(li: RawSaleLine, prod?: ProductRef): ResolvedSaleLine {
    const qty    = Math.abs(Number(li.quantity) || 0);
    const rate   = Number(li.mrp) || Number(li.rate) || (prod?.sellingPrice ?? 0);
    const amount = Number(li.amount) || Number(li.grossAmount) || qty * rate;
    const gstPct = Number(li.gstPct) || (prod?.gstPct ?? 0);
    return {
        productId: li.productId || '',
        productName: li.productName || li.itemDescription || prod?.name || '—',
        qty,
        rate,
        amount,
        unit: li.unit || li.per || prod?.unit || '',
        gstPct,
        batchNo: li.batchNo || '',
        gst: gstFromInclusive(amount, gstPct),
    };
}

// ── Stock reconciliation ─────────────────────────────────────────────────────
/**
 * Opening stock reconstructed from the known (physical) closing stock and the
 * movement within the period:  opening = current − purchases + sales − adjust.
 *
 * Rearranged, this guarantees the ledger identity always closes:
 *   opening + purchases − sales + adjust = current
 *
 * `adjust` is a signed delta (positive = stock added). Negative results are
 * valid and represent oversold / negative stock.
 */
export function openingStock(current: number, purchases: number, sales: number, adjust: number): number {
    return current - purchases + sales - adjust;
}

export function closesTo(opening: number, purchases: number, sales: number, adjust: number): number {
    return opening + purchases - sales + adjust;
}
