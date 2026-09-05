import { useState, useEffect } from 'react';
import { ShoppingCart, FileText, Loader2, Search, Trash2, Pencil, X, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { query, onSnapshot, orderBy, updateDoc, serverTimestamp } from 'firebase/firestore';
import { softDelete } from '../utils/softDelete';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';

interface SalesOrder {
    id: string;
    orderNumber: string;
    billNumber?: string;
    retailerName: string;
    phoneNumber?: string;
    subtotal?: number;
    grandTotal?: number;
    netAmount?: number;
    totalAmount?: number;
    paymentStatus?: string;
    status?: string;
    modeOfPayment?: string;
    // POS writes amountPaid; other writers used paidAmount — both are read below,
    // matching DigitalKhataPage's authoritative status calculation.
    amountPaid?: number;
    paidAmount?: number;
    invoiceDate?: string;
    invoiceType?: string;
    createdAt?: any;
    lineItems: any[];
    buyerAddress?: string;
    buyerGstin?: string;
    buyerContact?: string;
    salesmanName?: string;
    termsOfDelivery?: string;
    taxableValue?: number;
    cgst?: number;
    sgst?: number;
    totalTax?: number;
    discountAmount?: number;
    roundOff?: number;
    previousBalance?: number;
    netBalance?: number;
}

/** Read amount from any known field name */
function getAmount(order: SalesOrder): number {
    return Number(order.grandTotal || order.netAmount || order.totalAmount || order.subtotal || 0);
}

// Same formula as DigitalKhataPage's authoritative per-bill status calculation —
// reused here rather than re-derived, so Order History never disagrees with the
// Invoices view for the same salesOrders document.
function getPaymentStatus(order: SalesOrder): 'paid' | 'partial' | 'pending' {
    const total = getAmount(order);
    const rawPaid = order.amountPaid ?? order.paidAmount;
    const paid = rawPaid !== undefined && rawPaid !== null
        ? Number(rawPaid) || 0
        : (String(order.paymentStatus || '').toLowerCase() === 'paid' ? total : 0);
    const outstanding = Math.max(0, total - paid);
    return outstanding <= 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';
}

const PAYMENT_MODES = ['Cash', 'Credit', 'UPI', 'NEFT', 'RTGS', 'Cheque', 'Online'];

// `fullWidth` is set when this page is embedded as a POS sub-tab, where it
// should span the full-width POS layout instead of the standalone /order-history
// route's centered 1400px column. Defaults false so the standalone route is
// unchanged.
export default function OrderHistoryPage({ fullWidth = false }: { fullWidth?: boolean } = {}) {
    const { tenantId, currentUser, userName, userRole } = useAuth();
    const navigate = useNavigate();
    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Edit state
    const [editOrder, setEditOrder] = useState<SalesOrder | null>(null);
    const [editFields, setEditFields] = useState({ modeOfPayment: '', status: '', salesmanName: '', invoiceDate: '', termsOfDelivery: '' });
    const [saving, setSaving] = useState(false);

    // Delete state
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (!tenantId) return;
        const q = query(getTenantCollection(db, tenantId, 'salesOrders'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ordersData = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter((o: any) => !o.deleted) as SalesOrder[];
            setOrders(ordersData);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [tenantId]);

    // Reuses the POS reprint flow (POSPage reads ?reprintOrderId and prints the
    // saved bill), the same route the Khata screen's Print button takes.
    const reprintBill = (order: SalesOrder) =>
        navigate(`/pos?reprintOrderId=${encodeURIComponent(order.id)}`);

    const openEdit = (order: SalesOrder) => {
        setEditOrder(order);
        setEditFields({
            modeOfPayment: order.modeOfPayment || '',
            status: order.status || '',
            salesmanName: order.salesmanName || '',
            invoiceDate: order.invoiceDate || '',
            termsOfDelivery: order.termsOfDelivery || '',
        });
    };

    const handleSaveEdit = async () => {
        if (!editOrder || !tenantId) return;
        setSaving(true);
        try {
            const ref = getTenantDoc(db, tenantId, 'salesOrders', editOrder.id);
            const paymentStatus = editFields.modeOfPayment === 'Cash' ? 'paid' : (editOrder.status || 'pending');
            await updateDoc(ref, {
                modeOfPayment: editFields.modeOfPayment,
                status: editFields.status || paymentStatus,
                salesmanName: editFields.salesmanName,
                invoiceDate: editFields.invoiceDate,
                termsOfDelivery: editFields.termsOfDelivery,
                updatedAt: serverTimestamp(),
            });
            setEditOrder(null);
        } catch (e) {
            alert('Failed to save changes.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!tenantId) return;
        setDeleting(true);
        try {
            const order = orders.find(o => o.id === id);
            const module = order?.invoiceType === 'B2B_GST' ? 'B2B Invoice' : 'POS Billing';
            await softDelete({
                db, tenantId,
                collectionName: 'salesOrders',
                docId: id,
                userId: currentUser?.uid || '',
                userName: userName || currentUser?.email || 'Unknown',
                userRole: userRole || 'unknown',
                module,
                entityName: order?.orderNumber || order?.billNumber || id,
            });
            setDeleteConfirmId(null);
        } catch {
            alert('Failed to delete order.');
        } finally {
            setDeleting(false);
        }
    };

    const filteredOrders = orders.filter(o =>
        o.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.retailerName?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // ── Shared modal styles ──────────────────────────────────────────────
    const modalOverlay: React.CSSProperties = {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem',
    };
    const modalCard: React.CSSProperties = {
        background: 'var(--surface-raised)', borderRadius: '20px', padding: '2rem',
        maxWidth: '500px', width: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        border: '1px solid var(--surface-border)',
    };

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                <Loader2 size={48} className="spin" style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                <p>Loading Order History...</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ maxWidth: fullWidth ? 'none' : '1400px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <ShoppingCart size={32} /> Order History
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>View, edit, or delete previously generated POS bills and Sales Orders.</p>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    <input
                        type="text"
                        placeholder="Search by Bill No or Customer Name..."
                        className="input-field"
                        style={{ paddingLeft: '2.5rem', margin: 0 }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>{filteredOrders.length} records</span>
            </div>

            <div className="glass-panel" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', whiteSpace: 'nowrap' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Date</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Bill No</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Customer Name</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Type</th>
                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Total Amount</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Payment</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Status</th>
                            <th className="sticky-actions-col" style={{ padding: '1rem', fontWeight: 600, textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredOrders.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                    <ShoppingCart size={48} style={{ margin: '0 auto 1rem', opacity: 0.2, display: 'block' }} />
                                    <p>No orders found.</p>
                                </td>
                            </tr>
                        ) : (
                            filteredOrders.map((order) => {
                                const amount = getAmount(order);
                                const dateStr = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString() : 'N/A';
                                const paymentStatus = getPaymentStatus(order);
                                const statusBadge = {
                                    paid:    { bg: 'rgba(16,185,129,0.12)', color: '#10b981', label: 'Paid' },
                                    partial: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: 'Partial' },
                                    pending: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: 'Pending' },
                                }[paymentStatus];
                                return (
                                    <tr key={order.id}
                                        style={{ borderBottom: '1px solid var(--surface-border)', transition: 'background-color 0.2s' }}
                                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-raised)'}
                                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{dateStr}</td>
                                        <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{order.orderNumber || 'N/A'}</td>
                                        <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{order.retailerName || 'Walk-in'}</td>
                                        <td style={{ padding: '1rem' }}>
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '99px', background: order.invoiceType === 'B2B_GST' ? 'rgba(139,92,246,0.15)' : 'rgba(16,185,129,0.12)', color: order.invoiceType === 'B2B_GST' ? '#a78bfa' : '#10b981', fontWeight: 600 }}>
                                                {order.invoiceType === 'B2B_GST' ? 'B2B' : 'POS'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 700, color: 'var(--primary-light)', fontSize: '1rem' }}>
                                            ₹{amount.toLocaleString('en-IN')}
                                        </td>
                                        <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{order.modeOfPayment || '—'}</td>
                                        <td style={{ padding: '1rem' }}>
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '99px', background: statusBadge.bg, color: statusBadge.color, fontWeight: 600 }}>
                                                {statusBadge.label}
                                            </span>
                                        </td>
                                        <td className="sticky-actions-col" style={{ padding: '1rem' }}>
                                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                                <button
                                                    onClick={() => openEdit(order)}
                                                    title="Edit Invoice"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.7rem', background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit' }}
                                                >
                                                    <Pencil size={13} /> Edit
                                                </button>
                                                <button
                                                    onClick={() => setDeleteConfirmId(order.id)}
                                                    title="Delete Invoice"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.7rem', background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit' }}
                                                >
                                                    <Trash2 size={13} /> Delete
                                                </button>
                                                <button
                                                    onClick={() => reprintBill(order)}
                                                    title="Reprint"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.7rem', background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit' }}
                                                >
                                                    <FileText size={13} /> Reprint
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* ── Edit Modal ─────────────────────────────────────────── */}
            {editOrder && (
                <div style={modalOverlay} onClick={() => setEditOrder(null)}>
                    <div style={modalCard} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>Edit Invoice</h2>
                            <button onClick={() => setEditOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '4px' }}><X size={22} /></button>
                        </div>

                        <div style={{ background: 'var(--surface-base)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{editOrder.orderNumber}</span>
                            {' · '}{editOrder.retailerName}
                            {' · '}₹{getAmount(editOrder).toLocaleString('en-IN')}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="input-group" style={{ marginBottom: 0 }}>
                                <label>Invoice Date</label>
                                <input type="date" className="input-field" value={editFields.invoiceDate} onChange={e => setEditFields(f => ({ ...f, invoiceDate: e.target.value }))} />
                            </div>
                            <div className="input-group" style={{ marginBottom: 0 }}>
                                <label>Mode of Payment</label>
                                <select className="input-field" value={editFields.modeOfPayment} onChange={e => setEditFields(f => ({ ...f, modeOfPayment: e.target.value }))}>
                                    <option value="">— Select —</option>
                                    {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                            <div className="input-group" style={{ marginBottom: 0 }}>
                                <label>Payment Status</label>
                                <select className="input-field" value={editFields.status} onChange={e => setEditFields(f => ({ ...f, status: e.target.value }))}>
                                    <option value="pending">Pending</option>
                                    <option value="paid">Paid</option>
                                    <option value="partial">Partial</option>
                                </select>
                            </div>
                            <div className="input-group" style={{ marginBottom: 0 }}>
                                <label>Salesman Name</label>
                                <input className="input-field" placeholder="Salesman / Agent" value={editFields.salesmanName} onChange={e => setEditFields(f => ({ ...f, salesmanName: e.target.value }))} />
                            </div>
                            <div className="input-group" style={{ marginBottom: 0 }}>
                                <label>Terms of Delivery</label>
                                <input className="input-field" placeholder="e.g. By Vehicle" value={editFields.termsOfDelivery} onChange={e => setEditFields(f => ({ ...f, termsOfDelivery: e.target.value }))} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.75rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setEditOrder(null)} className="btn btn-secondary">Cancel</button>
                            <button onClick={handleSaveEdit} disabled={saving} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Delete Confirm Modal ───────────────────────────────── */}
            {deleteConfirmId && (
                <div style={modalOverlay} onClick={() => setDeleteConfirmId(null)}>
                    <div style={{ ...modalCard, maxWidth: '400px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <Trash2 size={40} style={{ color: '#f87171', margin: '0 auto 1rem', display: 'block' }} />
                        <h2 style={{ margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>Delete Invoice?</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                            This will permanently delete this invoice from order history. This action cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                            <button onClick={() => setDeleteConfirmId(null)} className="btn btn-secondary">Cancel</button>
                            <button onClick={() => handleDelete(deleteConfirmId)} disabled={deleting} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.4rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', fontSize: '0.9rem' }}>
                                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                Yes, Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
