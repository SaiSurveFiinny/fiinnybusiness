import { useState, useEffect, useMemo } from 'react';
import { getDocs, onSnapshot, query, orderBy, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { useSalesFilter, fetchSalesOrdersByRetailerIds } from '../hooks/useSalesFilter';
import { useToast } from '../contexts/ToastContext';
import { Truck, CheckCircle, Package, ExternalLink, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AddTransporterModal from '../components/AddTransporterModal';

type TrackingStatus = 'confirmed' | 'dispatched' | 'delivered';

const TABS: { id: TrackingStatus; label: string; color: string }[] = [
    { id: 'confirmed',  label: 'Order Placed', color: '#f59e0b' },
    { id: 'dispatched', label: 'Dispatched',   color: 'var(--primary-light)' },
    { id: 'delivered',  label: 'Delivered',    color: '#10b981' },
];

const fmtDate = (ts: any): string => {
    try {
        if (!ts) return '—';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
    } catch { return '—'; }
};

const fmtAmount = (val: any): string => {
    const n = Number(val ?? 0);
    if (isNaN(n)) return '₹0';
    return `₹${n.toLocaleString('en-IN')}`;
};

// Consistent navigation pattern for opening a B2B invoice — matches B2BInvoiceWorklistPage.
const b2bInvoiceUrl = (order: any): string =>
    `/b2b-invoice?orderId=${encodeURIComponent(order.id)}${order.retailerId ? `&retailerId=${encodeURIComponent(order.retailerId)}` : ''}`;

export default function DispatchBoardPage() {
    const { tenantId, userRole } = useAuth();
    const isSales = userRole === 'sales';
    const { showToast } = useToast();
    const navigate = useNavigate();
    const { allowedRetailerIds, filterLoading } = useSalesFilter();

    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TrackingStatus>('confirmed');
    const [movingId, setMovingId] = useState<string | null>(null);
    const [addTransporterOpen, setAddTransporterOpen] = useState(false);

    // Real-time listener — same salesOrders collection both pages read from.
    // For sales users we fall back to a one-shot query scoped to their allowed retailers
    // (the collection-group listener pattern used here can't apply a retailer-id filter
    // efficiently without a composite index, so we keep their path as a one-shot + reload
    // on mount; sales users rarely need sub-second tracking updates).
    useEffect(() => {
        if (!tenantId || filterLoading) return;

        if (allowedRetailerIds === null) {
            // Admin / analyst: real-time subscription
            const q = query(getTenantCollection(db, tenantId, 'salesOrders'), orderBy('createdAt', 'desc'));
            const unsub = onSnapshot(q, snap => {
                setOrders(
                    snap.docs
                        .map(d => ({ id: d.id, ...d.data() }))
                        .filter((o: any) => ['confirmed', 'dispatched', 'delivered'].includes(o.status))
                );
                setLoading(false);
            }, err => { console.error('DispatchBoard snapshot error:', err); setLoading(false); });
            return () => unsub();
        }

        // Sales user: one-shot scoped query
        getDocs(query(getTenantCollection(db, tenantId, 'salesOrders'), orderBy('createdAt', 'desc')))
            .then(snap => {
                const allowed = allowedRetailerIds!;
                setOrders(
                    snap.docs
                        .map(d => ({ id: d.id, ...d.data() }) as any)
                        .filter((o: any) =>
                            ['confirmed', 'dispatched', 'delivered'].includes(o.status) &&
                            (!o.retailerId || allowed.has(o.retailerId))
                        )
                );
            })
            .catch(e => console.error(e))
            .finally(() => setLoading(false));
    }, [tenantId, filterLoading, allowedRetailerIds === null ? 'all' : Array.from(allowedRetailerIds).sort().join(',')]);

    const moveStatus = async (e: React.MouseEvent, order: any, newStatus: string) => {
        e.stopPropagation();
        if (!tenantId) return;
        setMovingId(order.id);
        try {
            await updateDoc(getTenantDoc(db, tenantId, 'salesOrders', order.id), { status: newStatus, updatedAt: serverTimestamp() });
            showToast(`Moved to ${TABS.find(t => t.id === newStatus)?.label ?? newStatus}`, 'success');
            // No manual refetch needed — onSnapshot fires automatically for admins.
        } catch { showToast('Failed to update status', 'error'); }
        finally { setMovingId(null); }
    };

    const counts = useMemo(() => {
        const map: Record<string, number> = { confirmed: 0, dispatched: 0, delivered: 0 };
        for (const o of orders) { if (o.status in map) map[o.status]++; }
        return map;
    }, [orders]);

    const tabOrders = useMemo(
        () => orders.filter((o: any) => o.status === activeTab),
        [orders, activeTab]
    );

    const tabStyle = (t: typeof TABS[number]) => {
        const active = activeTab === t.id;
        return {
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.6rem 1.25rem',
            background: 'transparent', border: 'none',
            borderBottom: active ? `2px solid ${t.color}` : '2px solid transparent',
            marginBottom: '-2px',
            color: active ? t.color : 'var(--text-tertiary)',
            fontWeight: active ? 700 : 400,
            fontSize: '0.9rem',
            cursor: 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap' as const,
            transition: 'all 0.15s',
        };
    };

    if (loading) {
        return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Loading...</div>;
    }

    return (
        <div className="animate-fade-in" style={{ width: '100%' }}>
            {addTransporterOpen && <AddTransporterModal onClose={() => setAddTransporterOpen(false)} />}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                        <Truck size={28} /> Tracking Information
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Track B2B orders from confirmation through delivery.</p>
                </div>
                {!isSales && (
                    <button
                        onClick={() => setAddTransporterOpen(true)}
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', padding: '0.55rem 1rem', whiteSpace: 'nowrap' }}
                    >
                        <Plus size={15} /> Add Transporter
                    </button>
                )}
            </div>

            {/* Tab bar */}
            <div style={{
                display: 'flex', gap: '0.25rem',
                borderBottom: '2px solid var(--surface-border)',
                marginBottom: '1.5rem',
            }}>
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)} style={tabStyle(t)}>
                        {t.label}
                        <span style={{
                            background: activeTab === t.id ? t.color : 'var(--surface-raised)',
                            color: activeTab === t.id ? '#fff' : 'var(--text-tertiary)',
                            padding: '1px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 700,
                        }}>{counts[t.id]}</span>
                    </button>
                ))}
            </div>

            {/* Content */}
            {tabOrders.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                    <Package size={48} color="var(--surface-border)" style={{ margin: '0 auto 1rem auto', display: 'block' }} />
                    <h3 style={{ color: 'var(--text-secondary)' }}>No orders in this stage</h3>
                    <p style={{ color: 'var(--text-tertiary)' }}>
                        {activeTab === 'confirmed'  && 'Confirmed B2B orders will appear here.'}
                        {activeTab === 'dispatched' && 'Mark a confirmed order as Dispatched to see it here.'}
                        {activeTab === 'delivered'  && 'Mark a dispatched order as Delivered to see it here.'}
                    </p>
                </div>
            ) : (
                <div className="glass-panel" style={{ overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--surface-border)', background: 'var(--surface-raised)' }}>
                                    {['Order No.', 'Date', 'Customer', 'Amount', 'Manufacturer', ...(isSales ? [] : ['Action'])].map(h => (
                                        <th key={h} style={{ padding: '0.8rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: h === 'Amount' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                    <th style={{ width: '48px' }} />
                                </tr>
                            </thead>
                            <tbody>
                                {tabOrders.map((order: any) => {
                                    const isMoving = movingId === order.id;
                                    const invoiceUrl = b2bInvoiceUrl(order);
                                    return (
                                        <tr
                                            key={order.id}
                                            onClick={() => navigate(invoiceUrl)}
                                            style={{ borderBottom: '1px solid var(--surface-border)', cursor: 'pointer', transition: 'background 0.12s' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-raised)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <td style={{ padding: '0.85rem 1rem' }}>
                                                <span style={{ fontWeight: 700, color: 'var(--primary-light)', fontSize: '0.85rem' }}>{order.orderNumber || order.id.slice(-6).toUpperCase()}</span>
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(order.createdAt)}</td>
                                            <td style={{ padding: '0.85rem 1rem' }}>
                                                <div style={{ fontWeight: 600 }}>{order.retailerName || '—'}</div>
                                                {order.buyerAddress && <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '1px' }}>{order.buyerAddress}</div>}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                {fmtAmount(order.grandTotal ?? order.netAmount ?? order.totalAmount)}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                                                {order.assignedManufacturerName
                                                    ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Package size={12} /> {order.assignedManufacturerName}</span>
                                                    : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                                            </td>
                                            {!isSales && (
                                                <td style={{ padding: '0.85rem 1rem' }} onClick={e => e.stopPropagation()}>
                                                    {activeTab === 'confirmed' && (
                                                        <button
                                                            disabled={isMoving}
                                                            onClick={e => moveStatus(e, order, 'dispatched')}
                                                            className="btn btn-primary"
                                                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}
                                                        >
                                                            <Truck size={12} /> {isMoving ? '...' : 'Dispatch'}
                                                        </button>
                                                    )}
                                                    {activeTab === 'dispatched' && (
                                                        <button
                                                            disabled={isMoving}
                                                            onClick={e => moveStatus(e, order, 'delivered')}
                                                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', background: 'hsla(142,60%,40%,0.15)', color: '#10b981', border: '1px solid hsla(142,60%,40%,0.3)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap', fontFamily: 'inherit', fontWeight: 600 }}
                                                        >
                                                            <CheckCircle size={12} /> {isMoving ? '...' : 'Delivered'}
                                                        </button>
                                                    )}
                                                </td>
                                            )}
                                            <td style={{ padding: '0.85rem 0.75rem', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                                <ExternalLink size={14} color="var(--text-tertiary)" style={{ cursor: 'pointer' }} onClick={() => navigate(invoiceUrl)} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ padding: '0.7rem 1.25rem', borderTop: '1px solid var(--surface-border)', background: 'var(--surface-raised)', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                        {tabOrders.length} order{tabOrders.length !== 1 ? 's' : ''} · {TABS.find(t => t.id === activeTab)?.label}
                    </div>
                </div>
            )}
        </div>
    );
}
