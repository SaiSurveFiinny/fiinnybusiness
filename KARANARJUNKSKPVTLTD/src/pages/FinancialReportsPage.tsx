import { useState, useEffect, useMemo } from 'react';
import { getDocs, query, orderBy, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import { fmtINR } from '../utils/gstCalculator';
import {
    TrendingUp, TrendingDown, Download, Loader2, Calendar, BarChart3,
    BookOpen, FileText, ArrowUpCircle, ArrowDownCircle,
} from 'lucide-react';

// ── Period helpers (string-based, matches invoiceDate / date fields) ──────────

type Period = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'this_fy' | 'custom';

const PERIOD_LABELS: { key: Period; label: string }[] = [
    { key: 'today',      label: 'Today' },
    { key: 'yesterday',  label: 'Yesterday' },
    { key: 'this_week',  label: 'This Week' },
    { key: 'this_month', label: 'This Month' },
    { key: 'this_fy',    label: 'This FY' },
    { key: 'custom',     label: 'Custom' },
];

function toStr(d: Date) { return d.toISOString().slice(0, 10); }

function getDateRange(period: Period, customFrom: string, customTo: string): [string, string] {
    const now = new Date();
    const todayStr = toStr(now);
    switch (period) {
        case 'today':
            return [todayStr, todayStr];
        case 'yesterday': {
            const y = new Date(now); y.setDate(y.getDate() - 1);
            const s = toStr(y); return [s, s];
        }
        case 'this_week': {
            const d = new Date(now); d.setDate(d.getDate() - d.getDay()); // Sun
            return [toStr(d), todayStr];
        }
        case 'this_month':
            return [toStr(new Date(now.getFullYear(), now.getMonth(), 1)), todayStr];
        case 'this_fy': {
            const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
            return [toStr(new Date(fyYear, 3, 1)), todayStr]; // Apr 1
        }
        case 'custom':
            return customFrom && customTo ? [customFrom, customTo] : [todayStr, todayStr];
    }
}

function periodLabel(period: Period, from: string, to: string): string {
    if (period === 'custom') return from === to ? from : `${from} – ${to}`;
    return PERIOD_LABELS.find(p => p.key === period)?.label ?? '';
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

interface Order {
    id: string; netAmount: number; grandTotal: number; taxableValue: number;
    totalTax: number; cgst: number; sgst: number; invoiceDate: string;
    status: string; paymentMethod: string; lineItems?: any[];
    retailerName?: string; orderNumber?: string;
}
interface Expense { id: string; amount: number; category: string; date: string; description: string; }
interface Purchase { id: string; totalAmount: number; invoiceDate: string; supplierName?: string; invoiceNumber?: string; }

type ReportTab = 'summary' | 'pl' | 'balance' | 'daybook';

export default function FinancialReportsPage() {
    const { tenantId } = useAuth();
    const today = new Date();

    const [tab, setTab] = useState<ReportTab>('summary');
    const [period, setPeriod] = useState<Period>('this_month');
    const [customFrom, setCustomFrom] = useState(toStr(new Date(today.getFullYear(), today.getMonth(), 1)));
    const [customTo, setCustomTo]     = useState(toStr(today));

    const [orders, setOrders]     = useState<Order[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [loading, setLoading]   = useState(true);

    const [from, to] = getDateRange(period, customFrom, customTo);

    useEffect(() => {
        if (!tenantId) return;
        setLoading(true);
        Promise.all([
            getDocs(query(getTenantCollection(db, tenantId, 'salesOrders'), orderBy('invoiceDate', 'asc'))),
            getDocs(query(getTenantCollection(db, tenantId, 'expenses'), orderBy('date', 'asc'))).catch(() => ({ docs: [] as any[] })),
            getDocs(query(getTenantCollection(db, tenantId, 'supplierInvoices'), orderBy('invoiceDate', 'asc'))).catch(() => ({ docs: [] as any[] })),
        ]).then(([orderSnap, expSnap, purchSnap]) => {
            setOrders((orderSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Order[])
                .filter(o => o.invoiceDate >= from && o.invoiceDate <= to));
            setExpenses(((expSnap as any).docs.map((d: any) => ({ id: d.id, ...d.data() })) as Expense[])
                .filter(e => e.date >= from && e.date <= to));
            setPurchases(((purchSnap as any).docs.map((d: any) => ({ id: d.id, ...d.data() })) as Purchase[])
                .filter(p => p.invoiceDate >= from && p.invoiceDate <= to));
        }).catch(console.error).finally(() => setLoading(false));
    }, [tenantId, from, to]);

    // ── Derived metrics ──────────────────────────────────────────────────────
    const metrics = useMemo(() => {
        const validOrders  = orders.filter(o => o.status !== 'cancelled');
        const totalSales   = validOrders.reduce((s, o) => s + (o.grandTotal || o.netAmount || 0), 0);
        const totalTaxable = validOrders.reduce((s, o) => s + (o.taxableValue || 0), 0);
        const totalGst     = validOrders.reduce((s, o) => s + (o.totalTax || 0), 0);
        const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
        const totalPurchases = purchases.reduce((s, p) => s + (p.totalAmount || 0), 0);

        const cashIn  = validOrders.filter(o => o.paymentMethod === 'Cash' || !o.paymentMethod).reduce((s, o) => s + (o.grandTotal || o.netAmount || 0), 0);
        const cashOut = expenses.reduce((s, e) => s + (e.amount || 0), 0);
        const paymentsReceived = validOrders.filter(o => o.status === 'paid' || o.paymentMethod !== 'Khata').reduce((s, o) => s + (o.grandTotal || o.netAmount || 0), 0);
        const paymentsMade = totalPurchases + totalExpenses;

        const grossProfit = totalSales - totalPurchases - totalExpenses;
        const netProfit   = grossProfit - totalGst;

        const expByCategory: Record<string, number> = {};
        for (const e of expenses) {
            expByCategory[e.category || 'Others'] = (expByCategory[e.category || 'Others'] || 0) + e.amount;
        }

        return {
            totalSales, totalTaxable, totalGst, totalExpenses, totalPurchases,
            cashIn, cashOut, paymentsReceived, paymentsMade,
            grossProfit, netProfit, expByCategory,
            orderCount: validOrders.length,
        };
    }, [orders, expenses, purchases]);

    // ── Day Book entries ────────────────────────────────────────────────────
    const dayBook = useMemo(() => {
        const entries: { date: string; description: string; debit: number; credit: number; type: string; ref: string }[] = [];
        for (const o of orders.filter(o => o.status !== 'cancelled')) {
            entries.push({ date: o.invoiceDate, description: `Sale — ${o.retailerName || 'Customer'}`, debit: 0, credit: o.grandTotal || o.netAmount || 0, type: 'sale', ref: o.orderNumber || o.id });
        }
        for (const p of purchases) {
            entries.push({ date: p.invoiceDate, description: `Purchase — ${p.supplierName || 'Supplier'}`, debit: p.totalAmount || 0, credit: 0, type: 'purchase', ref: p.invoiceNumber || p.id });
        }
        for (const e of expenses) {
            entries.push({ date: e.date, description: e.description || e.category, debit: e.amount || 0, credit: 0, type: 'expense', ref: e.id });
        }
        entries.sort((a, b) => a.date.localeCompare(b.date));
        let balance = 0;
        return entries.map(e => { balance = balance + e.credit - e.debit; return { ...e, balance }; });
    }, [orders, expenses, purchases]);

    // ── CSV export ───────────────────────────────────────────────────────────
    const exportCSV = () => {
        const periodStr = periodLabel(period, from, to);
        let rows: string[][] = [];
        if (tab === 'summary') {
            rows = [
                [`Business Summary — ${periodStr}`], [''],
                ['Metric', 'Amount'],
                ['Total Sales', String(metrics.totalSales)],
                ['Total Purchases', String(metrics.totalPurchases)],
                ['Total Expenses', String(metrics.totalExpenses)],
                ['Cash In', String(metrics.cashIn)],
                ['Cash Out', String(metrics.cashOut)],
                ['Payments Received', String(metrics.paymentsReceived)],
                ['Payments Made', String(metrics.paymentsMade)],
                ['Gross Profit', String(metrics.grossProfit)],
                ['Net Profit', String(metrics.netProfit)],
            ];
        } else if (tab === 'pl') {
            rows = [
                [`P&L Statement — ${periodStr}`], [''],
                ['INCOME', ''], ['Total Revenue', String(metrics.totalSales)],
                ['  Taxable (Ex-GST)', String(metrics.totalTaxable)],
                ['  GST Collected', String(metrics.totalGst)], [''],
                ['EXPENSES', ''],
                ...Object.entries(metrics.expByCategory).map(([k, v]) => [k, String(v)]),
                ['Total Expenses', String(metrics.totalExpenses)], [''],
                ['Gross Profit', String(metrics.grossProfit)],
                ['Net Profit', String(metrics.netProfit)],
            ];
        } else if (tab === 'daybook') {
            rows = [['Date', 'Description', 'Ref', 'Debit', 'Credit', 'Balance'],
                ...dayBook.map(e => [e.date, e.description, e.ref, String(e.debit), String(e.credit), String(e.balance)])];
        } else if (tab === 'balance') {
            rows = [
                [`Balance Sheet — ${periodStr}`], [''],
                ['ASSETS', ''],
                ['Accounts Receivable', String(orders.filter(o => o.status !== 'paid').reduce((s, o) => s + (o.grandTotal || o.netAmount || 0), 0))],
                ['Cash Received', String(orders.filter(o => o.status === 'paid').reduce((s, o) => s + (o.grandTotal || o.netAmount || 0), 0))],
                ['TOTAL ASSETS', String(metrics.totalSales)], [''],
                ['LIABILITIES & EQUITY', ''],
                ['GST Payable', String(metrics.totalGst)],
                ['Accounts Payable', String(metrics.totalExpenses)],
                ['Net Profit', String(metrics.netProfit)],
            ];
        }
        const blob = new Blob(['﻿' + rows.map(r => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `${tab.toUpperCase()}_${from}_${to}.csv`; a.click();
    };

    const card: React.CSSProperties = { background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '14px', padding: '1.5rem' };
    const tabBtn = (t: ReportTab, label: string, icon: React.ReactNode) => (
        <button onClick={() => setTab(t)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: tab === t ? 700 : 400, background: tab === t ? 'var(--primary-light)' : 'transparent', color: tab === t ? '#fff' : 'var(--text-secondary)', font: 'inherit', fontSize: '0.88rem', transition: 'all 0.15s' }}>
            {icon}{label}
        </button>
    );

    const profitColor = metrics.netProfit >= 0 ? '#10b981' : '#ef4444';
    const label = periodLabel(period, from, to);

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <BarChart3 size={32} /> Financial Reports
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Summary · P&L · Balance Sheet · Day Book</p>
                </div>
                <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', background: 'var(--primary-light)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, font: 'inherit' }}>
                    <Download size={17} /> Export CSV
                </button>
            </div>

            {/* Period filter + tabs */}
            <div style={{ ...card, marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: period === 'custom' ? '0.85rem' : 0 }}>
                    <Calendar size={18} style={{ color: 'var(--primary-light)', flexShrink: 0 }} />
                    {PERIOD_LABELS.map(({ key, label: lbl }) => (
                        <button key={key} onClick={() => setPeriod(key)}
                            style={{ padding: '0.4rem 0.9rem', borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontWeight: period === key ? 700 : 500, fontSize: '0.83rem', font: 'inherit', transition: 'all 0.15s', background: period === key ? 'var(--primary)' : 'var(--surface-base)', color: period === key ? '#fff' : 'var(--text-secondary)', borderColor: period === key ? 'var(--primary)' : 'var(--surface-border)' }}>
                            {lbl}
                        </button>
                    ))}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.35rem', background: 'var(--surface-base)', borderRadius: '12px', padding: '0.2rem' }}>
                        {tabBtn('summary', 'Summary', <ArrowUpCircle size={15} />)}
                        {tabBtn('pl', 'P&L', <TrendingUp size={15} />)}
                        {tabBtn('balance', 'Balance Sheet', <FileText size={15} />)}
                        {tabBtn('daybook', 'Day Book', <BookOpen size={15} />)}
                    </div>
                </div>
                {period === 'custom' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                        <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', fontWeight: 600 }}>From</span>
                        <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                            style={{ padding: '0.4rem 0.6rem', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '0.85rem', background: 'var(--surface-base)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                        <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', fontWeight: 600 }}>To</span>
                        <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                            style={{ padding: '0.4rem 0.6rem', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '0.85rem', background: 'var(--surface-base)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                    </div>
                )}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem' }}><Loader2 className="animate-spin" size={36} style={{ margin: '0 auto' }} /></div>
            ) : (
                <>
                    {/* ── Summary Tab ── */}
                    {tab === 'summary' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1rem', color: 'var(--text-secondary)' }}>
                                Business Summary — {label}
                            </h3>
                            {/* Top KPI row */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '1rem' }}>
                                {[
                                    { label: 'Total Sales', value: metrics.totalSales, color: '#10b981', icon: <TrendingUp size={18} /> },
                                    { label: 'Total Purchases', value: metrics.totalPurchases, color: '#6366f1', icon: <ArrowDownCircle size={18} /> },
                                    { label: 'Total Expenses', value: metrics.totalExpenses, color: '#ef4444', icon: <TrendingDown size={18} /> },
                                    { label: 'Gross Profit', value: metrics.grossProfit, color: metrics.grossProfit >= 0 ? '#10b981' : '#ef4444', icon: <BarChart3 size={18} /> },
                                    { label: 'Net Profit', value: metrics.netProfit, color: profitColor, icon: metrics.netProfit >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} /> },
                                ].map(s => (
                                    <div key={s.label} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderLeft: `4px solid ${s.color}`, borderRadius: '14px', padding: '1.25rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: s.color, marginBottom: '0.4rem', fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{s.icon}{s.label}</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: s.color }}>₹{fmtINR(s.value)}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Cash flow + payments row */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '1rem' }}>
                                {[
                                    { label: 'Cash In', value: metrics.cashIn, color: '#10b981', icon: <ArrowUpCircle size={18} /> },
                                    { label: 'Cash Out', value: metrics.cashOut, color: '#f59e0b', icon: <ArrowDownCircle size={18} /> },
                                    { label: 'Payments Received', value: metrics.paymentsReceived, color: '#22c55e', icon: <ArrowUpCircle size={18} /> },
                                    { label: 'Payments Made', value: metrics.paymentsMade, color: '#ec4899', icon: <ArrowDownCircle size={18} /> },
                                    { label: 'GST Collected', value: metrics.totalGst, color: '#f59e0b', icon: <FileText size={18} /> },
                                ].map(s => (
                                    <div key={s.label} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderLeft: `4px solid ${s.color}`, borderRadius: '14px', padding: '1.25rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: s.color, marginBottom: '0.4rem', fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{s.icon}{s.label}</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>₹{fmtINR(s.value)}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Summary table */}
                            <div style={card}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.9rem' }}>
                                    <tbody>
                                        {[
                                            { label: 'Total Sales (Invoiced)', value: metrics.totalSales, color: '#10b981' },
                                            { label: '  Taxable Value (Ex-GST)', value: metrics.totalTaxable, color: undefined },
                                            { label: '  GST Collected', value: metrics.totalGst, color: '#f59e0b' },
                                            { label: 'Total Purchases', value: metrics.totalPurchases, color: '#6366f1' },
                                            { label: 'Total Expenses', value: metrics.totalExpenses, color: '#ef4444' },
                                            { label: 'Cash In (Cash Sales)', value: metrics.cashIn, color: '#10b981' },
                                            { label: 'Cash Out (Expenses)', value: metrics.cashOut, color: '#f59e0b' },
                                            { label: 'Payments Received', value: metrics.paymentsReceived, color: '#22c55e' },
                                            { label: 'Payments Made', value: metrics.paymentsMade, color: '#ec4899' },
                                            { label: 'Gross Profit', value: metrics.grossProfit, color: metrics.grossProfit >= 0 ? '#10b981' : '#ef4444' },
                                            { label: 'Net Profit (after GST)', value: metrics.netProfit, color: profitColor },
                                        ].map(({ label: l, value, color }) => (
                                            <tr key={l} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                                                <td style={{ padding: '0.65rem 1rem', color: 'var(--text-secondary)' }}>{l}</td>
                                                <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 700, color: color || 'var(--text-primary)' }}>₹{fmtINR(value)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ── P&L Tab ── */}
                    {tab === 'pl' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '1rem' }}>
                                {[
                                    { label: 'Total Revenue', value: `₹${fmtINR(metrics.totalSales)}`, color: '#10b981', icon: <TrendingUp size={18} /> },
                                    { label: 'Taxable (Ex GST)', value: `₹${fmtINR(metrics.totalTaxable)}`, color: '#6366f1', icon: <BarChart3 size={18} /> },
                                    { label: 'GST Collected', value: `₹${fmtINR(metrics.totalGst)}`, color: '#f59e0b', icon: <FileText size={18} /> },
                                    { label: 'Total Expenses', value: `₹${fmtINR(metrics.totalExpenses)}`, color: '#ef4444', icon: <TrendingDown size={18} /> },
                                    { label: 'Net Profit', value: `₹${fmtINR(metrics.netProfit)}`, color: profitColor, icon: metrics.netProfit >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} /> },
                                ].map(s => (
                                    <div key={s.label} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderLeft: `4px solid ${s.color}`, borderRadius: '14px', padding: '1.25rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: s.color, marginBottom: '0.4rem', fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{s.icon}{s.label}</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: s.label === 'Net Profit' ? profitColor : 'inherit' }}>{s.value}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={card}>
                                <h3 style={{ marginBottom: '1.25rem', fontWeight: 800, fontSize: '1.05rem' }}>
                                    Profit & Loss — {label}
                                </h3>
                                <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.9rem' }}>
                                    <tbody>
                                        <tr style={{ background: 'hsla(152,60%,40%,0.06)' }}>
                                            <td colSpan={2} style={{ padding: '0.65rem 1rem', fontWeight: 800, fontSize: '0.82rem', textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#10b981' }}>INCOME</td>
                                        </tr>
                                        {[['Total Sales (Invoiced)', `₹${fmtINR(metrics.totalSales)}`], ['  Taxable Value (Ex-GST)', `₹${fmtINR(metrics.totalTaxable)}`], ['  GST Collected', `₹${fmtINR(metrics.totalGst)}`], [`  Invoices (${metrics.orderCount})`, '']].map(([k, v]) => (
                                            <tr key={k} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                                                <td style={{ padding: '0.65rem 1.25rem', color: 'var(--text-secondary)' }}>{k}</td>
                                                <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 600 }}>{v}</td>
                                            </tr>
                                        ))}
                                        <tr style={{ background: 'hsla(0,84%,60%,0.06)', borderTop: '2px solid var(--surface-border)' }}>
                                            <td colSpan={2} style={{ padding: '0.65rem 1rem', fontWeight: 800, fontSize: '0.82rem', textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#ef4444' }}>EXPENSES</td>
                                        </tr>
                                        {Object.entries(metrics.expByCategory).length > 0
                                            ? Object.entries(metrics.expByCategory).map(([k, v]) => (
                                                <tr key={k} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                                                    <td style={{ padding: '0.65rem 1.25rem', color: 'var(--text-secondary)' }}>{k}</td>
                                                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 600, color: '#ef4444' }}>₹{fmtINR(v)}</td>
                                                </tr>
                                            ))
                                            : <tr><td colSpan={2} style={{ padding: '0.65rem 1.25rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No expenses in this period</td></tr>
                                        }
                                        <tr style={{ borderTop: '1px solid var(--surface-border)' }}>
                                            <td style={{ padding: '0.65rem 1.25rem', fontWeight: 700 }}>Total Expenses</td>
                                            <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>₹{fmtINR(metrics.totalExpenses)}</td>
                                        </tr>
                                        <tr style={{ background: 'var(--surface-base)', borderTop: '3px solid var(--surface-border)' }}>
                                            <td colSpan={2} style={{ padding: '0.65rem 1rem', fontWeight: 800, fontSize: '0.82rem', textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: profitColor }}>PROFIT</td>
                                        </tr>
                                        <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                                            <td style={{ padding: '0.65rem 1.25rem', color: 'var(--text-secondary)' }}>Gross Profit (Sales − Expenses)</td>
                                            <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 700, color: metrics.grossProfit >= 0 ? '#10b981' : '#ef4444' }}>₹{fmtINR(metrics.grossProfit)}</td>
                                        </tr>
                                        <tr style={{ background: metrics.netProfit >= 0 ? 'hsla(160,84%,39%,0.08)' : 'hsla(0,84%,60%,0.08)' }}>
                                            <td style={{ padding: '1rem 1.25rem', fontWeight: 900, fontSize: '1rem' }}>NET PROFIT (after GST)</td>
                                            <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 900, fontSize: '1.15rem', color: profitColor }}>₹{fmtINR(metrics.netProfit)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ── Balance Sheet Tab ── */}
                    {tab === 'balance' && (
                        <div style={card}>
                            <h3 style={{ marginBottom: '1.5rem', fontWeight: 800, fontSize: '1.05rem' }}>Balance Sheet — {label}</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                <div>
                                    <h4 style={{ color: '#10b981', fontWeight: 700, marginBottom: '1rem', padding: '0.5rem 0', borderBottom: '2px solid #10b981', fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ASSETS</h4>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.9rem' }}>
                                        <tbody>
                                            {[
                                                ['Current Assets', ''],
                                                ['  Accounts Receivable (Outstanding)', `₹${fmtINR(orders.filter(o => o.status !== 'paid').reduce((s, o) => s + (o.grandTotal || o.netAmount || 0), 0))}`],
                                                ['  Cash / Bank (Received)', `₹${fmtINR(orders.filter(o => o.status === 'paid').reduce((s, o) => s + (o.grandTotal || o.netAmount || 0), 0))}`],
                                                ['  GST Input Credit (ITC)', '₹0.00'],
                                                ['TOTAL ASSETS', `₹${fmtINR(metrics.totalSales)}`],
                                            ].map(([k, v], i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid var(--surface-border)', background: k.startsWith('TOTAL') || k.startsWith('Current') ? 'var(--surface-base)' : 'transparent' }}>
                                                    <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-secondary)', fontWeight: k.startsWith('TOTAL') ? 800 : 400 }}>{k}</td>
                                                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: k.startsWith('TOTAL') ? 800 : 600, color: k.startsWith('TOTAL') ? '#10b981' : 'inherit' }}>{v}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div>
                                    <h4 style={{ color: '#ef4444', fontWeight: 700, marginBottom: '1rem', padding: '0.5rem 0', borderBottom: '2px solid #ef4444', fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>LIABILITIES & EQUITY</h4>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.9rem' }}>
                                        <tbody>
                                            {[
                                                ['Current Liabilities', ''],
                                                ['  GST Payable', `₹${fmtINR(metrics.totalGst)}`],
                                                ['  Accounts Payable (Expenses)', `₹${fmtINR(metrics.totalExpenses)}`],
                                                ['Equity', ''],
                                                ['  Retained Earnings (Net Profit)', `₹${fmtINR(metrics.netProfit)}`],
                                                ['TOTAL LIABILITIES + EQUITY', `₹${fmtINR(metrics.totalSales)}`],
                                            ].map(([k, v], i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid var(--surface-border)', background: k.startsWith('TOTAL') || k === 'Current Liabilities' || k === 'Equity' ? 'var(--surface-base)' : 'transparent' }}>
                                                    <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-secondary)', fontWeight: k.startsWith('TOTAL') ? 800 : 400 }}>{k}</td>
                                                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: k.startsWith('TOTAL') ? 800 : 600, color: k.startsWith('TOTAL') ? '#ef4444' : 'inherit' }}>{v}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div style={{ marginTop: '1.5rem', padding: '0.9rem 1rem', background: 'hsla(45,93%,47%,0.08)', borderRadius: '10px', border: '1px solid hsla(45,93%,47%,0.2)', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                ⚠️ Simplified balance sheet based on invoice and expense data. Verify with your CA for formal accounting.
                            </div>
                        </div>
                    )}

                    {/* ── Day Book Tab ── */}
                    {tab === 'daybook' && (
                        <div style={card}>
                            <h3 style={{ marginBottom: '1.5rem', fontWeight: 800, fontSize: '1.05rem' }}>Day Book — {label}</h3>
                            {dayBook.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                                    <BookOpen size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                                    <p>No transactions in this period</p>
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.87rem' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--surface-base)' }}>
                                                {['Date', 'Description', 'Ref', 'Debit', 'Credit', 'Balance'].map(h => (
                                                    <th key={h} style={{ padding: '0.75rem 0.9rem', textAlign: ['Debit', 'Credit', 'Balance'].includes(h) ? 'right' : 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.78rem', textTransform: 'uppercase' as const, borderBottom: '2px solid var(--surface-border)', whiteSpace: 'nowrap' as const }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dayBook.map((e, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid var(--surface-border)', background: e.type === 'expense' ? 'hsla(0,84%,60%,0.03)' : e.type === 'purchase' ? 'hsla(234,89%,74%,0.04)' : 'transparent' }}>
                                                    <td style={{ padding: '0.6rem 0.9rem', whiteSpace: 'nowrap' as const }}>{e.date}</td>
                                                    <td style={{ padding: '0.6rem 0.9rem', maxWidth: '280px' }}>{e.description}</td>
                                                    <td style={{ padding: '0.6rem 0.9rem', fontFamily: 'monospace', fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>{e.ref.slice(0, 12)}</td>
                                                    <td style={{ padding: '0.6rem 0.9rem', textAlign: 'right', color: e.debit ? '#ef4444' : 'var(--text-tertiary)' }}>{e.debit ? `₹${fmtINR(e.debit)}` : '—'}</td>
                                                    <td style={{ padding: '0.6rem 0.9rem', textAlign: 'right', color: e.credit ? '#10b981' : 'var(--text-tertiary)' }}>{e.credit ? `₹${fmtINR(e.credit)}` : '—'}</td>
                                                    <td style={{ padding: '0.6rem 0.9rem', textAlign: 'right', fontWeight: 700, color: e.balance >= 0 ? '#10b981' : '#ef4444' }}>₹{fmtINR(e.balance)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr style={{ background: 'var(--surface-base)', fontWeight: 800, borderTop: '2px solid var(--surface-border)' }}>
                                                <td colSpan={3} style={{ padding: '0.75rem 0.9rem' }}>CLOSING BALANCE</td>
                                                <td style={{ padding: '0.75rem 0.9rem', textAlign: 'right', color: '#ef4444' }}>₹{fmtINR(dayBook.reduce((s, e) => s + e.debit, 0))}</td>
                                                <td style={{ padding: '0.75rem 0.9rem', textAlign: 'right', color: '#10b981' }}>₹{fmtINR(dayBook.reduce((s, e) => s + e.credit, 0))}</td>
                                                <td style={{ padding: '0.75rem 0.9rem', textAlign: 'right', color: (dayBook[dayBook.length - 1]?.balance ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>₹{fmtINR(dayBook[dayBook.length - 1]?.balance ?? 0)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
