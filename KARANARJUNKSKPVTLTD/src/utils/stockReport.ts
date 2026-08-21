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

// ── Historical balance reconstruction ────────────────────────────────────────
/**
 * A recorded stock-balance point: the absolute quantity *after* a movement or
 * adjustment settled. `ord` breaks ties between events sharing the same `date`
 * (typically the Firestore createdAt in ms).
 */
export interface BalanceEvent {
    date: string;   // YYYY-MM-DD
    ord: number;    // intra-day ordering (createdAt ms); 0 when unknown
    balance: number; // stock AFTER the event settled
    pre?: number;    // stock BEFORE the event settled (balance − net movement)
}

/**
 * The balance recorded by the latest event strictly before `cutoff` (exclusive).
 * Returns null when no event predates the cutoff. Reads *recorded historical
 * balances* rather than reversing current inventory, so ranges ending in the
 * past reconstruct correctly.
 */
export function balanceBefore(events: BalanceEvent[], cutoff: string): number | null {
    let best: BalanceEvent | null = null;
    for (const e of events) {
        if (e.date >= cutoff) continue;
        if (!best || e.date > best.date || (e.date === best.date && e.ord > best.ord)) best = e;
    }
    return best ? best.balance : null;
}

/**
 * Opening stock at the start of a range, reconstructed from the ledger:
 *   1. the recorded balance just before `cutoff`, if any; else
 *   2. the *pre*-balance of the earliest event on/after `cutoff` — i.e. reverse
 *      that first event, since nothing changed the stock between the range start
 *      and it; else
 *   3. null when there is no ledger history at all (caller hybrid-seeds from
 *      current stock).
 * Never derived from the current inventory value.
 */
export function openingBalance(events: BalanceEvent[], cutoff: string): number | null {
    const before = balanceBefore(events, cutoff);
    if (before != null) return before;
    if (events.length === 0) return null;
    let first = events[0];
    for (const e of events) if (e.date < first.date || (e.date === first.date && e.ord < first.ord)) first = e;
    return first.pre ?? first.balance;
}
