import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { query, getDocs, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import { classifySale, gstFromInclusive, resolveSaleLine, openingStock } from '../utils/stockReport';
import {
    Package2, Loader2, Search, X, Download,
    ChevronDown, ChevronRight, Calendar, ExternalLink,
} from 'lucide-react';
import Papa from 'papaparse';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
    id: string;
    name: string;
    type?: string;
    mfgCompany?: string;
    gstPct?: number;
    maxRetailPrice?: number;
    purchasePrice?: number;
    sellingPrice?: number;
    loosePieces?: number;
    quantity?: number;
    boxCapacity?: number;
    unit?: string;
}

interface BatchDoc {
    id: string;
    productId: string;
    productName?: string;
    batchNumber: string;
    expiryDate?: string;
    quantity: number;
    purchaseRate?: number;
    mrp?: number;
    supplier?: string;
    warehouse?: string;
}

interface Movement {
    id: string;
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
    supplierName?: string;
    date: string;
    createdAt?: any;
}

// Derived from salesOrders — covers all historical sales regardless of stockMovements
interface SaleRow {
    orderId: string;
    orderNumber: string;
    date: string;
    type: 'sale_pos' | 'sale_b2b';
    customerName: string;
    productId: string;
    productName: string;
    qty: number;
    unit: string;
    rate: number;
    amount: number;
    gstPct: number;
    batchNo?: string;
}

// Derived from auditLogs (action = 'Stock Adjustment') — manual batch qty edits
interface AdjustRow {
    id: string;
    productId: string;
    batchNumber: string;
    date: string;
    delta: number;          // after − before (signed)
    after: number | null;   // resulting batch qty (remaining stock)
    party: string;          // user who adjusted
}

// Unified transaction — purchase / sale / adjustment
type TxnKind = 'purchase' | 'sale' | 'adjustment';
type TxnChannel = 'purchase' | 'b2b' | 'pos' | 'adjustment';

interface Txn {
    id: string;
    productId: string;
    batchNumber: string;
    kind: TxnKind;
    channel: TxnChannel;
    party: string;                    // supplier / retailer / customer / user
    date: string;                     // business / transaction date
    invoiceNumber: string;
    qty: number;                      // signed movement (+in / −out / ±adjust)
    value: number;
    gst: number;
    remaining: number | null;         // stock after this txn
    orderId?: string;
    orderType?: 'sale_pos' | 'sale_b2b';
}

interface BatchGroup {
    batchNumber: string;
    currentStock: number | null;
    openingStock: number | null;
    purchasesQty: number;
    salesQty: number;
    adjustQty: number;
    txns: Txn[];
}

interface ProductView {
    product: Product;
    currentStock: number;
    openingStock: number;
    purchasesQty: number;
    salesQty: number;
    adjustQty: number;
    batchGroups: BatchGroup[];
    batchCount: number;
    purchaseValue: number;
    salesValue: number;
    gstValue: number;
    txnCount: number;
}

// ── Period helpers ─────────────────────────────────────────────────────────────

type Period = 'today' | 'this_week' | 'this_month' | 'all_time' | 'custom';
type SaleType = 'all' | 'b2b' | 'pos';

const PERIODS: { key: Period; label: string }[] = [
    { key: 'today',      label: 'Today' },
    { key: 'this_week',  label: 'This Week' },
    { key: 'this_month', label: 'This Month' },
    { key: 'all_time',   label: 'All Time' },
    { key: 'custom',     label: 'Custom' },
];

const SALE_TYPES: { key: SaleType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'b2b', label: 'B2B' },
    { key: 'pos', label: 'B2C / POS' },
];

function toStr(d: Date) { return d.toISOString().slice(0, 10); }

function periodRange(p: Period, cf: string, ct: string): [string, string] {
    const now = new Date();
    const t = toStr(now);
    switch (p) {
        case 'today':        return [t, t];
        case 'this_week':    { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); return [toStr(d), t]; }
        case 'this_month':   return [toStr(new Date(now.getFullYear(), now.getMonth(), 1)), t];
        case 'all_time':     return ['2000-01-01', t];
        case 'custom':       return cf && ct ? [cf, ct] : [t, t];
    }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const fmtInr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (n: number) => n.toLocaleString('en-IN');
const fmtDate = (s: string) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}-${m}-${y}`; };
const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const todayStr = () => new Date().toISOString().slice(0, 10);

const CHANNEL_CHIP: Record<TxnChannel, { label: string; bg: string; color: string }> = {
    purchase:   { label: 'Purchase',   bg: 'hsla(152,60%,40%,0.12)', color: '#10b981' },
    b2b:        { label: 'B2B',         bg: 'hsla(263,70%,60%,0.12)', color: '#8b5cf6' },
    pos:        { label: 'B2C / POS',   bg: 'hsla(217,91%,60%,0.12)', color: '#3b82f6' },
    adjustment: { label: 'Adjustment',  bg: 'hsla(38,92%,50%,0.12)',  color: '#d97706' },
};

// Signed stock number — red + NEG chip when negative
function StockNum({ value }: { value: number | null }) {
    if (value == null) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
    const neg = value < 0;
    return (
        <span style={{ fontWeight: 700, color: neg ? '#ef4444' : value === 0 ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
            {fmtNum(value)}
            {neg && <span style={{ marginLeft: '0.3rem', fontSize: '0.6rem', padding: '0.05rem 0.3rem', borderRadius: '999px', background: 'hsla(0,84%,60%,0.14)', color: '#ef4444', fontWeight: 800 }}>NEG</span>}
        </span>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StockReportPage() {
    const { tenantId } = useAuth();
    const navigate = useNavigate();

    // ── Period / date filters ─────────────────────────────────────────────────
    const [period, setPeriod]           = useState<Period>('this_month');
    const [customFrom, setCustomFrom]   = useState(firstOfMonth());
    const [customTo, setCustomTo]       = useState(todayStr());
    const [dateFrom, setDateFrom]       = useState(firstOfMonth());
    const [dateTo, setDateTo]           = useState(todayStr());

    useEffect(() => {
        const [f, t] = periodRange(period, customFrom, customTo);
        setDateFrom(f);
        setDateTo(t);
    }, [period, customFrom, customTo]);

    // ── Product autocomplete ──────────────────────────────────────────────────
    const [productSearch, setProductSearch]             = useState('');
    const [selectedProduct, setSelectedProduct]         = useState<Product | null>(null);
    const [showProductDropdown, setShowProductDropdown] = useState(false);
    const productInputRef = useRef<HTMLInputElement>(null);

    // ── Sale-type filter ──────────────────────────────────────────────────────
    const [saleType, setSaleType] = useState<SaleType>('all');

    // ── Expansion state ───────────────────────────────────────────────────────
    const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
    const [expandedBatches, setExpandedBatches]   = useState<Set<string>>(new Set());

    // ── Data ──────────────────────────────────────────────────────────────────
    const [products, setProducts]   = useState<Product[]>([]);
    const [batches, setBatches]     = useState<BatchDoc[]>([]);
    const [movements, setMovements] = useState<Movement[]>([]);
    const [saleRows, setSaleRows]   = useState<SaleRow[]>([]);
    const [adjustRows, setAdjustRows] = useState<AdjustRow[]>([]);
    const [loading, setLoading]     = useState(true);

    useEffect(() => {
        if (!tenantId) return;
        setLoading(true);

        // salesOrders — filtered by invoiceDate (business date), with index fallback
        const fetchSalesOrders = getDocs(
            query(
                getTenantCollection(db, tenantId, 'salesOrders'),
                where('invoiceDate', '>=', dateFrom),
                where('invoiceDate', '<=', dateTo),
                orderBy('invoiceDate', 'desc'),
            ),
        ).catch(() =>
            getDocs(query(getTenantCollection(db, tenantId, 'salesOrders'), orderBy('invoiceDate', 'desc')))
                .then(snap => ({
                    docs: snap.docs.filter(d => {
                        const inv = (d.data() as any).invoiceDate || '';
                        return inv >= dateFrom && inv <= dateTo;
                    }),
                }))
                .catch(() => ({ docs: [] as any[] })),
        );

        // auditLogs — Stock Adjustments (single-field where; date filtered in memory)
        const fetchAdjustments = getDocs(query(
            getTenantCollection(db, tenantId, 'auditLogs'),
            where('action', '==', 'Stock Adjustment'),
        )).catch(() => ({ docs: [] as any[] }));

        Promise.all([
            getDocs(query(getTenantCollection(db, tenantId, 'products'))),
            getDocs(query(getTenantCollection(db, tenantId, 'inventoryBatches'))),
            getDocs(query(
                getTenantCollection(db, tenantId, 'stockMovements'),
                where('date', '>=', dateFrom),
                where('date', '<=', dateTo),
                orderBy('date', 'desc'),
            )).catch(() => ({ docs: [] as any[] })),
            fetchSalesOrders,
            fetchAdjustments,
        ]).then(([pSnap, bSnap, mSnap, sSnap, aSnap]) => {
            const prods = (pSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Product[]);
            setProducts(prods);
            const batchDocs = bSnap.docs.map(d => ({ id: d.id, ...d.data() } as BatchDoc));
            setBatches(batchDocs);
            setMovements((mSnap as any).docs.map((d: any) => ({ id: d.id, ...d.data() } as Movement)));

            const prodMap = new Map(prods.map(p => [p.id, p]));

            // ── Sales from salesOrders ────────────────────────────────────────
            const rows: SaleRow[] = [];
            for (const doc of (sSnap as any).docs) {
                const o = doc.data() as any;
                if (o.status === 'cancelled') continue;
                const orderNum = (o.orderNumber || '').trim();
                const type: SaleRow['type'] = classifySale(orderNum);
                const date = o.invoiceDate || '';
                if (!date) continue;
                for (const li of (o.lineItems || [])) {
                    if (!li.productId) continue;
                    const prod = prodMap.get(li.productId);
                    // POS lines carry mrp/amount/unit; B2B lines carry rate/grossAmount/per — resolveSaleLine unifies both
                    const r = resolveSaleLine(li, prod);
                    rows.push({
                        orderId: doc.id,
                        orderNumber: orderNum,
                        date,
                        type,
                        customerName: o.retailerName || o.buyerName || 'Walk-in Customer',
                        productId: r.productId,
                        productName: r.productName,
                        qty: r.qty,
                        unit: r.unit,
                        rate: r.rate,
                        amount: r.amount,
                        gstPct: r.gstPct,
                        batchNo: r.batchNo,
                    });
                }
            }
            setSaleRows(rows);

            // ── Stock Adjustments from auditLogs ──────────────────────────────
            const batchById = new Map(batchDocs.map(b => [b.id, b]));
            const adjusts: AdjustRow[] = [];
            for (const doc of (aSnap as any).docs) {
                const a = doc.data() as any;
                const ts = a.timestamp;
                const when: Date | null = ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
                if (!when) continue;
                const date = toStr(when);
                if (date < dateFrom || date > dateTo) continue;
                const before = Number(a.before?.quantity);
                const after  = Number(a.after?.quantity);
                if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
                const delta = after - before;
                if (delta === 0) continue;
                const batch = a.entityId ? batchById.get(a.entityId) : undefined;
                if (!batch) continue;   // can't attribute to a product/batch
                adjusts.push({
                    id: `adj-${doc.id}`,
                    productId: batch.productId,
                    batchNumber: batch.batchNumber || '',
                    date,
                    delta,
                    after,
                    party: a.userName || 'System',
                });
            }
            setAdjustRows(adjusts);

            setLoading(false);
        }).catch(e => { console.error(e); setLoading(false); });
    }, [tenantId, dateFrom, dateTo]);

    // ── Lookups ───────────────────────────────────────────────────────────────
    const prodMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

    const productSuggestions = useMemo(() => {
        if (!productSearch.trim() || selectedProduct) return [];
        const q = productSearch.trim().toLowerCase();
        return products.filter(p => (p.name || '').toLowerCase().includes(q) || (p.mfgCompany || '').toLowerCase().includes(q)).slice(0, 8);
    }, [products, productSearch, selectedProduct]);

    const batchesByProduct = useMemo(() => {
        const map = new Map<string, BatchDoc[]>();
        for (const b of batches) {
            if (!b.productId) continue;
            const arr = map.get(b.productId) ?? [];
            arr.push(b);
            map.set(b.productId, arr);
        }
        return map;
    }, [batches]);

    // ── Unified transactions per product ──────────────────────────────────────
    const txnsByProduct = useMemo(() => {
        // Sale-side stockMovements keyed for remaining-stock enrichment
        const saleMovMap = new Map<string, Movement>();
        for (const m of movements) {
            if (m.type === 'purchase') continue;
            saleMovMap.set(`${m.sourceId}||${m.productId}||${m.batchNumber || ''}`, m);
        }
        // Batch purchase-rate lookup
        const batchRate = new Map<string, number>();
        for (const b of batches) batchRate.set(`${b.productId}||${b.batchNumber || ''}`, b.purchaseRate ?? 0);

        const map = new Map<string, Txn[]>();
        const push = (t: Txn) => { const a = map.get(t.productId) ?? []; a.push(t); map.set(t.productId, a); };

        // Purchases — from stockMovements
        for (const m of movements) {
            if (m.type !== 'purchase') continue;
            const rate = batchRate.get(`${m.productId}||${m.batchNumber || ''}`) || prodMap.get(m.productId)?.purchasePrice || 0;
            push({
                id: `mov-${m.id}`,
                productId: m.productId,
                batchNumber: m.batchNumber || '',
                kind: 'purchase',
                channel: 'purchase',
                party: m.supplierName || '—',
                date: m.date,
                invoiceNumber: m.sourceNumber || (m.sourceId ? m.sourceId.slice(-8).toUpperCase() : '—'),
                qty: m.qtyIn || 0,
                value: (m.qtyIn || 0) * rate,
                gst: 0,
                remaining: m.remainingBatchQty ?? m.remainingStock ?? null,
                orderId: m.sourceId,
            });
        }

        // Sales — from salesOrders, enriched with movement remaining stock
        saleRows.forEach((s, i) => {
            const mv = saleMovMap.get(`${s.orderId}||${s.productId}||${s.batchNo || ''}`);
            push({
                id: `sale-${s.orderId}-${s.productId}-${i}`,
                productId: s.productId,
                batchNumber: s.batchNo || '',
                kind: 'sale',
                channel: s.type === 'sale_pos' ? 'pos' : 'b2b',
                party: s.customerName,
                date: s.date,
                invoiceNumber: s.orderNumber || s.orderId.slice(-8).toUpperCase(),
                qty: s.qty,
                value: s.amount,
                gst: gstFromInclusive(s.amount, s.gstPct),
                remaining: mv?.remainingBatchQty ?? null,
                orderId: s.orderId,
                orderType: s.type,
            });
        });

        // Stock adjustments — from auditLogs
        for (const a of adjustRows) {
            push({
                id: a.id,
                productId: a.productId,
                batchNumber: a.batchNumber,
                kind: 'adjustment',
                channel: 'adjustment',
                party: a.party,
                date: a.date,
                invoiceNumber: '—',
                qty: a.delta,
                value: 0,
                gst: 0,
                remaining: a.after,
            });
        }

        // Newest first within each product
        for (const arr of map.values()) arr.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return map;
    }, [movements, saleRows, adjustRows, batches, prodMap]);

    // ── Product views (Product → Batch → Transactions) ────────────────────────
    const productViews = useMemo((): ProductView[] => {
        const filtered = products.filter(p => {
            if (selectedProduct) return p.id === selectedProduct.id;
            if (productSearch.trim()) {
                const q = productSearch.trim().toLowerCase();
                return (p.name || '').toLowerCase().includes(q) || (p.mfgCompany || '').toLowerCase().includes(q);
            }
            return true;
        });

        const keepTxn = (t: Txn) => {
            if (t.kind !== 'sale') return true;              // purchases & adjustments always shown
            if (saleType === 'all') return true;
            return t.channel === saleType;
        };

        return filtered.map(p => {
            const pb = batchesByProduct.get(p.id) ?? [];
            const batchStock   = pb.reduce((s, b) => s + (b.quantity || 0), 0);
            const productStock = (p.loosePieces ?? 0) + (p.quantity ?? 0) * (p.boxCapacity ?? 1);
            const currentStock = pb.length > 0 ? batchStock : productStock;

            const txns = (txnsByProduct.get(p.id) ?? []).filter(keepTxn);

            // Group by batch — seed with known inventory batches, then attach txns
            const groups = new Map<string, BatchGroup>();
            for (const b of pb) {
                const key = b.batchNumber || '—';
                if (!groups.has(key)) groups.set(key, { batchNumber: key, currentStock: b.quantity ?? 0, openingStock: null, purchasesQty: 0, salesQty: 0, adjustQty: 0, txns: [] });
                else groups.get(key)!.currentStock = (groups.get(key)!.currentStock ?? 0) + (b.quantity ?? 0);
            }
            for (const t of txns) {
                const key = t.batchNumber || '—';
                if (!groups.has(key)) groups.set(key, { batchNumber: key, currentStock: null, openingStock: null, purchasesQty: 0, salesQty: 0, adjustQty: 0, txns: [] });
                const g = groups.get(key)!;
                g.txns.push(t);
                if (t.kind === 'purchase')   g.purchasesQty += t.qty;
                else if (t.kind === 'sale')  g.salesQty     += t.qty;
                else                         g.adjustQty     += t.qty;
            }
            // Derive current & opening stock per batch
            for (const g of groups.values()) {
                if (g.currentStock == null) {
                    // transaction-only batch — best-effort from latest known remaining
                    const withRemaining = g.txns.find(t => t.remaining != null);
                    g.currentStock = withRemaining ? withRemaining.remaining : null;
                }
                g.openingStock = g.currentStock == null ? null
                    : openingStock(g.currentStock, g.purchasesQty, g.salesQty, g.adjustQty);
            }
            const batchGroups = [...groups.values()].sort((a, b) => a.batchNumber.localeCompare(b.batchNumber));

            const purchasesQty = txns.filter(t => t.kind === 'purchase').reduce((s, t) => s + t.qty, 0);
            const salesQty     = txns.filter(t => t.kind === 'sale').reduce((s, t) => s + t.qty, 0);
            const adjustQty    = txns.filter(t => t.kind === 'adjustment').reduce((s, t) => s + t.qty, 0);
            const opening      = openingStock(currentStock, purchasesQty, salesQty, adjustQty);

            const purchaseValue = txns.filter(t => t.kind === 'purchase').reduce((s, t) => s + t.value, 0);
            const salesValue    = txns.filter(t => t.kind === 'sale').reduce((s, t) => s + t.value, 0);
            const gstValue      = txns.filter(t => t.kind === 'sale').reduce((s, t) => s + t.gst, 0);

            return {
                product: p,
                currentStock,
                openingStock: opening,
                purchasesQty,
                salesQty,
                adjustQty,
                batchGroups,
                batchCount: pb.length,
                purchaseValue,
                salesValue,
                gstValue,
                txnCount: txns.length,
            };
        });
    }, [products, selectedProduct, productSearch, saleType, batchesByProduct, txnsByProduct]);

    // ── Summary totals (filtered period) ──────────────────────────────────────
    const summary = useMemo(() => {
        const uniqueBatches = new Set<string>();
        let activeProducts = 0;
        for (const v of productViews) {
            if (v.txnCount > 0) activeProducts++;
            for (const g of v.batchGroups) {
                if (g.txns.length > 0 && g.batchNumber !== '—') uniqueBatches.add(`${v.product.id}||${g.batchNumber}`);
            }
        }
        return {
            totalCurrentStock: productViews.reduce((s, v) => s + v.currentStock, 0),
            totalPurchaseValue: productViews.reduce((s, v) => s + v.purchaseValue, 0),
            totalSalesValue: productViews.reduce((s, v) => s + v.salesValue, 0),
            totalGst: productViews.reduce((s, v) => s + v.gstValue, 0),
            uniqueProducts: activeProducts,
            uniqueBatches: uniqueBatches.size,
        };
    }, [productViews]);

    // ── CSV export ────────────────────────────────────────────────────────────
    const handleExport = () => {
        const rows = productViews.map(v => ({
            'Product': v.product.name,
            'Opening Stock': v.openingStock,
            'Purchases': v.purchasesQty,
            'Sales': v.salesQty,
            'Adjustments': v.adjustQty,
            'Current Stock': v.currentStock,
            'Batches': v.batchCount,
            'Purchase Value': v.purchaseValue.toFixed(2),
            'Sales Value': v.salesValue.toFixed(2),
            'GST': v.gstValue.toFixed(2),
        }));
        const blob = new Blob(['﻿' + Papa.unparse(rows)], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `stock_report_${dateFrom}_${dateTo}.csv`; a.click(); URL.revokeObjectURL(a.href);
    };

    const toggleProduct = (id: string) =>
        setExpandedProducts(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleBatch = (key: string) =>
        setExpandedBatches(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

    const openInvoice = (t: Txn) => {
        if (t.kind !== 'sale' || !t.orderId) return;
        if (t.orderType === 'sale_pos') navigate(`/pos?reprintOrderId=${t.orderId}`);
        else navigate(`/b2b-invoice?orderId=${t.orderId}`);
    };

    const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' };
    const numHead: React.CSSProperties = { padding: '0.7rem 0.7rem', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' };
    const numCell: React.CSSProperties = { padding: '0.6rem 0.7rem', textAlign: 'right', whiteSpace: 'nowrap' };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ width: '100%' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '1.6rem', display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.15rem' }}>
                        <Package2 size={26} /> Stock Report
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Opening stock, movement (purchases · sales · adjustments) and closing stock — product → batch → transaction.
                    </p>
                </div>
                <button onClick={handleExport} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <Download size={15} /> Export CSV
                </button>
            </div>

            {/* ── Compact control section ───────────────────────────────────── */}
            <div className="glass-panel" style={{ position: 'relative', zIndex: 30, padding: '0.9rem 1.1rem', marginBottom: '1.1rem', borderRadius: '12px', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>

                {/* Product search */}
                <div style={{ flex: '1 1 260px', minWidth: '220px' }}>
                    <label style={labelStyle}>Product</label>
                    <div style={{ position: 'relative' }}>
                        <Search size={13} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
                        <input
                            ref={productInputRef}
                            className="input-field"
                            style={{ paddingLeft: '1.9rem', paddingRight: '1.8rem', margin: 0 }}
                            placeholder="Search product…"
                            value={productSearch}
                            onChange={e => {
                                setProductSearch(e.target.value);
                                if (selectedProduct) setSelectedProduct(null);
                                setShowProductDropdown(true);
                            }}
                            onFocus={() => setShowProductDropdown(true)}
                            onBlur={() => setTimeout(() => setShowProductDropdown(false), 180)}
                        />
                        {productSearch && (
                            <button onClick={() => { setProductSearch(''); setSelectedProduct(null); setShowProductDropdown(false); }}
                                style={{ position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 0 }}>
                                <X size={13} />
                            </button>
                        )}
                        {showProductDropdown && productSuggestions.length > 0 && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1500, backgroundColor: 'var(--bg-color)', border: '1px solid var(--surface-border)', borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.22)', marginTop: '3px', overflow: 'hidden' }}>
                                {productSuggestions.map(p => (
                                    <button key={p.id}
                                        onMouseDown={() => { setSelectedProduct(p); setProductSearch(p.name || ''); setShowProductDropdown(false); }}
                                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.55rem 0.85rem', background: 'none', border: 'none', borderBottom: '1px solid var(--surface-border)', cursor: 'pointer', font: 'inherit' }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{p.name}</div>
                                        {(p.mfgCompany || p.type) && (
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '1px' }}>
                                                {[p.mfgCompany, p.type].filter(Boolean).join(' · ')}
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Date filter */}
                <div>
                    <label style={labelStyle}><Calendar size={12} style={{ verticalAlign: '-1px', marginRight: '0.25rem' }} />Period</label>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {PERIODS.map(({ key, label }) => (
                            <button key={key} onClick={() => setPeriod(key)}
                                style={{ padding: '0.35rem 0.8rem', borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontWeight: period === key ? 700 : 500, fontSize: '0.8rem', font: 'inherit', transition: 'all 0.14s', background: period === key ? 'var(--primary)' : 'var(--surface-base)', color: period === key ? '#fff' : 'var(--text-secondary)', borderColor: period === key ? 'var(--primary)' : 'var(--surface-border)' }}>
                                {label}
                            </button>
                        ))}
                        {period === 'custom' && (
                            <>
                                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                                    style={{ padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '0.82rem', background: 'var(--surface-base)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>to</span>
                                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                                    style={{ padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '0.82rem', background: 'var(--surface-base)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                            </>
                        )}
                    </div>
                </div>

                {/* Sale-type filter */}
                <div>
                    <label style={labelStyle}>Sale Type</label>
                    <div style={{ display: 'flex', gap: '0', background: 'var(--surface-raised)', borderRadius: '9px', border: '1px solid var(--surface-border)', padding: '0.2rem' }}>
                        {SALE_TYPES.map(({ key, label }) => (
                            <button key={key} onClick={() => setSaleType(key)}
                                style={{ padding: '0.35rem 0.8rem', borderRadius: '7px', border: 'none', cursor: 'pointer', fontWeight: saleType === key ? 700 : 500, fontSize: '0.8rem', font: 'inherit', transition: 'all 0.14s', background: saleType === key ? 'var(--primary)' : 'transparent', color: saleType === key ? '#fff' : 'var(--text-secondary)' }}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-tertiary)', alignSelf: 'center' }}>
                    {fmtDate(dateFrom)} – {fmtDate(dateTo)}
                </span>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem' }}><Loader2 className="animate-spin" size={28} style={{ margin: '0 auto' }} /></div>
            ) : (
                <>
                    {/* ── Unified stock table ───────────────────────────────── */}
                    <div className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
                                        <th style={{ padding: '0.7rem 0.85rem', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Product</th>
                                        <th style={numHead}>Opening</th>
                                        <th style={numHead}>Purchases</th>
                                        <th style={numHead}>Sales</th>
                                        <th style={numHead}>Current</th>
                                        <th style={numHead}>Batches</th>
                                        <th style={numHead}>Purchase ₹</th>
                                        <th style={numHead}>Sales ₹</th>
                                        <th style={numHead}>GST ₹</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {productViews.length === 0 ? (
                                        <tr><td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No products found.</td></tr>
                                    ) : productViews.map((v, i) => {
                                        const pOpen = expandedProducts.has(v.product.id);
                                        return [
                                            // ── Product row ──
                                            <tr key={v.product.id}
                                                onClick={() => toggleProduct(v.product.id)}
                                                style={{ borderBottom: '1px solid var(--surface-border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-raised)', cursor: 'pointer' }}>
                                                <td style={{ padding: '0.65rem 0.85rem', fontWeight: 600 }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                                                        {pOpen ? <ChevronDown size={14} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />}
                                                        <span>{v.product.name}</span>
                                                    </span>
                                                </td>
                                                <td style={numCell}><StockNum value={v.openingStock} /></td>
                                                <td style={{ ...numCell, color: '#10b981', fontWeight: 600 }}>{v.purchasesQty > 0 ? `+${fmtNum(v.purchasesQty)}` : '—'}</td>
                                                <td style={{ ...numCell, color: '#ef4444', fontWeight: 600 }}>{v.salesQty > 0 ? `-${fmtNum(v.salesQty)}` : '—'}</td>
                                                <td style={numCell}><StockNum value={v.currentStock} /></td>
                                                <td style={{ ...numCell, color: 'var(--text-secondary)' }}>{v.batchCount}</td>
                                                <td style={{ ...numCell, color: '#10b981' }}>{fmtInr(v.purchaseValue)}</td>
                                                <td style={{ ...numCell, color: '#f59e0b' }}>{fmtInr(v.salesValue)}</td>
                                                <td style={{ ...numCell, color: 'var(--text-secondary)' }}>{fmtInr(v.gstValue)}</td>
                                            </tr>,

                                            // ── Batch rows ──
                                            ...(pOpen ? (v.batchGroups.length === 0 ? [
                                                <tr key={`${v.product.id}-nobatch`} style={{ borderBottom: '1px solid var(--surface-border)', background: 'hsla(0,0%,50%,0.04)' }}>
                                                    <td colSpan={9} style={{ padding: '0.6rem 0.85rem 0.6rem 2.5rem', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                                                        No batches or transactions in this period.
                                                    </td>
                                                </tr>,
                                            ] : v.batchGroups.flatMap(g => {
                                                const bKey = `${v.product.id}||${g.batchNumber}`;
                                                const bOpen = expandedBatches.has(bKey);
                                                return [
                                                    <tr key={bKey}
                                                        onClick={() => toggleBatch(bKey)}
                                                        style={{ borderBottom: '1px solid var(--surface-border)', background: 'hsla(0,0%,50%,0.04)', cursor: 'pointer' }}>
                                                        <td style={{ padding: '0.5rem 0.85rem 0.5rem 2.5rem' }}>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                {bOpen ? <ChevronDown size={12} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight size={12} style={{ color: 'var(--text-tertiary)' }} />}
                                                                <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                                    {g.batchNumber === '—' ? 'No batch' : g.batchNumber}
                                                                </span>
                                                            </span>
                                                        </td>
                                                        <td style={numCell}><StockNum value={g.openingStock} /></td>
                                                        <td style={{ ...numCell, color: '#10b981' }}>{g.purchasesQty > 0 ? `+${fmtNum(g.purchasesQty)}` : '—'}</td>
                                                        <td style={{ ...numCell, color: '#ef4444' }}>{g.salesQty > 0 ? `-${fmtNum(g.salesQty)}` : '—'}</td>
                                                        <td style={numCell}><StockNum value={g.currentStock} /></td>
                                                        <td colSpan={4} style={{ padding: '0.5rem 0.85rem', textAlign: 'right', color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>
                                                            {g.txns.length} transaction{g.txns.length === 1 ? '' : 's'}
                                                        </td>
                                                    </tr>,

                                                    // ── Transactions ──
                                                    ...(bOpen ? [
                                                        <tr key={`${bKey}-txns`}>
                                                            <td colSpan={9} style={{ padding: 0, background: 'var(--surface-base)' }}>
                                                                {g.txns.length === 0 ? (
                                                                    <div style={{ padding: '0.75rem 0.85rem 0.75rem 3.5rem', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                                                                        No transactions in this period.
                                                                    </div>
                                                                ) : (
                                                                    <div style={{ padding: '0.4rem 0.85rem 0.75rem 3.5rem', overflowX: 'auto' }}>
                                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                                            <thead>
                                                                                <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-tertiary)' }}>
                                                                                    {['Type', 'Channel', 'Party', 'Date', 'Invoice', 'Qty', 'Value', 'Remaining'].map(h => (
                                                                                        <th key={h} style={{ padding: '0.35rem 0.6rem', fontWeight: 600, textAlign: ['Qty', 'Value', 'Remaining'].includes(h) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                                                                    ))}
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {g.txns.map(t => {
                                                                                    const chip = CHANNEL_CHIP[t.channel];
                                                                                    const typeLabel = t.kind === 'purchase' ? 'Purchase' : t.kind === 'sale' ? 'Sale' : 'Adjustment';
                                                                                    const typeColor = t.kind === 'purchase' ? '#10b981' : t.kind === 'sale' ? '#f59e0b' : '#d97706';
                                                                                    const qtyStr = t.kind === 'purchase' ? `+${fmtNum(t.qty)}`
                                                                                        : t.kind === 'sale' ? `-${fmtNum(t.qty)}`
                                                                                        : `${t.qty > 0 ? '+' : ''}${fmtNum(t.qty)}`;
                                                                                    const qtyColor = t.kind === 'purchase' ? '#10b981' : t.kind === 'sale' ? '#ef4444' : '#d97706';
                                                                                    return (
                                                                                        <tr key={t.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                                                                                            <td style={{ padding: '0.35rem 0.6rem', fontWeight: 600, color: typeColor }}>{typeLabel}</td>
                                                                                            <td style={{ padding: '0.35rem 0.6rem' }}>
                                                                                                <span style={{ fontSize: '0.66rem', padding: '0.1rem 0.4rem', borderRadius: '999px', fontWeight: 700, background: chip.bg, color: chip.color }}>{chip.label}</span>
                                                                                            </td>
                                                                                            <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-secondary)' }}>{t.party}</td>
                                                                                            <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                                                                                            <td style={{ padding: '0.35rem 0.6rem' }}>
                                                                                                {t.kind === 'sale' && t.orderId ? (
                                                                                                    <button onClick={() => openInvoice(t)}
                                                                                                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 600, color: 'var(--primary-light)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                                                                                                        {t.invoiceNumber}
                                                                                                        <ExternalLink size={10} style={{ opacity: 0.7 }} />
                                                                                                    </button>
                                                                                                ) : (
                                                                                                    <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{t.invoiceNumber}</span>
                                                                                                )}
                                                                                            </td>
                                                                                            <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right', fontWeight: 700, color: qtyColor }}>{qtyStr}</td>
                                                                                            <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right' }}>{t.value ? fmtInr(t.value) : '—'}</td>
                                                                                            <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right' }}><StockNum value={t.remaining} /></td>
                                                                                        </tr>
                                                                                    );
                                                                                })}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>,
                                                    ] : []),
                                                ];
                                            })) : []),
                                        ];
                                    })}
                                </tbody>
                                {productViews.length > 0 && (
                                    <tfoot>
                                        <tr style={{ borderTop: '2px solid var(--surface-border)', background: 'var(--surface-raised)', fontWeight: 700 }}>
                                            <td style={{ padding: '0.65rem 0.85rem', fontSize: '0.82rem' }}>TOTALS ({productViews.length} products)</td>
                                            <td style={numCell}>{fmtNum(productViews.reduce((s, v) => s + v.openingStock, 0))}</td>
                                            <td style={{ ...numCell, color: '#10b981' }}>+{fmtNum(productViews.reduce((s, v) => s + v.purchasesQty, 0))}</td>
                                            <td style={{ ...numCell, color: '#ef4444' }}>-{fmtNum(productViews.reduce((s, v) => s + v.salesQty, 0))}</td>
                                            <td style={numCell}>{fmtNum(summary.totalCurrentStock)}</td>
                                            <td />
                                            <td style={{ ...numCell, color: '#10b981' }}>{fmtInr(summary.totalPurchaseValue)}</td>
                                            <td style={{ ...numCell, color: '#f59e0b' }}>{fmtInr(summary.totalSalesValue)}</td>
                                            <td style={numCell}>{fmtInr(summary.totalGst)}</td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
