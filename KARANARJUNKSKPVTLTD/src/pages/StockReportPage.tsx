import { useState, useEffect, useMemo } from 'react';
import { query, getDocs, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import {
    Package2, TrendingUp, TrendingDown, AlertTriangle, Loader2,
    Search, X, Download, ChevronDown, ChevronRight,
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
    date: string;
    createdAt?: any;
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

// ── Constants ─────────────────────────────────────────────────────────────────

const LOW_STOCK = 100;
const fmtInr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s: string) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}-${m}-${y}`; };
const today = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

// ── Component ─────────────────────────────────────────────────────────────────

export default function StockReportPage() {
    const { tenantId } = useAuth();

    // ── Filters ───────────────────────────────────────────────────────────────
    const [dateFrom, setDateFrom] = useState(firstOfMonth());
    const [dateTo, setDateTo] = useState(today());
    const [productSearch, setProductSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [mfgFilter, setMfgFilter] = useState('');
    const [batchFilter, setBatchFilter] = useState('');
    const [activeSection, setActiveSection] = useState<'summary' | 'purchases' | 'sales' | 'movement' | 'products'>('summary');

    // ── Data ──────────────────────────────────────────────────────────────────
    const [products, setProducts] = useState<Product[]>([]);
    const [batches, setBatches] = useState<BatchDoc[]>([]);
    const [movements, setMovements] = useState<Movement[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!tenantId) return;
        setLoading(true);
        Promise.all([
            getDocs(query(getTenantCollection(db, tenantId, 'products'))),
            getDocs(query(getTenantCollection(db, tenantId, 'inventoryBatches'))),
            getDocs(query(
                getTenantCollection(db, tenantId, 'stockMovements'),
                where('date', '>=', dateFrom),
                where('date', '<=', dateTo),
                orderBy('date', 'desc'),
            )),
        ]).then(([pSnap, bSnap, mSnap]) => {
            setProducts(pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
            setBatches(bSnap.docs.map(d => ({ id: d.id, ...d.data() } as BatchDoc)));
            setMovements(mSnap.docs.map(d => ({ id: d.id, ...d.data() } as Movement)));
            setLoading(false);
        }).catch(e => { console.error(e); setLoading(false); });
    }, [tenantId, dateFrom, dateTo]);

    // ── Derived categories / manufacturers for filter dropdowns ───────────────
    const categories = useMemo(() => [...new Set(products.map(p => p.type).filter(Boolean))].sort() as string[], [products]);
    const manufacturers = useMemo(() => [...new Set(products.map(p => p.mfgCompany).filter(Boolean))].sort() as string[], [products]);

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

    // ── Movement aggregates per product ───────────────────────────────────────
    const movByProduct = useMemo(() => {
        const map = new Map<string, { in: number; out: number; purchaseValue: number; salesQty: number; salesValue: number }>();
        for (const m of movements) {
            const a = map.get(m.productId) ?? { in: 0, out: 0, purchaseValue: 0, salesQty: 0, salesValue: 0 };
            a.in += m.qtyIn || 0;
            a.out += m.qtyOut || 0;
            map.set(m.productId, a);
        }
        return map;
    }, [movements]);

    // ── Product rows with all analytics ──────────────────────────────────────
    const allProductRows = useMemo((): ProductRow[] => {
        return products.map(p => {
            const pb = batchesByProduct.get(p.id) ?? [];
            const batchStock = pb.reduce((s, b) => s + (b.quantity || 0), 0);
            const productStock = (p.loosePieces ?? 0) + (p.quantity ?? 0) * (p.boxCapacity ?? 1);
            const currentStock = batchStock > 0 ? batchStock : productStock;
            const mov = movByProduct.get(p.id) ?? { in: 0, out: 0, purchaseValue: 0, salesQty: 0, salesValue: 0 };
            const closingStock = currentStock;
            const openingStock = Math.max(0, closingStock - mov.in + mov.out);
            // Estimate purchase value from movements × purchasePrice
            const purchaseValue = mov.in * (p.purchasePrice ?? 0);
            return {
                product: p,
                currentStock,
                batchCount: pb.length,
                stockIn: mov.in,
                stockOut: mov.out,
                openingStock,
                closingStock,
                purchaseValue,
                salesQty: mov.out,
                salesValue: mov.out * (p.sellingPrice ?? 0),
                batches: pb,
                isLowStock: currentStock < LOW_STOCK && currentStock > 0,
            };
        });
    }, [products, batchesByProduct, movByProduct]);

    // ── Filter applied to product rows ────────────────────────────────────────
    const filteredRows = useMemo(() => {
        const q = productSearch.trim().toLowerCase();
        const bf = batchFilter.trim().toLowerCase();
        return allProductRows.filter(r => {
            if (categoryFilter && r.product.type !== categoryFilter) return false;
            if (mfgFilter && r.product.mfgCompany !== mfgFilter) return false;
            if (q && !r.product.name.toLowerCase().includes(q) && !(r.product.mfgCompany || '').toLowerCase().includes(q)) return false;
            if (bf && !r.batches.some(b => (b.batchNumber || '').toLowerCase().includes(bf))) return false;
            return true;
        });
    }, [allProductRows, productSearch, categoryFilter, mfgFilter, batchFilter]);

    // ── Filtered movements ────────────────────────────────────────────────────
    const filteredMovements = useMemo(() => {
        const q = productSearch.trim().toLowerCase();
        return movements.filter(m => !q || m.productName.toLowerCase().includes(q) || (m.batchNumber || '').toLowerCase().includes(q));
    }, [movements, productSearch]);

    const purchaseMovements = useMemo(() => filteredMovements.filter(m => m.type === 'purchase'), [filteredMovements]);
    const saleMovements = useMemo(() => filteredMovements.filter(m => m.type !== 'purchase'), [filteredMovements]);

    // ── Summary stats ─────────────────────────────────────────────────────────
    const summary = useMemo(() => {
        const totalStock = filteredRows.reduce((s, r) => s + r.currentStock, 0);
        const totalStockValue = filteredRows.reduce((s, r) => s + r.currentStock * (r.product.purchasePrice ?? 0), 0);
        const lowStockCount = filteredRows.filter(r => r.isLowStock).length;
        const outOfStock = filteredRows.filter(r => r.currentStock === 0).length;
        const totalIn = filteredRows.reduce((s, r) => s + r.stockIn, 0);
        const totalOut = filteredRows.reduce((s, r) => s + r.stockOut, 0);
        const purchaseValue = filteredRows.reduce((s, r) => s + r.purchaseValue, 0);
        const salesValue = filteredRows.reduce((s, r) => s + r.salesValue, 0);
        return { totalStock, totalStockValue, lowStockCount, outOfStock, totalIn, totalOut, purchaseValue, salesValue };
    }, [filteredRows]);

    // ── CSV export ────────────────────────────────────────────────────────────
    const handleExport = () => {
        const rows = filteredRows.map(r => ({
            'Product': r.product.name,
            'Category': r.product.type || '',
            'Manufacturer': r.product.mfgCompany || '',
            'Opening Stock': r.openingStock,
            'Stock In': r.stockIn,
            'Stock Out': r.stockOut,
            'Closing Stock': r.closingStock,
            'Current Stock': r.currentStock,
            'Batch Count': r.batchCount,
            'Low Stock': r.isLowStock ? 'Yes' : 'No',
            'Purchase Value': r.purchaseValue.toFixed(2),
            'Sales Qty': r.salesQty,
            'Sales Value': r.salesValue.toFixed(2),
            'MRP': (r.product.maxRetailPrice ?? 0).toFixed(2),
            'Purchase Rate': (r.product.purchasePrice ?? 0).toFixed(2),
            'GST %': r.product.gstPct ?? 0,
        }));
        const csv = Papa.unparse(rows);
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `stock_report_${dateFrom}_${dateTo}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const toggleProduct = (id: string) =>
        setExpandedProducts(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

    // ── Section nav ───────────────────────────────────────────────────────────
    const SECTIONS: { id: typeof activeSection; label: string }[] = [
        { id: 'summary',   label: 'Inventory Summary' },
        { id: 'movement',  label: 'Stock Movement' },
        { id: 'products',  label: 'Product Analytics' },
        { id: 'purchases', label: 'Purchase Analytics' },
        { id: 'sales',     label: 'Sales Analytics' },
    ];

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

            {/* Filters */}
            <div className="glass-panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', borderRadius: '12px', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Date From</label>
                    <input type="date" className="input-field" style={{ margin: 0, width: '150px' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Date To</label>
                    <input type="date" className="input-field" style={{ margin: 0, width: '150px' }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
                <div style={{ flex: '1 1 180px' }}>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Product</label>
                    <div style={{ position: 'relative' }}>
                        <Search size={13} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                        <input className="input-field" style={{ paddingLeft: '1.9rem', margin: 0 }} placeholder="Search product…" value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                        {productSearch && <button onClick={() => setProductSearch('')} style={{ position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex' }}><X size={13} /></button>}
                    </div>
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Category</label>
                    <select className="input-field" style={{ margin: 0, minWidth: '140px' }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                        <option value="">All Categories</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Manufacturer</label>
                    <select className="input-field" style={{ margin: 0, minWidth: '140px' }} value={mfgFilter} onChange={e => setMfgFilter(e.target.value)}>
                        <option value="">All Manufacturers</option>
                        {manufacturers.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Batch No.</label>
                    <input className="input-field" style={{ margin: 0, width: '130px' }} placeholder="Filter batch…" value={batchFilter} onChange={e => setBatchFilter(e.target.value)} />
                </div>
                {(categoryFilter || mfgFilter || batchFilter) && (
                    <button onClick={() => { setCategoryFilter(''); setMfgFilter(''); setBatchFilter(''); }} className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}>
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
                            {/* KPI Cards */}
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

                            {/* Batch-wise Stock */}
                            <div className="glass-panel" style={{ borderRadius: '12px', padding: '1.25rem', marginBottom: '1.25rem' }}>
                                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>Batch-wise Stock</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                                    {filteredRows.filter(r => r.batchCount > 0).slice(0, 20).map(r => (
                                        <div key={r.product.id} style={{ border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '0.85rem' }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.4rem', display: 'flex', justifyContent: 'space-between' }}>
                                                <span>{r.product.name}</span>
                                                <span style={{ fontSize: '0.75rem', color: r.isLowStock ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                                                    {r.currentStock} units{r.isLowStock && ' ⚠ Low'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                                {r.batches.map(b => {
                                                    const exp = b.expiryDate ? new Date(b.expiryDate) : null;
                                                    const daysLeft = exp ? Math.floor((exp.getTime() - Date.now()) / 86_400_000) : 999;
                                                    const chipColor = daysLeft < 0 ? '#ef4444' : daysLeft <= 30 ? '#ef4444' : daysLeft <= 90 ? '#d97706' : '#10b981';
                                                    return (
                                                        <span key={b.id} style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', borderRadius: '6px', background: `${chipColor}14`, color: chipColor, fontWeight: 600, border: `1px solid ${chipColor}33` }}>
                                                            {b.batchNumber || 'No batch'} · {b.quantity} {b.expiryDate ? `· ${fmtDate(b.expiryDate)}` : ''}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                    {filteredRows.filter(r => r.batchCount > 0).length === 0 && (
                                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                                            No batch records found. Batches are created when Purchase Invoices are saved.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Low Stock Alert Table */}
                            {summary.lowStockCount > 0 && (
                                <div className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
                                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Low Stock Alert ({summary.lowStockCount} products)</span>
                                    </div>
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
                                    { label: 'Stock Out (Sales)', value: `-${summary.totalOut.toLocaleString('en-IN')}`, color: '#ef4444' },
                                    { label: 'Closing Stock', value: filteredRows.reduce((s, r) => s + r.closingStock, 0).toLocaleString('en-IN'), color: 'var(--primary-light)' },
                                ].map(c => (
                                    <div key={c.label} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderLeft: `4px solid ${c.color}`, borderRadius: '12px', padding: '1rem' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: c.color, marginBottom: '0.35rem' }}>{c.label}</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: c.color }}>{c.value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Per-product movement table */}
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
                                        {filteredRows.length === 0 ? (
                                            <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No products found.</td></tr>
                                        ) : filteredRows.map((r, i) => (
                                            <tr key={r.product.id} style={{ borderBottom: '1px solid var(--surface-border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-raised)' }}>
                                                <td style={{ padding: '0.6rem 0.85rem', fontWeight: 600 }}>{r.product.name}</td>
                                                <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>{r.product.type || '—'}</td>
                                                <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right' }}>{r.openingStock}</td>
                                                <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{r.stockIn > 0 ? `+${r.stockIn}` : '—'}</td>
                                                <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{r.stockOut > 0 ? `-${r.stockOut}` : '—'}</td>
                                                <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: 700 }}>{r.closingStock}</td>
                                                <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right' }}>
                                                    <span style={{ fontWeight: 700, color: r.isLowStock ? '#ef4444' : 'var(--text-primary)' }}>{r.currentStock}</span>
                                                    {r.isLowStock && <span style={{ marginLeft: '0.3rem', fontSize: '0.65rem', padding: '0.1rem 0.3rem', borderRadius: '999px', background: 'hsla(0,84%,60%,0.12)', color: '#ef4444', fontWeight: 700 }}>LOW</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {filteredRows.length > 0 && (
                                        <tfoot>
                                            <tr style={{ borderTop: '2px solid var(--surface-border)', background: 'var(--surface-raised)', fontWeight: 700 }}>
                                                <td colSpan={2} style={{ padding: '0.6rem 0.85rem', fontSize: '0.82rem' }}>TOTALS ({filteredRows.length} products)</td>
                                                <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right' }}>{filteredRows.reduce((s, r) => s + r.openingStock, 0)}</td>
                                                <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', color: '#10b981' }}>+{summary.totalIn}</td>
                                                <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', color: '#ef4444' }}>-{summary.totalOut}</td>
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
                                return (
                                    <div key={r.product.id} className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
                                        <button onClick={() => toggleProduct(r.product.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.9rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                                            <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{r.product.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.1rem' }}>
                                                    {[r.product.type, r.product.mfgCompany].filter(Boolean).join(' · ')}
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: '1.5rem', flexShrink: 0, textAlign: 'right' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Purchased</div>
                                                    <div style={{ fontWeight: 700, color: '#10b981' }}>{r.stockIn}</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sold</div>
                                                    <div style={{ fontWeight: 700, color: '#f59e0b' }}>{r.stockOut}</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Current Stock</div>
                                                    <div style={{ fontWeight: 700, color: r.isLowStock ? '#ef4444' : 'var(--text-primary)' }}>
                                                        {r.currentStock}
                                                        {r.isLowStock && <span style={{ marginLeft: '0.3rem', fontSize: '0.6rem', padding: '0.05rem 0.3rem', borderRadius: '999px', background: 'hsla(0,84%,60%,0.12)', color: '#ef4444' }}>LOW</span>}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Batches</div>
                                                    <div style={{ fontWeight: 700 }}>{r.batchCount}</div>
                                                </div>
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
                                                        { label: 'Stock In', value: `+${r.stockIn}` },
                                                        { label: 'Stock Out', value: `-${r.stockOut}` },
                                                        { label: 'Purchase Value', value: fmtInr(r.purchaseValue) },
                                                    ].map(f => (
                                                        <div key={f.label} style={{ background: 'var(--surface-raised)', borderRadius: '8px', padding: '0.65rem 0.85rem' }}>
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>{f.label}</div>
                                                            <div style={{ fontWeight: 700 }}>{f.value}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                                {/* Batch chips */}
                                                {r.batches.length > 0 && (
                                                    <div>
                                                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Batches</div>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                            {r.batches.map(b => {
                                                                const daysLeft = b.expiryDate ? Math.floor((new Date(b.expiryDate).getTime() - Date.now()) / 86_400_000) : 999;
                                                                const c = daysLeft < 0 ? '#ef4444' : daysLeft <= 90 ? '#d97706' : '#10b981';
                                                                return (
                                                                    <span key={b.id} style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem', borderRadius: '8px', background: `${c}14`, color: c, fontWeight: 600, border: `1px solid ${c}33` }}>
                                                                        {b.batchNumber || 'No batch'} · {b.quantity} units{b.expiryDate ? ` · Exp ${fmtDate(b.expiryDate)}` : ''}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                                {/* Movement history for this product */}
                                                {filteredMovements.filter(m => m.productId === r.product.id).length > 0 && (
                                                    <div style={{ marginTop: '0.75rem' }}>
                                                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Movement History ({fmtDate(dateFrom)} – {fmtDate(dateTo)})</div>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-tertiary)' }}>
                                                                    {['Date', 'Type', 'Source', 'Batch', 'In', 'Out', 'Balance'].map(h => (
                                                                        <th key={h} style={{ padding: '0.4rem 0.6rem', fontWeight: 600, textAlign: ['In', 'Out', 'Balance'].includes(h) ? 'right' : 'left' }}>{h}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {filteredMovements.filter(m => m.productId === r.product.id).map(m => (
                                                                    <tr key={m.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                                                                        <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-secondary)' }}>{fmtDate(m.date)}</td>
                                                                        <td style={{ padding: '0.35rem 0.6rem' }}>
                                                                            <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: '999px', fontWeight: 700, background: m.type === 'purchase' ? 'hsla(152,60%,40%,0.12)' : 'hsla(217,91%,60%,0.1)', color: m.type === 'purchase' ? '#10b981' : '#3b82f6' }}>
                                                                                {m.type === 'purchase' ? 'Purchase' : m.type === 'sale_pos' ? 'POS' : 'B2B'}
                                                                            </span>
                                                                        </td>
                                                                        <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.72rem' }}>{m.sourceNumber || m.sourceId.slice(-6).toUpperCase()}</td>
                                                                        <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-secondary)' }}>{m.batchNumber || '—'}</td>
                                                                        <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>{m.qtyIn > 0 ? `+${m.qtyIn}` : '—'}</td>
                                                                        <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>{m.qtyOut > 0 ? `-${m.qtyOut}` : '—'}</td>
                                                                        <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right' }}>{m.remainingBatchQty ?? '—'}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
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
                                ].map(c => (
                                    <div key={c.label} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderLeft: `4px solid ${c.color}`, borderRadius: '12px', padding: '1rem' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: c.color, marginBottom: '0.35rem' }}>{c.label}</div>
                                        <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{c.value}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="glass-panel" style={{ borderRadius: '12px', overflowX: 'auto' }}>
                                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--surface-border)', fontWeight: 700, fontSize: '0.9rem' }}>Purchase History ({fmtDate(dateFrom)} – {fmtDate(dateTo)})</div>
                                {purchaseMovements.length === 0 ? (
                                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No purchase movements in this period.</div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
                                                {['Date', 'Invoice / Source', 'Product', 'Batch', 'Qty In', 'Batch Balance'].map(h => (
                                                    <th key={h} style={{ padding: '0.65rem 0.85rem', fontWeight: 600, textAlign: ['Qty In', 'Batch Balance'].includes(h) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {purchaseMovements.map((m, i) => (
                                                <tr key={m.id} style={{ borderBottom: '1px solid var(--surface-border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-raised)' }}>
                                                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(m.date)}</td>
                                                    <td style={{ padding: '0.6rem 0.85rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{m.sourceNumber || m.sourceId.slice(-8).toUpperCase()}</td>
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
                                    { label: 'Sale Transactions', value: saleMovements.length, color: '#3b82f6' },
                                    { label: 'Total Qty Sold', value: saleMovements.reduce((s, m) => s + (m.qtyOut || 0), 0).toLocaleString('en-IN'), color: '#f59e0b' },
                                    { label: 'Est. Sales Value', value: fmtInr(summary.salesValue), color: '#10b981' },
                                    { label: 'POS Sales', value: saleMovements.filter(m => m.type === 'sale_pos').length, color: '#6366f1' },
                                    { label: 'B2B Sales', value: saleMovements.filter(m => m.type === 'sale_b2b').length, color: '#8b5cf6' },
                                ].map(c => (
                                    <div key={c.label} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderLeft: `4px solid ${c.color}`, borderRadius: '12px', padding: '1rem' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: c.color, marginBottom: '0.35rem' }}>{c.label}</div>
                                        <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{c.value}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="glass-panel" style={{ borderRadius: '12px', overflowX: 'auto' }}>
                                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--surface-border)', fontWeight: 700, fontSize: '0.9rem' }}>Sales History ({fmtDate(dateFrom)} – {fmtDate(dateTo)})</div>
                                {saleMovements.length === 0 ? (
                                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No sales movements in this period.</div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
                                                {['Date', 'Type', 'Order / Source', 'Product', 'Batch', 'Qty Out', 'Batch Balance'].map(h => (
                                                    <th key={h} style={{ padding: '0.65rem 0.85rem', fontWeight: 600, textAlign: ['Qty Out', 'Batch Balance'].includes(h) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {saleMovements.map((m, i) => (
                                                <tr key={m.id} style={{ borderBottom: '1px solid var(--surface-border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-raised)' }}>
                                                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(m.date)}</td>
                                                    <td style={{ padding: '0.6rem 0.85rem' }}>
                                                        <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '999px', fontWeight: 700, background: m.type === 'sale_pos' ? 'hsla(217,91%,60%,0.1)' : 'hsla(263,70%,60%,0.1)', color: m.type === 'sale_pos' ? '#3b82f6' : '#8b5cf6' }}>
                                                            {m.type === 'sale_pos' ? 'POS' : 'B2B'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.6rem 0.85rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{m.sourceNumber || m.sourceId.slice(-8).toUpperCase()}</td>
                                                    <td style={{ padding: '0.6rem 0.85rem', fontWeight: 600 }}>{m.productName}</td>
                                                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.78rem' }}>{m.batchNumber || '—'}</td>
                                                    <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>-{m.qtyOut}</td>
                                                    <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right' }}>{m.remainingBatchQty ?? '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
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
