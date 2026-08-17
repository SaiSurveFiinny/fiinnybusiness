import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { query, getDocs, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import {
    Package2, TrendingUp, AlertTriangle, Loader2,
    Search, X, Download, ChevronDown, ChevronRight, Calendar,
    ExternalLink,
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
    batchNo?: string;
}

interface ProductRow {
    product: Product;
    currentStock: number;
    batchCount: number;
    stockIn: number;
    stockOut: number;
    openingStock: number;
    closingStock: number;
    purchaseValue: number;
    salesQty: number;
    salesValue: number;
    batches: BatchDoc[];
    isLowStock: boolean;
}

// ── Period helpers ─────────────────────────────────────────────────────────────

type Period = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'this_quarter' | 'this_fy' | 'custom';

const PERIODS: { key: Period; label: string }[] = [
    { key: 'today',        label: 'Today' },
    { key: 'this_week',    label: 'This Week' },
    { key: 'this_month',   label: 'This Month' },
    { key: 'this_quarter', label: 'This Quarter' },
    { key: 'this_fy',      label: 'This FY' },
    { key: 'custom',       label: 'Custom' },
];

function toStr(d: Date) { return d.toISOString().slice(0, 10); }

function periodRange(p: Period, cf: string, ct: string): [string, string] {
    const now = new Date();
    const t = toStr(now);
    switch (p) {
        case 'today':        return [t, t];
        case 'yesterday':    { const y = new Date(now); y.setDate(y.getDate() - 1); const s = toStr(y); return [s, s]; }
        case 'this_week':    { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); return [toStr(d), t]; }
        case 'this_month':   return [toStr(new Date(now.getFullYear(), now.getMonth(), 1)), t];
        case 'this_quarter': { const qm = Math.floor(now.getMonth() / 3) * 3; return [toStr(new Date(now.getFullYear(), qm, 1)), t]; }
        case 'this_fy':      { const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; return [toStr(new Date(y, 3, 1)), t]; }
        case 'custom':       return cf && ct ? [cf, ct] : [t, t];
    }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LOW_STOCK = 100;
const fmtInr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s: string) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}-${m}-${y}`; };
const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const todayStr = () => new Date().toISOString().slice(0, 10);

const isPosOrder = (n: string) => /^KA-\d+$/i.test((n || '').trim());

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

    // ── Other filters ─────────────────────────────────────────────────────────
    const [categoryFilter, setCategoryFilter] = useState('');
    const [mfgFilter, setMfgFilter]           = useState('');
    const [batchFilter, setBatchFilter]       = useState('');
    const [activeSection, setActiveSection]   = useState<'summary' | 'purchases' | 'sales' | 'movement' | 'products'>('summary');
    const [summaryTab, setSummaryTab]         = useState<'batch' | 'overall' | 'lowstock'>('overall');

    // ── Data ──────────────────────────────────────────────────────────────────
    const [products, setProducts]     = useState<Product[]>([]);
    const [batches, setBatches]       = useState<BatchDoc[]>([]);
    const [movements, setMovements]   = useState<Movement[]>([]);
    const [saleRows, setSaleRows]     = useState<SaleRow[]>([]);
    const [loading, setLoading]       = useState(true);
    const [expandedProducts, setExpandedProducts]         = useState<Set<string>>(new Set());
    const [expandedBatchRows, setExpandedBatchRows]       = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!tenantId) return;
        setLoading(true);

        // salesOrders — fetch ALL without date filter to cover full history
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
        ]).then(([pSnap, bSnap, mSnap, sSnap]) => {
            // `name` coerced at the boundary — the search filters below call
            // .toLowerCase() on it, and a doc missing it crashes the report.
            const prods = (pSnap.docs.map(d => {
                const raw = d.data();
                return { id: d.id, ...raw, name: String(raw.name ?? '') };
            }) as Product[]);
            setProducts(prods);
            setBatches(bSnap.docs.map(d => ({ id: d.id, ...d.data() } as BatchDoc)));
            setMovements((mSnap as any).docs.map((d: any) => ({ id: d.id, ...d.data() } as Movement)));

            const prodMap = new Map(prods.map(p => [p.id, p]));
            const rows: SaleRow[] = [];
            for (const doc of (sSnap as any).docs) {
                const o = doc.data() as any;
                if (o.status === 'cancelled') continue;
                const orderNum = (o.orderNumber || '').trim();
                const type: SaleRow['type'] = isPosOrder(orderNum) ? 'sale_pos' : 'sale_b2b';
                const date = o.invoiceDate || '';
                if (!date) continue;
                for (const li of (o.lineItems || [])) {
                    if (!li.productId) continue;
                    const prod = prodMap.get(li.productId);
                    const qty = Math.abs(Number(li.quantity) || 0);
                    const rate = Number(li.mrp) || (prod ? (prod.sellingPrice ?? 0) : 0);
                    rows.push({
                        orderId: doc.id,
                        orderNumber: orderNum,
                        date,
                        type,
                        customerName: o.retailerName || o.buyerName || 'Walk-in Customer',
                        productId: li.productId,
                        productName: li.productName || prod?.name || '—',
                        qty,
                        unit: li.unit || prod?.unit || '',
                        rate,
                        amount: Number(li.amount) || qty * rate,
                        batchNo: li.batchNo || '',
                    });
                }
            }
            setSaleRows(rows);
            setLoading(false);
        }).catch(e => { console.error(e); setLoading(false); });
    }, [tenantId, dateFrom, dateTo]);

    // ── Derived categories / manufacturers ───────────────────────────────────
    const categories    = useMemo(() => [...new Set(products.map(p => p.type).filter(Boolean))].sort() as string[], [products]);
    const manufacturers = useMemo(() => [...new Set(products.map(p => p.mfgCompany).filter(Boolean))].sort() as string[], [products]);

    const productSuggestions = useMemo(() => {
        if (!productSearch.trim() || selectedProduct) return [];
        const q = productSearch.trim().toLowerCase();
        return products.filter(p => p.name.toLowerCase().includes(q) || (p.mfgCompany || '').toLowerCase().includes(q)).slice(0, 8);
    }, [products, productSearch, selectedProduct]);

    // ── Batch map ─────────────────────────────────────────────────────────────
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

    // ── Movement aggregates per product (stockMovements — purchases) ──────────
    const movByProduct = useMemo(() => {
        const map = new Map<string, { in: number; out: number; purchaseValue: number }>();
        for (const m of movements) {
            const a = map.get(m.productId) ?? { in: 0, out: 0, purchaseValue: 0 };
            a.in  += m.qtyIn  || 0;
            a.out += m.qtyOut || 0;
            map.set(m.productId, a);
        }
        return map;
    }, [movements]);

    // ── Sales aggregates per product (from salesOrders — all history) ─────────
    const saleByProduct = useMemo(() => {
        const map = new Map<string, { qty: number; value: number }>();
        for (const r of saleRows) {
            const a = map.get(r.productId) ?? { qty: 0, value: 0 };
            a.qty   += r.qty;
            a.value += r.amount;
            map.set(r.productId, a);
        }
        return map;
    }, [saleRows]);

    // ── Product rows ──────────────────────────────────────────────────────────
    const allProductRows = useMemo((): ProductRow[] => {
        return products.map(p => {
            const pb = batchesByProduct.get(p.id) ?? [];
            const batchStock   = pb.reduce((s, b) => s + (b.quantity || 0), 0);
            const productStock = (p.loosePieces ?? 0) + (p.quantity ?? 0) * (p.boxCapacity ?? 1);
            const currentStock = batchStock > 0 ? batchStock : productStock;
            const mov  = movByProduct.get(p.id)  ?? { in: 0, out: 0, purchaseValue: 0 };
            const sale = saleByProduct.get(p.id) ?? { qty: 0, value: 0 };
            const closingStock  = currentStock;
            const openingStock  = Math.max(0, closingStock - mov.in + mov.out);
            const purchaseValue = mov.in * (p.purchasePrice ?? 0);
            return {
                product: p, currentStock, batchCount: pb.length,
                stockIn: mov.in, stockOut: mov.out, openingStock, closingStock, purchaseValue,
                salesQty: sale.qty, salesValue: sale.value,
                batches: pb, isLowStock: currentStock < LOW_STOCK && currentStock > 0,
            };
        });
    }, [products, batchesByProduct, movByProduct, saleByProduct]);

    // ── Filtered product rows ─────────────────────────────────────────────────
    const filteredRows = useMemo(() => {
        const bf = batchFilter.trim().toLowerCase();
        return allProductRows.filter(r => {
            if (selectedProduct && r.product.id !== selectedProduct.id) return false;
            if (!selectedProduct && productSearch.trim()) {
                const q = productSearch.trim().toLowerCase();
                if (!r.product.name.toLowerCase().includes(q) && !(r.product.mfgCompany || '').toLowerCase().includes(q)) return false;
            }
            if (categoryFilter && r.product.type !== categoryFilter) return false;
            if (mfgFilter && r.product.mfgCompany !== mfgFilter) return false;
            if (bf && !r.batches.some(b => (b.batchNumber || '').toLowerCase().includes(bf))) return false;
            return true;
        });
    }, [allProductRows, selectedProduct, productSearch, categoryFilter, mfgFilter, batchFilter]);

    // ── Filtered movements ────────────────────────────────────────────────────
    const filteredMovements = useMemo(() => {
        return movements.filter(m => {
            if (selectedProduct) return m.productId === selectedProduct.id;
            if (productSearch.trim()) return m.productName.toLowerCase().includes(productSearch.trim().toLowerCase());
            return true;
        });
    }, [movements, selectedProduct, productSearch]);

    const purchaseMovements = useMemo(() => filteredMovements.filter(m => m.type === 'purchase'), [filteredMovements]);

    // ── Filtered sale rows ────────────────────────────────────────────────────
    const filteredSaleRows = useMemo(() => {
        return saleRows.filter(r => {
            if (selectedProduct) return r.productId === selectedProduct.id;
            if (productSearch.trim()) return r.productName.toLowerCase().includes(productSearch.trim().toLowerCase());
            return true;
        });
    }, [saleRows, selectedProduct, productSearch]);

    // ── Summary stats ─────────────────────────────────────────────────────────
    const summary = useMemo(() => {
        const totalStock      = filteredRows.reduce((s, r) => s + r.currentStock, 0);
        const totalStockValue = filteredRows.reduce((s, r) => s + r.currentStock * (r.product.purchasePrice ?? 0), 0);
        const lowStockCount   = filteredRows.filter(r => r.isLowStock).length;
        const outOfStock      = filteredRows.filter(r => r.currentStock === 0).length;
        const totalIn         = filteredRows.reduce((s, r) => s + r.stockIn, 0);
        const totalOut        = filteredRows.reduce((s, r) => s + r.stockOut, 0);
        const purchaseValue   = filteredRows.reduce((s, r) => s + r.purchaseValue, 0);
        const salesValue      = filteredSaleRows.reduce((s, r) => s + r.amount, 0);
        return { totalStock, totalStockValue, lowStockCount, outOfStock, totalIn, totalOut, purchaseValue, salesValue };
    }, [filteredRows, filteredSaleRows]);

    // ── CSV exports ───────────────────────────────────────────────────────────
    const handleExport = () => {
        const rows = filteredRows.map(r => ({
            'Product': r.product.name, 'Category': r.product.type || '', 'Manufacturer': r.product.mfgCompany || '',
            'Opening Stock': r.openingStock, 'Stock In': r.stockIn, 'Stock Out': r.stockOut,
            'Closing Stock': r.closingStock, 'Current Stock': r.currentStock, 'Batch Count': r.batchCount,
            'Low Stock': r.isLowStock ? 'Yes' : 'No', 'Purchase Value': r.purchaseValue.toFixed(2),
            'Sales Qty': r.salesQty, 'Sales Value': r.salesValue.toFixed(2),
            'MRP': (r.product.maxRetailPrice ?? 0).toFixed(2), 'Purchase Rate': (r.product.purchasePrice ?? 0).toFixed(2),
            'GST %': r.product.gstPct ?? 0,
        }));
        const blob = new Blob(['﻿' + Papa.unparse(rows)], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `stock_report_${dateFrom}_${dateTo}.csv`; a.click(); URL.revokeObjectURL(a.href);
    };

    const handleExportSales = () => {
        const rows = filteredSaleRows.map(r => ({
            'Date': r.date, 'Type': r.type === 'sale_pos' ? 'POS' : 'B2B',
            'Invoice': r.orderNumber, 'Customer': r.customerName,
            'Product': r.productName, 'Batch': r.batchNo || '',
            'Qty Sold': r.qty, 'Unit': r.unit, 'Rate': r.rate.toFixed(2), 'Sale Value': r.amount.toFixed(2),
        }));
        const blob = new Blob(['﻿' + Papa.unparse(rows)], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `sales_report_${dateFrom}_${dateTo}.csv`; a.click(); URL.revokeObjectURL(a.href);
    };

    const toggleProduct = (id: string) =>
        setExpandedProducts(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

    const toggleBatchRow = (id: string) =>
        setExpandedBatchRows(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

    const SECTIONS: { id: typeof activeSection; label: string }[] = [
        { id: 'summary',   label: 'Inventory Summary' },
        { id: 'movement',  label: 'Stock Movement' },
        { id: 'products',  label: 'Product Analytics' },
        { id: 'purchases', label: 'Purchase Analytics' },
        { id: 'sales',     label: 'Sales Analytics' },
    ];

    const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' };
    const showProductCol = !selectedProduct;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                        <Package2 size={28} /> Stock Report
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        Inventory analytics, batch-wise stock, and complete stock movement history.
                    </p>
                </div>
                <button onClick={handleExport} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                    <Download size={15} /> Export CSV
                </button>
            </div>

            {/* ── Period quick-filter ───────────────────────────────────────── */}
            <div className="glass-panel" style={{ padding: '0.85rem 1.25rem', marginBottom: '0.6rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Calendar size={15} style={{ color: 'var(--primary-light)', flexShrink: 0 }} />
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
                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {fmtDate(dateFrom)} – {fmtDate(dateTo)}
                </span>
            </div>

            {/* ── Detailed filters ──────────────────────────────────────────── */}
            <div className="glass-panel" style={{ padding: '0.85rem 1.25rem', marginBottom: '1.25rem', borderRadius: '12px', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>

                {/* Product autocomplete */}
                <div style={{ flex: '1 1 220px' }}>
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
                        {/* Autocomplete dropdown — fully opaque, high z-index */}
                        {showProductDropdown && productSuggestions.length > 0 && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1500, backgroundColor: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.22)', marginTop: '3px', overflow: 'hidden' }}>
                                {productSuggestions.map(p => (
                                    <button key={p.id}
                                        onMouseDown={() => { setSelectedProduct(p); setProductSearch(p.name); setShowProductDropdown(false); }}
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

                <div>
                    <label style={labelStyle}>Category</label>
                    <select className="input-field" style={{ margin: 0, minWidth: '140px' }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                        <option value="">All Categories</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>Manufacturer</label>
                    <select className="input-field" style={{ margin: 0, minWidth: '140px' }} value={mfgFilter} onChange={e => setMfgFilter(e.target.value)}>
                        <option value="">All Manufacturers</option>
                        {manufacturers.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>Batch No.</label>
                    <input className="input-field" style={{ margin: 0, width: '130px' }} placeholder="Filter batch…" value={batchFilter} onChange={e => setBatchFilter(e.target.value)} />
                </div>
                {(categoryFilter || mfgFilter || batchFilter || selectedProduct) && (
                    <button onClick={() => { setCategoryFilter(''); setMfgFilter(''); setBatchFilter(''); setSelectedProduct(null); setProductSearch(''); }} className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}>
                        Clear Filters
                    </button>
                )}
                <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-tertiary)', alignSelf: 'center' }}>
                    {filteredRows.length} of {products.length} products
                </span>
            </div>

            {/* Section Tabs */}
            <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                {SECTIONS.map(s => (
                    <button key={s.id} onClick={() => setActiveSection(s.id)}
                        className={activeSection === s.id ? 'btn btn-primary' : 'btn btn-secondary'}
                        style={{ padding: '0.35rem 0.85rem', fontSize: '0.82rem' }}>
                        {s.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem' }}><Loader2 className="animate-spin" size={28} style={{ margin: '0 auto' }} /></div>
            ) : (
                <>
                    {/* ── INVENTORY SUMMARY ─────────────────────────────────── */}
                    {activeSection === 'summary' && (
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem', marginBottom: '1.5rem' }}>
                                {[
                                    { label: 'Total Products', value: filteredRows.length, color: 'var(--primary-light)', icon: <Package2 size={16} /> },
                                    { label: 'Total Units in Stock', value: summary.totalStock.toLocaleString('en-IN'), color: '#10b981', icon: <TrendingUp size={16} /> },
                                    { label: 'Stock Value (Cost)', value: fmtInr(summary.totalStockValue), color: '#6366f1', icon: <TrendingUp size={16} /> },
                                    { label: 'Low Stock Products', value: summary.lowStockCount, color: '#f59e0b', icon: <AlertTriangle size={16} /> },
                                    { label: 'Out of Stock', value: summary.outOfStock, color: '#ef4444', icon: <AlertTriangle size={16} /> },
                                ].map(c => (
                                    <div key={c.label} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderLeft: `4px solid ${c.color}`, borderRadius: '12px', padding: '1rem' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: c.color, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>{c.icon} {c.label}</div>
                                        <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{c.value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* ── Sub-tabs ─────────────────────────────────────── */}
                            <div style={{ display: 'flex', gap: '0', marginBottom: '1rem', background: 'var(--surface-raised)', borderRadius: '10px', border: '1px solid var(--surface-border)', padding: '0.25rem', width: 'fit-content' }}>
                                {([
                                    { key: 'overall',  label: 'Overall Stock' },
                                    { key: 'batch',    label: 'Batch-wise Stock' },
                                    { key: 'lowstock', label: `Low Stock${summary.lowStockCount > 0 ? ` (${summary.lowStockCount})` : ''}` },
                                ] as { key: typeof summaryTab; label: string }[]).map(t => (
                                    <button key={t.key} onClick={() => setSummaryTab(t.key)}
                                        style={{ padding: '0.35rem 0.85rem', borderRadius: '7px', border: 'none', cursor: 'pointer', fontWeight: summaryTab === t.key ? 700 : 500, fontSize: '0.82rem', font: 'inherit', transition: 'all 0.14s', background: summaryTab === t.key ? 'var(--primary)' : 'transparent', color: summaryTab === t.key ? '#fff' : 'var(--text-secondary)' }}>
                                        {t.label}
                                    </button>
                                ))}
                            </div>

                            {/* ── Batch-wise Stock ─────────────────────────────── */}
                            {summaryTab === 'batch' && (
                            <div className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
                                <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--surface-border)', fontWeight: 700, fontSize: '0.95rem' }}>
                                    Batch-wise Stock
                                </div>
                                {filteredRows.filter(r => r.batchCount > 0).length === 0 ? (
                                    <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                                        No batch records found. Batches are created when Purchase Invoices are saved.
                                    </div>
                                ) : (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
                                                    <th style={{ padding: '0.55rem 0.85rem', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Product</th>
                                                    <th style={{ padding: '0.55rem 0.85rem', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Batch No.</th>
                                                    <th style={{ padding: '0.55rem 0.85rem', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Expiry Date</th>
                                                    <th style={{ padding: '0.55rem 0.85rem', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>Avail. Qty</th>
                                                    <th style={{ padding: '0.55rem 0.85rem', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Unit</th>
                                                    <th style={{ padding: '0.55rem 0.85rem', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Warehouse</th>
                                                    <th style={{ padding: '0.55rem 0.85rem', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredRows.filter(r => r.batchCount > 0).map((r, ri) => {
                                                    const isOpen = expandedBatchRows.has(r.product.id);
                                                    const multiRow = r.batches.length > 1;
                                                    const firstBatch = r.batches[0];
                                                    const rowBg = ri % 2 === 0 ? 'transparent' : 'var(--surface-raised)';

                                                    if (!multiRow) {
                                                        // Single batch — flat row
                                                        const b = firstBatch;
                                                        const daysLeft = b.expiryDate ? Math.floor((new Date(b.expiryDate).getTime() - Date.now()) / 86_400_000) : 999;
                                                        const expColor = daysLeft < 0 ? '#ef4444' : daysLeft <= 30 ? '#ef4444' : daysLeft <= 90 ? '#d97706' : '#10b981';
                                                        return (
                                                            <tr key={r.product.id} style={{ borderBottom: '1px solid var(--surface-border)', background: rowBg }}>
                                                                <td style={{ padding: '0.55rem 0.85rem', fontWeight: 600 }}>{r.product.name}</td>
                                                                <td style={{ padding: '0.55rem 0.85rem', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{b.batchNumber || '—'}</td>
                                                                <td style={{ padding: '0.55rem 0.85rem', color: expColor, fontWeight: daysLeft <= 90 ? 600 : 400 }}>{b.expiryDate ? fmtDate(b.expiryDate) : '—'}</td>
                                                                <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 700, color: r.isLowStock ? '#ef4444' : 'var(--text-primary)' }}>{b.quantity}</td>
                                                                <td style={{ padding: '0.55rem 0.85rem', color: 'var(--text-secondary)' }}>{r.product.unit || '—'}</td>
                                                                <td style={{ padding: '0.55rem 0.85rem', color: 'var(--text-secondary)' }}>{b.warehouse || '—'}</td>
                                                                <td style={{ padding: '0.55rem 0.85rem' }}>
                                                                    {daysLeft < 0 ? <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'hsla(0,84%,60%,0.12)', color: '#ef4444', fontWeight: 700 }}>EXPIRED</span>
                                                                        : daysLeft <= 90 ? <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'hsla(38,92%,50%,0.12)', color: '#d97706', fontWeight: 700 }}>EXPIRING</span>
                                                                        : <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'hsla(152,60%,40%,0.12)', color: '#10b981', fontWeight: 700 }}>OK</span>}
                                                                </td>
                                                            </tr>
                                                        );
                                                    }

                                                    // Multiple batches — collapsible header row + sub-rows
                                                    return [
                                                        <tr key={`${r.product.id}-hdr`} style={{ borderBottom: '1px solid var(--surface-border)', background: 'var(--surface-raised)', cursor: 'pointer' }}
                                                            onClick={() => toggleBatchRow(r.product.id)}>
                                                            <td style={{ padding: '0.55rem 0.85rem', fontWeight: 700 }}>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                                    {isOpen ? <ChevronDown size={13} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight size={13} style={{ color: 'var(--text-tertiary)' }} />}
                                                                    {r.product.name}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '0.55rem 0.85rem', color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>{r.batches.length} batches</td>
                                                            <td style={{ padding: '0.55rem 0.85rem' }} />
                                                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 700, color: r.isLowStock ? '#ef4444' : 'var(--text-primary)' }}>{r.currentStock}</td>
                                                            <td style={{ padding: '0.55rem 0.85rem', color: 'var(--text-secondary)' }}>{r.product.unit || '—'}</td>
                                                            <td colSpan={2} style={{ padding: '0.55rem 0.85rem' }}>
                                                                {r.isLowStock && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'hsla(38,92%,50%,0.12)', color: '#f59e0b', fontWeight: 700 }}>LOW STOCK</span>}
                                                            </td>
                                                        </tr>,
                                                        ...(isOpen ? r.batches.map((b, bi) => {
                                                            const daysLeft = b.expiryDate ? Math.floor((new Date(b.expiryDate).getTime() - Date.now()) / 86_400_000) : 999;
                                                            const expColor = daysLeft < 0 ? '#ef4444' : daysLeft <= 30 ? '#ef4444' : daysLeft <= 90 ? '#d97706' : '#10b981';
                                                            return (
                                                                <tr key={b.id} style={{ borderBottom: '1px solid var(--surface-border)', background: bi % 2 === 0 ? 'hsla(0,0%,50%,0.04)' : 'transparent' }}>
                                                                    <td style={{ padding: '0.45rem 0.85rem 0.45rem 2rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>↳</td>
                                                                    <td style={{ padding: '0.45rem 0.85rem', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{b.batchNumber || '—'}</td>
                                                                    <td style={{ padding: '0.45rem 0.85rem', color: expColor, fontWeight: daysLeft <= 90 ? 600 : 400 }}>{b.expiryDate ? fmtDate(b.expiryDate) : '—'}</td>
                                                                    <td style={{ padding: '0.45rem 0.85rem', textAlign: 'right', fontWeight: 700 }}>{b.quantity}</td>
                                                                    <td style={{ padding: '0.45rem 0.85rem', color: 'var(--text-secondary)' }}>{r.product.unit || '—'}</td>
                                                                    <td style={{ padding: '0.45rem 0.85rem', color: 'var(--text-secondary)' }}>{b.warehouse || '—'}</td>
                                                                    <td style={{ padding: '0.45rem 0.85rem' }}>
                                                                        {daysLeft < 0 ? <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'hsla(0,84%,60%,0.12)', color: '#ef4444', fontWeight: 700 }}>EXPIRED</span>
                                                                            : daysLeft <= 90 ? <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'hsla(38,92%,50%,0.12)', color: '#d97706', fontWeight: 700 }}>EXPIRING</span>
                                                                            : <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'hsla(152,60%,40%,0.12)', color: '#10b981', fontWeight: 700 }}>OK</span>}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        }) : []),
                                                    ];
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                            )}

                            {/* ── Overall Stock Summary ────────────────────────── */}
                            {summaryTab === 'overall' && (
                            <div className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
                                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Package2 size={16} style={{ color: 'var(--primary-light)' }} />
                                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Overall Stock Summary ({filteredRows.length} products)</span>
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
                                                {['Product', 'Category', 'Manufacturer', 'Current Stock', 'Stock Value', 'Batches', 'Status'].map(h => (
                                                    <th key={h} style={{ padding: '0.6rem 1rem', fontWeight: 600, textAlign: ['Current Stock', 'Stock Value', 'Batches'].includes(h) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredRows.length === 0 ? (
                                                <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No products found.</td></tr>
                                            ) : filteredRows.map((r, i) => (
                                                <tr key={r.product.id} style={{ borderBottom: '1px solid var(--surface-border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-raised)' }}>
                                                    <td style={{ padding: '0.6rem 1rem', fontWeight: 600 }}>{r.product.name}</td>
                                                    <td style={{ padding: '0.6rem 1rem', color: 'var(--text-secondary)' }}>{r.product.type || '—'}</td>
                                                    <td style={{ padding: '0.6rem 1rem', color: 'var(--text-secondary)' }}>{r.product.mfgCompany || '—'}</td>
                                                    <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: 700, color: r.isLowStock ? '#ef4444' : r.currentStock === 0 ? '#ef4444' : 'var(--text-primary)' }}>{r.currentStock}</td>
                                                    <td style={{ padding: '0.6rem 1rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{fmtInr(r.currentStock * (r.product.purchasePrice ?? 0))}</td>
                                                    <td style={{ padding: '0.6rem 1rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.batchCount}</td>
                                                    <td style={{ padding: '0.6rem 1rem' }}>
                                                        {r.currentStock === 0
                                                            ? <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'hsla(0,84%,60%,0.12)', color: '#ef4444', fontWeight: 700 }}>OUT</span>
                                                            : r.isLowStock
                                                                ? <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'hsla(38,92%,50%,0.12)', color: '#f59e0b', fontWeight: 700 }}>LOW</span>
                                                                : <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'hsla(152,60%,40%,0.12)', color: '#10b981', fontWeight: 700 }}>OK</span>
                                                        }
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            )}

                            {/* ── Low Stock ────────────────────────────────────── */}
                            {summaryTab === 'lowstock' && (
                            <div className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
                                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Low Stock Alert ({summary.lowStockCount} products)</span>
                                </div>
                                {summary.lowStockCount === 0 ? (
                                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                                        All products are adequately stocked.
                                    </div>
                                ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
                                            {['Product', 'Category', 'Manufacturer', 'Current Stock', 'Batches'].map(h => (
                                                <th key={h} style={{ padding: '0.6rem 1rem', fontWeight: 600, textAlign: 'left' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRows.filter(r => r.isLowStock).map(r => (
                                            <tr key={r.product.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                                                <td style={{ padding: '0.6rem 1rem', fontWeight: 600 }}>{r.product.name}</td>
                                                <td style={{ padding: '0.6rem 1rem', color: 'var(--text-secondary)' }}>{r.product.type || '—'}</td>
                                                <td style={{ padding: '0.6rem 1rem', color: 'var(--text-secondary)' }}>{r.product.mfgCompany || '—'}</td>
                                                <td style={{ padding: '0.6rem 1rem', fontWeight: 700, color: '#ef4444' }}>
                                                    {r.currentStock} units
                                                    <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '999px', background: 'hsla(0,84%,60%,0.12)', color: '#ef4444', fontWeight: 700 }}>LOW</span>
                                                </td>
                                                <td style={{ padding: '0.6rem 1rem', color: 'var(--text-secondary)' }}>{r.batchCount}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                )}
                            </div>
                            )}
                        </div>
                    )}

                    {/* ── STOCK MOVEMENT ────────────────────────────────────── */}
                    {activeSection === 'movement' && (
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
                                {[
                                    { label: `Opening Stock (before ${fmtDate(dateFrom)})`, value: filteredRows.reduce((s, r) => s + r.openingStock, 0).toLocaleString('en-IN'), color: '#6366f1' },
                                    { label: 'Stock In (Purchases)', value: `+${summary.totalIn.toLocaleString('en-IN')}`, color: '#10b981' },
                                    { label: 'Stock Out (Sales)', value: summary.totalOut.toLocaleString('en-IN'), color: '#ef4444' },
                                    { label: 'Closing Stock', value: filteredRows.reduce((s, r) => s + r.closingStock, 0).toLocaleString('en-IN'), color: 'var(--primary-light)' },
                                ].map(c => (
                                    <div key={c.label} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderLeft: `4px solid ${c.color}`, borderRadius: '12px', padding: '1rem' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: c.color, marginBottom: '0.35rem' }}>{c.label}</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: c.color }}>{c.value}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="glass-panel" style={{ borderRadius: '12px', overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
                                            {['Product', 'Category', 'Opening', 'Stock In', 'Stock Out', 'Closing', 'Current'].map(h => (
                                                <th key={h} style={{ padding: '0.7rem 0.85rem', fontWeight: 600, textAlign: ['Opening', 'Stock In', 'Stock Out', 'Closing', 'Current'].includes(h) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRows.length === 0
                                            ? <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No products found.</td></tr>
                                            : filteredRows.map((r, i) => (
                                                <tr key={r.product.id} style={{ borderBottom: '1px solid var(--surface-border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-raised)' }}>
                                                    <td style={{ padding: '0.6rem 0.85rem', fontWeight: 600 }}>{r.product.name}</td>
                                                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>{r.product.type || '—'}</td>
                                                    <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right' }}>{r.openingStock}</td>
                                                    <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{r.stockIn > 0 ? `+${r.stockIn}` : '—'}</td>
                                                    <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{r.stockOut > 0 ? r.stockOut : '—'}</td>
                                                    <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: 700 }}>{r.closingStock}</td>
                                                    <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right' }}>
                                                        <span style={{ fontWeight: 700, color: r.isLowStock ? '#ef4444' : 'var(--text-primary)' }}>{r.currentStock}</span>
                                                        {r.isLowStock && <span style={{ marginLeft: '0.3rem', fontSize: '0.65rem', padding: '0.1rem 0.3rem', borderRadius: '999px', background: 'hsla(0,84%,60%,0.12)', color: '#ef4444', fontWeight: 700 }}>LOW</span>}
                                                    </td>
                                                </tr>
                                            ))
                                        }
                                    </tbody>
                                    {filteredRows.length > 0 && (
                                        <tfoot>
                                            <tr style={{ borderTop: '2px solid var(--surface-border)', background: 'var(--surface-raised)', fontWeight: 700 }}>
                                                <td colSpan={2} style={{ padding: '0.6rem 0.85rem', fontSize: '0.82rem' }}>TOTALS ({filteredRows.length} products)</td>
                                                <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right' }}>{filteredRows.reduce((s, r) => s + r.openingStock, 0)}</td>
                                                <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', color: '#10b981' }}>+{summary.totalIn}</td>
                                                <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', color: '#ef4444' }}>{summary.totalOut}</td>
                                                <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right' }}>{filteredRows.reduce((s, r) => s + r.closingStock, 0)}</td>
                                                <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right' }}>{summary.totalStock}</td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ── PRODUCT ANALYTICS ─────────────────────────────────── */}
                    {activeSection === 'products' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                            {filteredRows.length === 0 && (
                                <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', borderRadius: '12px', color: 'var(--text-secondary)' }}>No products found.</div>
                            )}
                            {filteredRows.map(r => {
                                const isOpen = expandedProducts.has(r.product.id);
                                // Sales history for this product from salesOrders (full history)
                                const productSales = saleRows.filter(s => s.productId === r.product.id);
                                // Purchase movements from stockMovements
                                const productMovements = movements.filter(m => m.productId === r.product.id && m.type === 'purchase');
                                return (
                                    <div key={r.product.id} className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
                                        <button onClick={() => toggleProduct(r.product.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.9rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                                            <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{r.product.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.1rem' }}>{[r.product.type, r.product.mfgCompany].filter(Boolean).join(' · ')}</div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: '1.5rem', flexShrink: 0, textAlign: 'right' }}>
                                                {[
                                                    { lbl: 'Purchased', val: r.stockIn, color: '#10b981' },
                                                    { lbl: 'Sold (All Time)', val: r.salesQty, color: '#f59e0b' },
                                                    { lbl: 'Current Stock', val: r.currentStock, color: r.isLowStock ? '#ef4444' : 'var(--text-primary)' },
                                                    { lbl: 'Batches', val: r.batchCount, color: 'var(--text-primary)' },
                                                ].map(f => (
                                                    <div key={f.lbl}>
                                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.lbl}</div>
                                                        <div style={{ fontWeight: 700, color: f.color }}>
                                                            {f.val}
                                                            {f.lbl === 'Current Stock' && r.isLowStock && <span style={{ marginLeft: '0.3rem', fontSize: '0.6rem', padding: '0.05rem 0.3rem', borderRadius: '999px', background: 'hsla(0,84%,60%,0.12)', color: '#ef4444' }}>LOW</span>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </button>
                                        {isOpen && (
                                            <div style={{ padding: '0.5rem 1.25rem 1rem', borderTop: '1px solid var(--surface-border)' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                                                    {[
                                                        { label: 'MRP', value: fmtInr(r.product.maxRetailPrice ?? 0) },
                                                        { label: 'Purchase Rate', value: fmtInr(r.product.purchasePrice ?? 0) },
                                                        { label: 'Sales Rate', value: fmtInr(r.product.sellingPrice ?? 0) },
                                                        { label: 'GST %', value: `${r.product.gstPct ?? 0}%` },
                                                        { label: 'Opening Stock', value: r.openingStock },
                                                        { label: 'Stock In (Period)', value: `+${r.stockIn}` },
                                                        { label: 'Sold (Period)', value: r.stockOut },
                                                        { label: 'Purchase Value', value: fmtInr(r.purchaseValue) },
                                                    ].map(f => (
                                                        <div key={f.label} style={{ background: 'var(--surface-raised)', borderRadius: '8px', padding: '0.65rem 0.85rem' }}>
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>{f.label}</div>
                                                            <div style={{ fontWeight: 700 }}>{f.value}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                                {r.batches.length > 0 && (
                                                    <div style={{ marginBottom: '0.75rem' }}>
                                                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Batches</div>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                            {r.batches.map(b => {
                                                                const daysLeft = b.expiryDate ? Math.floor((new Date(b.expiryDate).getTime() - Date.now()) / 86_400_000) : 999;
                                                                const cc = daysLeft < 0 ? '#ef4444' : daysLeft <= 90 ? '#d97706' : '#10b981';
                                                                return (
                                                                    <span key={b.id} style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem', borderRadius: '8px', background: `${cc}14`, color: cc, fontWeight: 600, border: `1px solid ${cc}33` }}>
                                                                        {b.batchNumber || 'No batch'} · {b.quantity} units{b.expiryDate ? ` · Exp ${fmtDate(b.expiryDate)}` : ''}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                                {/* Purchase movements from stockMovements */}
                                                {productMovements.length > 0 && (
                                                    <div style={{ marginTop: '0.75rem' }}>
                                                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Purchase History ({fmtDate(dateFrom)} – {fmtDate(dateTo)})</div>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-tertiary)' }}>
                                                                    {['Date', 'Invoice', 'Supplier', 'Batch', 'Qty In', 'Balance'].map(h => (
                                                                        <th key={h} style={{ padding: '0.4rem 0.6rem', fontWeight: 600, textAlign: ['Qty In', 'Balance'].includes(h) ? 'right' : 'left' }}>{h}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {productMovements.map(m => (
                                                                    <tr key={m.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                                                                        <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-secondary)' }}>{fmtDate(m.date)}</td>
                                                                        <td style={{ padding: '0.35rem 0.6rem', fontFamily: 'monospace', fontSize: '0.72rem' }}>{m.sourceNumber || m.sourceId.slice(-8).toUpperCase()}</td>
                                                                        <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-secondary)' }}>{m.supplierName || '—'}</td>
                                                                        <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-secondary)' }}>{m.batchNumber || '—'}</td>
                                                                        <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>+{m.qtyIn}</td>
                                                                        <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right' }}>{m.remainingBatchQty ?? '—'}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                                {/* Sales history from salesOrders — full historical coverage */}
                                                {productSales.length > 0 && (
                                                    <div style={{ marginTop: '0.75rem' }}>
                                                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                            Sales History ({fmtDate(dateFrom)} – {fmtDate(dateTo)}) — {productSales.length} transactions
                                                        </div>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-tertiary)' }}>
                                                                    {['Date', 'Type', 'Invoice', 'Customer', 'Qty Sold', 'Sale Value'].map(h => (
                                                                        <th key={h} style={{ padding: '0.4rem 0.6rem', fontWeight: 600, textAlign: ['Qty Sold', 'Sale Value'].includes(h) ? 'right' : 'left' }}>{h}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {productSales.map((s, si) => (
                                                                    <tr key={`${s.orderId}-${si}`} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                                                                        <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-secondary)' }}>{fmtDate(s.date)}</td>
                                                                        <td style={{ padding: '0.35rem 0.6rem' }}>
                                                                            <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: '999px', fontWeight: 700, background: s.type === 'sale_pos' ? 'hsla(217,91%,60%,0.1)' : 'hsla(263,70%,60%,0.1)', color: s.type === 'sale_pos' ? '#3b82f6' : '#8b5cf6' }}>
                                                                                {s.type === 'sale_pos' ? 'POS' : 'B2B'}
                                                                            </span>
                                                                        </td>
                                                                        <td style={{ padding: '0.35rem 0.6rem' }}>
                                                                            <button onClick={() => s.type === 'sale_pos' ? navigate(`/pos?reprintOrderId=${s.orderId}`) : navigate('/b2b-invoice-worklist')}
                                                                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 600, color: 'var(--primary-light)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                                                                                {s.orderNumber || s.orderId.slice(-6).toUpperCase()}
                                                                                <ExternalLink size={10} style={{ opacity: 0.7 }} />
                                                                            </button>
                                                                        </td>
                                                                        <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-secondary)' }}>{s.customerName}</td>
                                                                        <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>{s.qty}</td>
                                                                        <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right' }}>{fmtInr(s.amount)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                            <tfoot>
                                                                <tr style={{ borderTop: '2px solid var(--surface-border)', fontWeight: 700 }}>
                                                                    <td colSpan={4} style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total</td>
                                                                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: '#f59e0b' }}>{productSales.reduce((s, x) => s + x.qty, 0)}</td>
                                                                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>{fmtInr(productSales.reduce((s, x) => s + x.amount, 0))}</td>
                                                                </tr>
                                                            </tfoot>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── PURCHASE ANALYTICS ────────────────────────────────── */}
                    {activeSection === 'purchases' && (
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
                                {[
                                    { label: 'Purchase Transactions', value: purchaseMovements.length, color: '#10b981' },
                                    { label: 'Total Qty Purchased', value: purchaseMovements.reduce((s, m) => s + (m.qtyIn || 0), 0).toLocaleString('en-IN'), color: '#6366f1' },
                                    { label: 'Est. Purchase Value', value: fmtInr(summary.purchaseValue), color: 'var(--primary-light)' },
                                    { label: 'Products Restocked', value: new Set(purchaseMovements.map(m => m.productId)).size, color: '#f59e0b' },
                                    { label: 'Suppliers', value: new Set(purchaseMovements.map(m => m.supplierName).filter(Boolean)).size, color: '#8b5cf6' },
                                ].map(c => (
                                    <div key={c.label} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderLeft: `4px solid ${c.color}`, borderRadius: '12px', padding: '1rem' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: c.color, marginBottom: '0.35rem' }}>{c.label}</div>
                                        <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{c.value}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="glass-panel" style={{ borderRadius: '12px', overflowX: 'auto' }}>
                                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--surface-border)', fontWeight: 700, fontSize: '0.9rem' }}>Purchase History ({fmtDate(dateFrom)} – {fmtDate(dateTo)})</div>
                                {purchaseMovements.length === 0
                                    ? <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No purchase movements in this period.</div>
                                    : (
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '2px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
                                                    {['Date', 'Invoice / Source', 'Supplier', 'Product', 'Batch', 'Qty In', 'Batch Balance'].map(h => (
                                                        <th key={h} style={{ padding: '0.65rem 0.85rem', fontWeight: 600, textAlign: ['Qty In', 'Batch Balance'].includes(h) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {purchaseMovements.map((m, i) => (
                                                    <tr key={m.id} style={{ borderBottom: '1px solid var(--surface-border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-raised)' }}>
                                                        <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(m.date)}</td>
                                                        <td style={{ padding: '0.6rem 0.85rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{m.sourceNumber || m.sourceId.slice(-8).toUpperCase()}</td>
                                                        <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>{m.supplierName || '—'}</td>
                                                        <td style={{ padding: '0.6rem 0.85rem', fontWeight: 600 }}>{m.productName}</td>
                                                        <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.78rem' }}>{m.batchNumber || '—'}</td>
                                                        <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>+{m.qtyIn}</td>
                                                        <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right' }}>{m.remainingBatchQty ?? '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                            </div>
                        </div>
                    )}

                    {/* ── SALES ANALYTICS ───────────────────────────────────── */}
                    {activeSection === 'sales' && (
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
                                {[
                                    { label: 'Sale Lines', value: filteredSaleRows.length, color: '#3b82f6' },
                                    { label: 'Total Qty Sold', value: filteredSaleRows.reduce((s, r) => s + r.qty, 0).toLocaleString('en-IN'), color: '#f59e0b' },
                                    { label: 'Est. Sales Value', value: fmtInr(filteredSaleRows.reduce((s, r) => s + r.amount, 0)), color: '#10b981' },
                                    { label: 'POS Sales', value: filteredSaleRows.filter(r => r.type === 'sale_pos').length, color: '#6366f1' },
                                    { label: 'B2B Sales', value: filteredSaleRows.filter(r => r.type === 'sale_b2b').length, color: '#8b5cf6' },
                                ].map(c => (
                                    <div key={c.label} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderLeft: `4px solid ${c.color}`, borderRadius: '12px', padding: '1rem' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: c.color, marginBottom: '0.35rem' }}>{c.label}</div>
                                        <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{c.value}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="glass-panel" style={{ borderRadius: '12px', overflowX: 'auto' }}>
                                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                                        Sales History ({fmtDate(dateFrom)} – {fmtDate(dateTo)})
                                        {selectedProduct && <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>— {selectedProduct.name}</span>}
                                    </span>
                                    {filteredSaleRows.length > 0 && (
                                        <button onClick={handleExportSales} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}>
                                            <Download size={13} /> Export Sales CSV
                                        </button>
                                    )}
                                </div>

                                {filteredSaleRows.length === 0
                                    ? <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No sales in this period.</div>
                                    : (
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '2px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
                                                    {showProductCol && <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Product</th>}
                                                    <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Customer / Retailer</th>
                                                    <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Bill Number</th>
                                                    <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Date</th>
                                                    <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>Qty Sold</th>
                                                    <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Unit</th>
                                                    <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>Sale Value</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredSaleRows.map((r, i) => (
                                                    <tr key={`${r.orderId}-${r.productId}-${i}`} style={{ borderBottom: '1px solid var(--surface-border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-raised)' }}>
                                                        {showProductCol && <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>{r.productName}</td>}
                                                        <td style={{ padding: '0.6rem 0.85rem', fontWeight: 600 }}>{r.customerName}</td>
                                                        <td style={{ padding: '0.6rem 0.85rem' }}>
                                                            <button
                                                                onClick={() => r.type === 'sale_pos'
                                                                    ? navigate(`/pos?reprintOrderId=${r.orderId}`)
                                                                    : navigate('/b2b-invoice-worklist')}
                                                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 600, color: 'var(--primary-light)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                                                                {r.orderNumber || r.orderId.slice(-8).toUpperCase()}
                                                                <ExternalLink size={11} style={{ opacity: 0.7 }} />
                                                            </button>
                                                            <span style={{ marginLeft: '0.4rem', fontSize: '0.68rem', padding: '0.1rem 0.35rem', borderRadius: '999px', fontWeight: 700, background: r.type === 'sale_pos' ? 'hsla(217,91%,60%,0.1)' : 'hsla(263,70%,60%,0.1)', color: r.type === 'sale_pos' ? '#3b82f6' : '#8b5cf6' }}>
                                                                {r.type === 'sale_pos' ? 'POS' : 'B2B'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                                                        <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>{r.qty}</td>
                                                        <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>{r.unit || '—'}</td>
                                                        <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: 600 }}>{fmtInr(r.amount)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr style={{ borderTop: '2px solid var(--surface-border)', background: 'var(--surface-raised)', fontWeight: 800 }}>
                                                    <td colSpan={showProductCol ? 4 : 3} style={{ padding: '0.65rem 0.85rem', fontSize: '0.82rem' }}>
                                                        TOTAL ({filteredSaleRows.length} lines)
                                                    </td>
                                                    <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: '#f59e0b' }}>
                                                        {filteredSaleRows.reduce((s, r) => s + r.qty, 0).toLocaleString('en-IN')}
                                                    </td>
                                                    <td />
                                                    <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>
                                                        {fmtInr(filteredSaleRows.reduce((s, r) => s + r.amount, 0))}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
