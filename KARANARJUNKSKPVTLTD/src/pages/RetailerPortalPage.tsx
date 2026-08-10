import { useState, useEffect } from 'react';
import { getDocs, getDoc, query, orderBy, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';
import { ShoppingCart, FileText, User, Package, Truck, CheckCircle, Clock, Plus, X, Search } from 'lucide-react';

interface Product { id: string; name: string; b2bRate: number; taxRate?: number; unit: string; category?: string; }

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
    draft: { label: 'Draft', color: 'var(--text-tertiary)', bg: 'var(--surface-raised)' },
    confirmed: { label: 'Confirmed', color: 'var(--secondary-dark)', bg: 'hsla(45,93%,47%,0.1)' },
    dispatched: { label: 'Dispatched', color: 'var(--primary-light)', bg: 'hsla(152,60%,40%,0.1)' },
    delivered: { label: 'Delivered', color: 'var(--success)', bg: 'hsla(142,60%,40%,0.08)' },
    cancelled: { label: 'Cancelled', color: 'var(--danger)', bg: 'hsla(0,84%,60%,0.08)' },
};

export default function RetailerPortalPage() {
    const { tenantId, linkedId } = useAuth();
    const [retailer, setRetailer] = useState<any>(null);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'orders' | 'account'>('orders');

    const [products, setProducts] = useState<Product[]>([]);
    const [showOrderModal, setShowOrderModal] = useState(false);
    const [cart, setCart] = useState<{product:Product; qty:number}[]>([]);
    const [searchQ, setSearchQ] = useState('');
    const { showToast } = useToast();

    const fetchAll = async () => {
        if (!tenantId || !linkedId) return;
        const [rSnap, oSnap, pSnap] = await Promise.all([
            getDoc(getTenantDoc(db, tenantId, 'retailers', linkedId)),
            getDocs(query(getTenantCollection(db, tenantId, 'salesOrders'), where('retailerId', '==', linkedId), orderBy('createdAt', 'desc'))),
            getDocs(query(getTenantCollection(db, tenantId, 'products')))
        ]);
        if (rSnap.exists()) setRetailer({ id: rSnap.id, ...rSnap.data() });
        setOrders(oSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        // `name` coerced at the boundary — the product search calls
        // .toLowerCase() on it, and a doc missing it crashes the portal.
        setProducts(pSnap.docs.map(d => {
            const raw = d.data();
            return { id: d.id, ...raw, name: String(raw.name ?? '') } as Product;
        }));
        setLoading(false);
    };

    useEffect(() => {
        fetchAll();
    }, [tenantId, linkedId]);

    const handlePlaceOrder = async () => {
        if (!tenantId || cart.length === 0) return;
        try {
            let taxableValue = 0, totalTax = 0, netAmount = 0;
            const lineItems = cart.map(c => {
                const amount = (c.product.b2bRate||0) * c.qty;
                const tax = amount * (c.product.taxRate||0) / 100;
                taxableValue+=amount; totalTax+=tax; netAmount+=(amount+tax);
                return { productId:c.product.id, productName:c.product.name, qty: c.qty, unit:c.product.unit||'kg', rate:c.product.b2bRate||0, amount, taxRate:c.product.taxRate||0 };
            });
            await addDoc(getTenantCollection(db, tenantId, 'salesOrders'), {
               orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
               retailerId: retailer.id, retailerName: retailer.name, buyerGstin: retailer.gstin || '',
               createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
               status: 'draft', paymentStatus: 'Pending', invoiceDate: new Date().toISOString().split('T')[0],
               taxableValue, cgst:totalTax/2, sgst:totalTax/2, totalTax,
               netAmount, grandTotal:netAmount, lineItems, type: 'b2b_self_serve'
            });
            setShowOrderModal(false); setCart([]);
            showToast('Order placed successfully!', 'success');
            fetchAll();
        } catch(e) { console.error(e); showToast('Failed to place order','error'); }
    };

    const cartTotal = cart.reduce((s,c)=>s+(((c.product.b2bRate||0) * c.qty) * (1+(c.product.taxRate||0)/100)),0);

    if (loading) return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Loading your account...</div>;
    if (!retailer) return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--danger)' }}>Account not found. Please contact administrator.</div>;

    const tabs = [
        { id: 'orders', label: 'My Orders', icon: ShoppingCart, count: orders.length },
        { id: 'account', label: 'My Account', icon: User },
    ] as const;

    return (
        <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'1rem', marginBottom: '2rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem' }}>{retailer.name}</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>{retailer.atPost}, {retailer.taluka}, {retailer.district}</p>
                </div>
                <button onClick={()=>setShowOrderModal(true)} style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.75rem 1.5rem', background:'var(--primary-light)', color:'#fff', border:'none', borderRadius:'10px', fontWeight:600, cursor:'pointer' }}>
                   <Plus size={18}/> Place New Order
                </button>
            </div>

            {/* Financial Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '3px solid var(--secondary)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Total Orders Value</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>₹{Number(retailer.totalSales || 0).toLocaleString()}</div>
                </div>
                <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '3px solid var(--primary)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Amount Paid</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary-light)' }}>₹{Number(retailer.totalPaid || 0).toLocaleString()}</div>
                </div>
                <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '3px solid var(--danger)', background: Number(retailer.outstandingAmount || 0) > 0 ? 'hsla(0,84%,60%,0.04)' : undefined }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Outstanding</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: Number(retailer.outstandingAmount || 0) > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>₹{Number(retailer.outstandingAmount || 0).toLocaleString()}</div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--surface-border)', marginBottom: '1.5rem' }}>
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.7rem 1.1rem', background: activeTab === tab.id ? 'var(--surface-raised)' : 'transparent', color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-tertiary)', border: '1px solid', borderColor: activeTab === tab.id ? 'var(--surface-border)' : 'transparent', borderRadius: '10px', cursor: 'pointer', fontWeight: activeTab === tab.id ? 600 : 400, font: 'inherit' }}>
                        <tab.icon size={16} />{tab.label}
                        {'count' in tab && <span style={{ background: activeTab === tab.id ? 'var(--primary)' : 'var(--surface-border)', color: activeTab === tab.id ? 'white' : 'inherit', padding: '1px 7px', borderRadius: '10px', fontSize: '0.72rem' }}>{tab.count}</span>}
                    </button>
                ))}
            </div>

            {/* Orders Tab */}
            {activeTab === 'orders' && (
                <div className="animate-fade-in">
                    {orders.length === 0 ? (
                        <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem' }}>
                            <ShoppingCart size={40} color="var(--surface-border)" style={{ margin: '0 auto 1rem auto', display: 'block' }} />
                            <p style={{ color: 'var(--text-tertiary)' }}>No orders placed yet.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {orders.map((order: any) => {
                                const badge = STATUS_BADGE[order.status] || STATUS_BADGE.draft;
                                return (
                                    <div key={order.id} className="glass-panel" style={{ padding: '1.25rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            <div>
                                                <span style={{ fontWeight: 700, color: 'var(--primary-light)' }}>{order.orderNumber}</span>
                                                <span style={{ marginLeft: '1rem', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{order.createdAt?.toDate ? new Date(order.createdAt.toDate()).toLocaleDateString() : ''}</span>
                                            </div>
                                            <span style={{ padding: '0.3rem 0.8rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600, color: badge.color, background: badge.bg, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                {order.status === 'delivered' ? <CheckCircle size={12} /> : order.status === 'dispatched' ? <Truck size={12} /> : <Clock size={12} />}
                                                {badge.label}
                                            </span>
                                        </div>
                                        {/* Products list */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.75rem' }}>
                                            {(order.lineItems || []).map((item: any, i: number) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)' }}><Package size={13} />{item.productName}</span>
                                                    <span>{item.qty} {item.unit}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--surface-border)', paddingTop: '0.75rem' }}>
                                            <span style={{ fontSize: '0.8rem', color: order.paymentStatus === 'Paid' ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                                {order.paymentStatus === 'Paid' ? '✓ Paid' : '⚠ Payment Pending'}
                                            </span>
                                            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--primary-light)' }}>₹{Number(order.grandTotal).toLocaleString()}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Account Tab */}
            {activeTab === 'account' && (
                <div className="glass-panel animate-fade-in" style={{ padding: '2rem' }}>
                    <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><FileText size={18} color="var(--primary-light)" /> Business Details</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
                        {[
                            ['Business Name', retailer.name],
                            ['Contact', retailer.number],
                            ['Email', retailer.email || '-'],
                            ['Village / At Post', retailer.atPost],
                            ['Taluka', retailer.taluka],
                            ['District', retailer.district],
                            ['State', retailer.state],
                            ['GSTIN', retailer.gstin || '-'],
                            ['Licence Number', retailer.licenseNumber || '-'],
                            ['Customer Type', retailer.portfolioSize],
                        ].map(([label, value]) => (
                            <div key={label}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>{label}</div>
                                <div style={{ fontWeight: 500 }}>{value}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {showOrderModal && (
                <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', justifyContent:'center', alignItems:'center', padding:'1rem', backdropFilter:'blur(4px)' }}>
                    <div className="glass-panel animate-fade-in" style={{ width:'100%', maxWidth:'600px', maxHeight:'90vh', display:'flex', flexDirection:'column', background:'var(--surface-base)' }}>
                        <div style={{ padding:'1.5rem', borderBottom:'1px solid var(--surface-border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <h2 style={{ fontSize:'1.25rem', display:'flex', alignItems:'center', gap:'0.5rem' }}><ShoppingCart size={20}/> New B2B Order</h2>
                            <button onClick={()=>setShowOrderModal(false)} style={{ background:'transparent', border:'none', cursor:'pointer', color:'var(--text-secondary)' }}><X size={20}/></button>
                        </div>
                        
                        <div style={{ padding:'1.5rem', flex:1, overflowY:'auto' }}>
                            <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1rem', background:'var(--surface-raised)', padding:'0.5rem 1rem', borderRadius:'8px', border:'1px solid var(--surface-border)' }}>
                                <Search size={18} color="var(--text-tertiary)" style={{ marginTop:'0.2rem' }}/>
                                <input placeholder="Search products..." value={searchQ} onChange={e=>setSearchQ(e.target.value)} style={{ border:'none', background:'transparent', flex:1, color:'var(--text-primary)', outline:'none' }} />
                            </div>

                            <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                                {products.filter(p=>p.name.toLowerCase().includes(searchQ.toLowerCase())).slice(0,50).map(p=>(
                                    <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'1rem', background:'var(--surface-raised)', borderRadius:'8px', border:'1px solid var(--surface-border)' }}>
                                        <div>
                                            <div style={{ fontWeight:600 }}>{p.name}</div>
                                            <div style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>₹{p.b2bRate||0} / {p.unit||'kg'} (+{p.taxRate||0}% GST)</div>
                                        </div>
                                        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                                            <button onClick={()=>{
                                                const ex = cart.find(c=>c.product.id===p.id);
                                                if(ex && ex.qty>1) setCart(cart.map(c=>c.product.id===p.id?{...c,qty:c.qty-1}:c));
                                                else if(ex) setCart(cart.filter(c=>c.product.id!==p.id));
                                            }} style={{ width:'28px', height:'28px', borderRadius:'6px', border:'none', background:'var(--surface-border)', cursor:'pointer', fontWeight:700 }}>-</button>
                                            <span style={{ width:'20px', textAlign:'center', fontSize:'0.9rem', fontWeight:600 }}>{cart.find(c=>c.product.id===p.id)?.qty || 0}</span>
                                            <button onClick={()=>{
                                                const ex = cart.find(c=>c.product.id===p.id);
                                                if(ex) setCart(cart.map(c=>c.product.id===p.id?{...c,qty:c.qty+1}:c));
                                                else setCart([...cart,{product:p,qty:1}]);
                                            }} style={{ width:'28px', height:'28px', borderRadius:'6px', border:'none', background:'var(--primary-light)', color:'#fff', cursor:'pointer', fontWeight:700 }}>+</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ padding:'1.5rem', borderTop:'1px solid var(--surface-border)', background:'var(--surface-raised)' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'1rem', fontSize:'1.1rem', fontWeight:700 }}>
                                <span>Cart Total (Inc. Tax)</span>
                                <span style={{ color:'var(--primary-light)' }}>₹{cartTotal.toLocaleString(undefined,{maximumFractionDigits:2})}</span>
                            </div>
                            <button onClick={handlePlaceOrder} disabled={cart.length===0} style={{ width:'100%', padding:'1rem', background:'var(--primary-light)', color:'#fff', border:'none', borderRadius:'10px', fontWeight:700, fontSize:'1.1rem', cursor:cart.length===0?'not-allowed':'pointer', opacity:cart.length===0?0.5:1 }}>
                                Place Order
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
