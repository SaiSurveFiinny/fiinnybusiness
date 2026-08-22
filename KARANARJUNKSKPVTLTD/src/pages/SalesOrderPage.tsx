import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { addDoc, getDoc, updateDoc, getDocs, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';
import { ArrowLeft, Plus, Trash2, Save, CheckCircle, Package, Truck, MessageCircle, Lock, LockOpen } from 'lucide-react';

interface LineItem {
    productId: string;
    productName: string;
    qty: number;
    unit: 'Boxes' | 'Pieces';
    mrp: number;
    ptr: number;
    retailerRate: number;
    gstPct: number;
    lineTotal: number;
}

const emptyLine = (): LineItem => ({ productId: '', productName: '', qty: 1, unit: 'Boxes', mrp: 0, ptr: 0, retailerRate: 0, gstPct: 5, lineTotal: 0 });

export default function SalesOrderPage() {
    const { id: orderId } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { tenantId } = useAuth();
    const { showToast } = useToast();
    const isNew = !orderId;

    const [products, setProducts] = useState<any[]>([]);
    const [manufacturers, setManufacturers] = useState<any[]>([]);
    const [retailer, setRetailer] = useState<any>(null);
    const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);
    const [mfgId, setMfgId] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [existingOrder, setExistingOrder] = useState<any>(null);

    const retailerId = searchParams.get('retailerId') || existingOrder?.retailerId;

    const isLocked = !isNew && !!existingOrder && existingOrder.status !== 'delivered' && !existingOrder.manuallyUnlocked;

    const handleUnlock = async () => {
        if (!tenantId || !orderId) return;
        await updateDoc(getTenantDoc(db, tenantId, 'salesOrders', orderId), { manuallyUnlocked: true });
        const snap = await getDoc(getTenantDoc(db, tenantId, 'salesOrders', orderId));
        if (snap.exists()) setExistingOrder({ id: snap.id, ...snap.data() });
    };

    useEffect(() => {
        if (!tenantId) return;
        const fetchBase = async () => {
            const [pSnap, mSnap] = await Promise.all([
                getDocs(query(getTenantCollection(db, tenantId, 'products'), orderBy('name'))),
                getDocs(query(getTenantCollection(db, tenantId, 'manufacturers'), orderBy('name'))),
            ]);
            setProducts(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setManufacturers(mSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        };
        fetchBase();
    }, [tenantId]);

    useEffect(() => {
        if (!tenantId || !retailerId) return;
        getDoc(getTenantDoc(db, tenantId, 'retailers', retailerId)).then(snap => {
            if (snap.exists()) setRetailer({ id: snap.id, ...snap.data() });
        });
    }, [tenantId, retailerId]);

    useEffect(() => {
        if (!tenantId || !orderId) return;
        getDoc(getTenantDoc(db, tenantId, 'salesOrders', orderId)).then(snap => {
            if (snap.exists()) {
                const data = snap.data();
                setExistingOrder({ id: snap.id, ...data });
                setLineItems(data.lineItems || [emptyLine()]);
                setMfgId(data.assignedManufacturerId || '');
                setNotes(data.notes || '');
                // status tracked via existingOrder.status
            }
        });
    }, [tenantId, orderId]);

    const calcLine = (item: LineItem): LineItem => {
        const baseRate = item.retailerRate || item.ptr;
        const baseTotal = item.unit === 'Boxes'
            ? item.qty * (products.find(p => p.id === item.productId)?.boxCapacity || 1) * baseRate
            : item.qty * baseRate;
        const gstAmount = baseTotal * (item.gstPct / 100);
        return { ...item, lineTotal: Math.round((baseTotal + gstAmount) * 100) / 100 };
    };

    const updateLine = (idx: number, changes: Partial<LineItem>) => {
        setLineItems(prev => prev.map((item, i) => {
            if (i !== idx) return item;
            const updated = { ...item, ...changes };
            if (changes.productId) {
                const p = products.find(x => x.id === changes.productId);
                if (p) {
                    updated.productName = p.name;
                    updated.mrp = p.mrp || 0;
                    updated.ptr = p.ptr || 0;
                    updated.retailerRate = p.retailerRate || p.sellingPrice || p.ptr || 0;
                    updated.gstPct = p.gstPct || 5;
                }
            }
            return calcLine(updated);
        }));
    };

    const removeLine = (idx: number) => setLineItems(prev => prev.filter((_, i) => i !== idx));
    const addLine = () => setLineItems(prev => [...prev, emptyLine()]);

    const subtotal = lineItems.reduce((s, l) => s + (l.lineTotal || 0), 0);
    const grandTotal = subtotal;

    const handleSave = async (newStatus: 'draft' | 'confirmed') => {
        if (isLocked) { showToast('This order is locked for editing.', 'error'); return; }
        if (!tenantId || !retailerId || !retailer) { showToast('Retailer info missing.', 'error'); return; }
        if (lineItems.some(l => !l.productId)) { showToast('Please select a product for each line item.', 'error'); return; }
        setSaving(true);
        try {
            const mfg = manufacturers.find(m => m.id === mfgId);
            const payload = {
                retailerId,
                retailerName: retailer.name,
                retailerGSTIN: retailer.gstin || '',
                retailerAddress: `${retailer.atPost || ''}, ${retailer.taluka || ''}, ${retailer.district || ''}, ${retailer.state || ''}`.trim(),
                lineItems,
                subtotal,
                gstAmount: 0,
                grandTotal,
                assignedManufacturerId: mfgId || '',
                assignedManufacturerName: mfg?.name || '',
                notes,
                status: newStatus,
                paymentStatus: 'Unpaid',
                amountPaid: 0,
                updatedAt: serverTimestamp(),
            };

            if (isNew) {
                const orderCount = (await getDocs(getTenantCollection(db, tenantId, 'salesOrders'))).size + 1;
                const orderNumber = `SO-${new Date().getFullYear()}-${String(orderCount).padStart(4, '0')}`;
                await addDoc(getTenantCollection(db, tenantId, 'salesOrders'), { ...payload, orderNumber, createdAt: serverTimestamp() });
                // Update retailer financials
                if (newStatus === 'confirmed') {
                    await updateDoc(getTenantDoc(db, tenantId, 'retailers', retailerId), {
                        lastOrderedAt: serverTimestamp(),
                        totalSales: (Number(retailer.totalSales) || 0) + grandTotal,
                        outstandingAmount: (Number(retailer.outstandingAmount) || 0) + grandTotal,
                    });
                }
            } else {
                await updateDoc(getTenantDoc(db, tenantId, 'salesOrders', orderId!), payload);
            }

            showToast(newStatus === 'confirmed' ? 'Order confirmed!' : 'Draft saved!', 'success');
            navigate(`/worklist/${retailerId}`);
        } catch (err) {
            console.error(err);
            showToast('Failed to save order.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleWhatsAppDispatch = () => {
        if (!mfgId) { showToast('Please assign a manufacturer first.', 'error'); return; }
        const mfg = manufacturers.find(m => m.id === mfgId);
        if (!mfg?.phone) { showToast('Manufacturer has no phone number on record.', 'error'); return; }
        const itemLines = lineItems.map(l => `• ${l.productName}: ${l.qty} ${l.unit}`).join('\n');
        const msg = encodeURIComponent(`*Dispatch Request*\nRetailer: ${retailer?.name}\nAddress: ${retailer?.atPost}, ${retailer?.taluka}, ${retailer?.district}\n\nItems:\n${itemLines}\n\nNotes: ${notes || 'None'}`);
        window.open(`https://wa.me/${mfg.phone.replace(/\D/g, '')}?text=${msg}`, '_blank');
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '960px', margin: '0 auto' }}>
            <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }} onClick={() => navigate(retailerId ? `/worklist/${retailerId}` : '/worklist')}>
                <ArrowLeft size={16} /> Back to Retailer
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem' }}>{isNew ? 'New Sales Order' : `Edit Order`}</h1>
                    {retailer && <p style={{ color: 'var(--text-secondary)' }}>For: <strong>{retailer.name}</strong> · {retailer.atPost}, {retailer.district}</p>}
                </div>
                {retailer?.gstin && <span style={{ background: 'var(--surface-raised)', padding: '0.4rem 0.9rem', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>GSTIN: {retailer.gstin}</span>}
            </div>

            {/* Line Items */}
            <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Package size={18} color="var(--primary-light)" /> Products</h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ color: 'var(--text-tertiary)', textAlign: 'left' }}>
                                {['Product', 'Qty', 'Unit', 'PTR', 'Ret. Rate', 'GST%', 'Total', ''].map(h => (
                                    <th key={h} style={{ padding: '0.5rem 0.75rem', fontWeight: 600, borderBottom: '1px solid var(--surface-border)' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {lineItems.map((item, idx) => (
                                <tr key={idx}>
                                    <td style={{ padding: '0.5rem 0.5rem 0.5rem 0' }}>
                                        <select className="input-field" style={{ margin: 0, minWidth: '160px', appearance: 'auto' }} value={item.productId} onChange={e => updateLine(idx, { productId: e.target.value })}>
                                            <option value="">-- Select --</option>
                                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <input type="number" min={1} className="input-field" style={{ margin: 0, width: '70px' }} value={item.qty} onChange={e => updateLine(idx, { qty: Number(e.target.value) })} />
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <select className="input-field" style={{ margin: 0, appearance: 'auto' }} value={item.unit} onChange={e => updateLine(idx, { unit: e.target.value as any })}>
                                            <option>Boxes</option><option>Pieces</option>
                                        </select>
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <input type="number" className="input-field" style={{ margin: 0, width: '80px' }} value={item.ptr} onChange={e => updateLine(idx, { ptr: Number(e.target.value) })} />
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <input type="number" className="input-field" style={{ margin: 0, width: '80px' }} value={item.retailerRate} onChange={e => updateLine(idx, { retailerRate: Number(e.target.value) })} />
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <input type="number" className="input-field" style={{ margin: 0, width: '60px' }} value={item.gstPct} onChange={e => updateLine(idx, { gstPct: Number(e.target.value) })} />
                                    </td>
                                    <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--primary-light)' }}>₹{item.lineTotal.toLocaleString()}</td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <button onClick={() => removeLine(idx)} disabled={lineItems.length === 1} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '0.25rem' }}><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <button className="btn btn-secondary" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }} onClick={addLine}>
                    <Plus size={16} /> Add Product Line
                </button>

                {/* Totals */}
                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Subtotal (incl. GST)</span>
                            <span>₹{subtotal.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 700, borderTop: '1px solid var(--surface-border)', paddingTop: '0.5rem' }}>
                            <span>Grand Total</span>
                            <span style={{ color: 'var(--primary-light)' }}>₹{grandTotal.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Manufacturer & Notes */}
            <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Truck size={18} color="var(--primary-light)" /> Dispatch Details</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="input-group">
                        <label>Assign Manufacturer</label>
                        <select className="input-field" style={{ appearance: 'auto' }} value={mfgId} onChange={e => setMfgId(e.target.value)}>
                            <option value="">-- Not Assigned --</option>
                            {manufacturers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    </div>
                    <div className="input-group">
                        <label>Notes / Instructions</label>
                        <input className="input-field" placeholder="Special dispatch instructions..." value={notes} onChange={e => setNotes(e.target.value)} />
                    </div>
                </div>
                {mfgId && (
                    <button className="btn" style={{ marginTop: '1rem', background: '#25D366', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }} onClick={handleWhatsAppDispatch}>
                        <MessageCircle size={16} /> Send Dispatch Instructions via WhatsApp
                    </button>
                )}
            </div>

            {/* Lock banner */}
            {isLocked && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1.25rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '10px', marginBottom: '1rem' }}>
                    <Lock size={16} color="#f59e0b" />
                    <span style={{ flex: 1, fontSize: '0.9rem', color: '#f59e0b', fontWeight: 600 }}>This order is locked for editing until status is Delivered, or unlocked manually.</span>
                    <button onClick={handleUnlock}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 1rem', background: 'rgba(245,158,11,0.2)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.5)', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'inherit' }}>
                        <LockOpen size={14} /> Unlock Order
                    </button>
                </div>
            )}
            {existingOrder?.manuallyUnlocked && existingOrder?.status !== 'delivered' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', color: '#10b981', fontWeight: 600 }}>
                    <LockOpen size={14} /> Order manually unlocked — editing allowed
                </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={() => handleSave('draft')} disabled={saving || isLocked} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isLocked ? 0.5 : 1, cursor: isLocked ? 'not-allowed' : undefined }}>
                    <Save size={16} /> Save as Draft
                </button>
                <button className="btn btn-primary animate-pulse" onClick={() => handleSave('confirmed')} disabled={saving || isLocked} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isLocked ? 0.5 : 1, cursor: isLocked ? 'not-allowed' : undefined }}>
                    <CheckCircle size={16} /> {saving ? 'Saving...' : 'Confirm Order'}
                </button>
            </div>
        </div>
    );
}
