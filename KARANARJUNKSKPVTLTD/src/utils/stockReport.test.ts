import { describe, it, expect } from 'vitest';
import {
    isPosOrder, classifySale, gstFromInclusive,
    resolveSaleLine, openingStock, closesTo,
} from './stockReport';
import { calcLineGST } from './gstCalculator';

// ─── Sale classification ──────────────────────────────────────────────────────
describe('classifySale', () => {
    it('treats KA-<n> numbers as POS', () => {
        expect(isPosOrder('KA-0042')).toBe(true);
        expect(classifySale('KA-0042')).toBe('sale_pos');
        expect(classifySale('ka-7')).toBe('sale_pos');
    });
    it('treats everything else as B2B', () => {
        expect(isPosOrder('INV/2026/001')).toBe(false);
        expect(classifySale('INV/2026/001')).toBe('sale_b2b');
        expect(classifySale('')).toBe('sale_b2b');
    });
});

// ─── GST from inclusive amount reconciles with the invoice engine ─────────────
describe('gstFromInclusive', () => {
    it('extracts embedded GST from a gross (inclusive) amount', () => {
        // ₹1180 gross @18% → ₹180 tax on ₹1000 taxable
        expect(gstFromInclusive(1180, 18)).toBeCloseTo(180, 6);
        // ₹1050 gross @5% → ₹50 tax
        expect(gstFromInclusive(1050, 5)).toBeCloseTo(50, 6);
    });
    it('returns 0 for a 0% line', () => {
        expect(gstFromInclusive(500, 0)).toBe(0);
    });
    it('matches calcLineGST total tax (intra-state) on the same taxable', () => {
        // Invoice engine works on the exclusive rate; our report works on the gross.
        const taxable = 1000, pct = 12;
        const gross = taxable * (1 + pct / 100);
        const engine = calcLineGST({ description: 'x', quantity: 1, rate: taxable, gstPct: pct }, 'Maharashtra', 'Maharashtra');
        expect(gstFromInclusive(gross, pct)).toBeCloseTo(engine.totalTax, 6);
    });
});

// ─── Sale-line field resolution (POS vs B2B shapes) ───────────────────────────
describe('resolveSaleLine', () => {
    it('reads POS line fields (mrp / amount / unit)', () => {
        const r = resolveSaleLine({ productId: 'p1', productName: 'Urea', quantity: 3, mrp: 100, amount: 300, unit: 'bag', gstPct: 5 });
        expect(r).toMatchObject({ productId: 'p1', qty: 3, rate: 100, amount: 300, unit: 'bag', gstPct: 5 });
        expect(r.gst).toBeCloseTo(gstFromInclusive(300, 5), 6);
    });

    it('reads B2B line fields (rate / grossAmount / per / itemDescription)', () => {
        // B2B stores grossAmount = rate×qty (GST-inclusive) and has no `amount`/`mrp`
        const r = resolveSaleLine({ productId: 'p2', itemDescription: 'DAP 50kg', quantity: 2, rate: 1200, grossAmount: 2400, per: 'bag', gstPct: 18 });
        expect(r.qty).toBe(2);
        expect(r.rate).toBe(1200);
        expect(r.amount).toBe(2400);      // must NOT fall back to qty×sellingPrice
        expect(r.unit).toBe('bag');
        expect(r.productName).toBe('DAP 50kg');
        expect(r.gst).toBeCloseTo(gstFromInclusive(2400, 18), 6);
    });

    it('falls back to product values when line omits them', () => {
        const r = resolveSaleLine({ productId: 'p3', quantity: 4 }, { name: 'Seeds', sellingPrice: 25, unit: 'kg', gstPct: 12 });
        expect(r.rate).toBe(25);
        expect(r.amount).toBe(100);       // qty × sellingPrice
        expect(r.unit).toBe('kg');
        expect(r.gstPct).toBe(12);
        expect(r.productName).toBe('Seeds');
    });

    it('takes absolute quantity (never negative)', () => {
        expect(resolveSaleLine({ productId: 'p', quantity: -5, rate: 10 }).qty).toBe(5);
    });
});

// ─── Stock reconciliation identity ────────────────────────────────────────────
describe('openingStock / reconciliation', () => {
    it('opening + purchases − sales + adjust === current', () => {
        const current = 120, purchases = 200, sales = 90, adjust = 10;
        const opening = openingStock(current, purchases, sales, adjust);
        expect(opening).toBe(0); // 120 − 200 + 90 − 10
        expect(closesTo(opening, purchases, sales, adjust)).toBe(current);

        // A case with a non-trivial opening
        const opening2 = openingStock(120, 50, 90, 10); // 120 − 50 + 90 − 10 = 150
        expect(opening2).toBe(150);
        expect(closesTo(opening, purchases, sales, adjust)).toBe(current);
    });

    it('supports negative (oversold) stock', () => {
        // No opening, no purchases, sold 30, no adjust → current −30
        const current = -30;
        const opening = openingStock(current, 0, 30, 0);
        expect(opening).toBe(0);
        expect(closesTo(opening, 0, 30, 0)).toBe(current);
    });

    it('handles negative adjustments (shrinkage / correction)', () => {
        const current = 45, purchases = 50, sales = 0, adjust = -5;
        const opening = openingStock(current, purchases, sales, adjust);
        expect(opening).toBe(0);
        expect(closesTo(opening, purchases, sales, adjust)).toBe(current);
    });
});
