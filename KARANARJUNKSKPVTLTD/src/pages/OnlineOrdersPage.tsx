import { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Plus, Edit2, Trash2, Loader2, Save, X, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { query, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import Papa from 'papaparse';
import { downloadInvoicePDF } from '../utils/invoiceEngine';
import { fetchInvoiceTemplate, fetchInvoiceBranding } from '../services/invoiceTemplateService';

export interface OnlineOrderProduct {
    productName: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxRate: number; // e.g. 0, 5, 12, 18, 28
    subTotal: number; // (quantity * unitPrice) - discount + tax
}

export interface OnlineOrder {
    id: string;
    // Delivery Details
    customerName: string;
    phoneNumber: string;
    alternatePhone?: string;
    address: string;
    billingSameAsDelivery?: boolean;
    // Pickup Details
    pickupAddress?: string;
    // Products
    products: OnlineOrderProduct[];
    // Package Details
    packageWeight?: string; // '0.5 kg', '1 kg', etc.
    packageLength?: string;
    packageWidth?: string;
    packageHeight?: string;
    // Payment Details
    paymentMethod: 'Prepaid' | 'Cash on Delivery';
    paymentStatus: 'Unpaid' | 'Partial' | 'Paid';
    amount: number; // Total Order Value
    paymentDate?: string;
    paymentTime?: string;
    // Fulfillment
    courierSent: 'Yes' | 'No';
    courierSendDate?: string;
    remarks?: string;
    source?: 'Website' | 'Phone Call';
    createdAt?: any;
}

export default function OnlineOrdersPage() {
    const { userRole, tenantId, tenantData } = useAuth();
    const [orders, setOrders] = useState<OnlineOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState<OnlineOrder | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form State
    const [formData, setFormData] = useState({
        customerName: '',
        phoneNumber: '',
        alternatePhone: '',
        address: '',
        billingSameAsDelivery: true,
        pickupAddress: 'Karan Arjun Krushi Seva Kendra',
        products: [] as OnlineOrderProduct[],
        packageWeight: '',
        packageLength: '',
        packageWidth: '',
        packageHeight: '',
        paymentMethod: 'Prepaid' as 'Prepaid' | 'Cash on Delivery',
        paymentStatus: 'Unpaid' as 'Unpaid' | 'Partial' | 'Paid',
        amount: 0,
        paymentDate: '',
        paymentTime: '',
        courierSent: 'No' as 'Yes' | 'No',
        courierSendDate: '',
        remarks: ''
    });

    useEffect(() => {
        if (!tenantId) return;
        const q = query(getTenantCollection(db, tenantId, 'onlineOrders'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ordersData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as OnlineOrder[];
            // Sort by creation date or just let it be
            setOrders(ordersData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [tenantId]);

    // Helper to calculate total
    const calculateTotal = (products: OnlineOrderProduct[]) => {
        return products.reduce((acc, product) => acc + (product.subTotal || 0), 0);
    };

    // Auto update total
    useEffect(() => {
        setFormData(prev => ({ ...prev, amount: calculateTotal(prev.products) }));
    }, [formData.products]);

    const handleOpenModal = (order?: OnlineOrder) => {
        if (order) {
            setEditingOrder(order);
            setFormData({
                customerName: order.customerName || '',
                phoneNumber: order.phoneNumber || '',
                alternatePhone: order.alternatePhone || '',
                address: order.address || '',
                billingSameAsDelivery: order.billingSameAsDelivery ?? true,
                pickupAddress: order.pickupAddress || 'Karan Arjun Krushi Seva Kendra',
                products: order.products || [],
                packageWeight: order.packageWeight || '',
                packageLength: order.packageLength || '',
                packageWidth: order.packageWidth || '',
                packageHeight: order.packageHeight || '',
                paymentMethod: order.paymentMethod || 'Prepaid',
                paymentStatus: order.paymentStatus || 'Unpaid',
                amount: order.amount || 0,
                paymentDate: order.paymentDate || '',
                paymentTime: order.paymentTime || '',
                courierSent: order.courierSent || 'No',
                courierSendDate: order.courierSendDate || '',
                remarks: order.remarks || ''
            });
        } else {
            setEditingOrder(null);
            setFormData({
                customerName: '',
                phoneNumber: '',
                alternatePhone: '',
                address: '',
                billingSameAsDelivery: true,
                pickupAddress: 'Karan Arjun Krushi Seva Kendra',
                products: [{ productName: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 0, subTotal: 0 }],
                packageWeight: '',
                packageLength: '',
                packageWidth: '',
                packageHeight: '',
                paymentMethod: 'Prepaid',
                paymentStatus: 'Unpaid',
                amount: 0,
                paymentDate: '',
                paymentTime: '',
                courierSent: 'No',
                courierSendDate: '',
                remarks: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSaveOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tenantId) return;

        const orderData = {
            ...formData,
            updatedAt: serverTimestamp()
        };

        try {
            if (editingOrder) {
                await updateDoc(getTenantDoc(db, tenantId, 'onlineOrders', editingOrder.id), orderData);
            } else {
                await addDoc(getTenantCollection(db, tenantId, 'onlineOrders'), {
                    ...orderData,
                    source: 'Phone Call',
                    createdAt: serverTimestamp()
                });
            }
            setIsModalOpen(false);
        } catch (error) {
            console.error("Error saving order:", error);
            alert("Failed to save order");
        }
    };

    const handleDeleteOrder = async (id: string) => {
        if (!tenantId || !window.confirm('Are you sure you want to delete this order?')) return;
        try {
            await deleteDoc(getTenantDoc(db, tenantId, 'onlineOrders', id));
        } catch (error) {
            console.error("Error deleting order:", error);
            alert("Failed to delete order");
        }
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !tenantId) return;

        setLoading(true);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    let addedCount = 0;

                    for (const row of results.data as any[]) {
                        const customerName = row['Customer Name']?.trim();
                        if (!customerName) continue;

                        const orderData = {
                            customerName,
                            phoneNumber: row['Phone Number']?.trim() || '',
                            alternatePhone: row['Alternate phone no']?.trim() || '',
                            address: row['Address']?.trim() || '',
                            billingSameAsDelivery: true,
                            pickupAddress: 'Karan Arjun Krushi Seva Kendra',
                            products: (row['Requirements']?.trim() || '').split(',').map((s: string) => ({
                                productName: s.trim(), quantity: 1, unitPrice: 0, discount: 0, taxRate: 0, subTotal: 0
                            })).filter((p: any) => p.productName),
                            packageWeight: '',
                            packageLength: '',
                            packageWidth: '',
                            packageHeight: '',
                            paymentMethod: 'Prepaid',
                            paymentStatus: (row['Payment Status']?.trim() || 'Unpaid') as any,
                            amount: Number(row['Amount']) || 0,
                            paymentDate: row['Payment Date']?.trim() || '',
                            paymentTime: row['Payment time']?.trim() || '',
                            courierSent: (row['Courier Sent']?.trim() || 'No') as any,
                            courierSendDate: row['Courier Send Date']?.trim() || '',
                            remarks: row['Remarks']?.trim() || '',
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp()
                        };

                        await addDoc(getTenantCollection(db, tenantId, 'onlineOrders'), orderData);
                        addedCount++;
                    }
                    alert(`Upload Complete! \nAdded: ${addedCount}`);
                } catch (error) {
                    console.error("Upload error:", error);
                    alert("Error processing CSV upload.");
                } finally {
                    setLoading(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }
            }
        });
    };

    const handleDownloadTemplate = () => {
        const csvContent = "Customer Name,Phone Number,Alternate phone no,Requirements,Address,Payment Status,Amount,Payment Date,Payment time,Courier Sent,Courier Send Date,Remarks\n" +
            "John Doe,9876543210,9876543211,Tomato Hybrid X,123 Farm Road,Paid,1500,2026-03-10,14:30,Yes,2026-03-11,Urgent delivery\n";

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "online_orders_template.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const generateInvoice = async (order: OnlineOrder) => {
        if (!tenantId || !tenantData) return;

        try {
            const [tmpl, brd] = await Promise.all([
                fetchInvoiceTemplate(tenantId, 'distributor_retailer'),
                fetchInvoiceBranding(tenantId),
            ]);

            // Map online order to B2C invoice format
            const items = order.products?.map(req => ({
                productName: req.productName,
                quantity: req.quantity,
                unit: 'nos',
                mrp: req.unitPrice,
                amount: req.subTotal,
                gstPct: req.taxRate || 0
            })) || [];

            const invoiceData = {
                invoiceNumber: `ONL-${order.id.substring(0, 6).toUpperCase()}`,
                retailer: {
                    name: order.customerName,
                    atPost: order.address || '',
                    number: order.phoneNumber || ''
                },
                order: {
                    id: order.id,
                    amount: order.amount
                },
                orders: items,
                isOutstanding: false
            };

            await downloadInvoicePDF(tmpl, brd, invoiceData);
        } catch (error) {
            console.error("Invoice generation failed", error);
            alert("Failed to generate invoice");
        }
    };

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                <Loader2 size={48} className="spin" style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                <p>Loading Online Orders...</p>
            </div>
        );
    }

    const handleProductChange = (index: number, field: keyof OnlineOrderProduct, value: any) => {
        const newProducts = [...formData.products];
        newProducts[index] = { ...newProducts[index], [field]: value };
        
        // Recalculate subtotal
        if (field === 'quantity' || field === 'unitPrice' || field === 'discount' || field === 'taxRate') {
            const p = newProducts[index];
            const basePrice = p.quantity * p.unitPrice;
            const discounted = Math.max(0, basePrice - p.discount);
            const tax = (discounted * p.taxRate) / 100;
            newProducts[index].subTotal = discounted + tax;
        }
        
        setFormData({ ...formData, products: newProducts });
    };

    const addProduct = () => {
        setFormData({ ...formData, products: [...formData.products, { productName: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 0, subTotal: 0 }] });
    };

    const removeProduct = (index: number) => {
        if (formData.products.length <= 1) return;
        const newProducts = [...formData.products];
        newProducts.splice(index, 1);
        setFormData({ ...formData, products: newProducts });
    };

    return (
        <div className="animate-fade-in" style={{ width: '100%' }}>
            <div style={{ marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <ShoppingCart size={32} /> Online Orders
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Manage D2C online orders, tracking, and B2C invoices.</p>
                </div>
                {userRole === 'admin' && (
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <input
                            type="file"
                            accept=".csv"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleFileUpload}
                        />
                        <button onClick={handleDownloadTemplate} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                            <Download size={16} /> CSV Template
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                            <FileSpreadsheet size={16} /> Upload CSV
                        </button>
                        <button onClick={() => handleOpenModal()} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Plus size={18} /> Add Order
                        </button>
                    </div>
                )}
            </div>

            <div className="glass-panel" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', whiteSpace: 'nowrap' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Customer</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Phone</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Products</th>
                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Amount</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Source</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Payment</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Packages</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Courier</th>
                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                    <ShoppingCart size={48} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
                                    <p>No online orders found.</p>
                                </td>
                            </tr>
                        ) : (
                            orders.map((order) => (
                                <tr key={order.id} style={{ borderBottom: '1px solid var(--surface-border)', transition: 'background-color 0.2s' }}
                                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-raised)'}
                                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <td style={{ padding: '1rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                                        <div>{order.customerName}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.address}</div>
                                    </td>
                                    <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                                        <div>{order.phoneNumber}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{order.alternatePhone}</div>
                                    </td>
                                    <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', maxWidth: '200px' }}>
                                            {(order.products || []).map((req, i) => (
                                                <span key={i} style={{ background: 'var(--surface-raised)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>{req.quantity}x {req.productName}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 600, color: 'var(--primary-light)' }}>
                                        ₹{order.amount}
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        {order.source === 'Website' ? (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '6px 12px', justifySelf: 'flex-start', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 600 }}>
                                                Website
                                            </span>
                                        ) : (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-border)', color: 'var(--text-secondary)', padding: '6px 12px', justifySelf: 'flex-start', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 600 }}>
                                                Phone Call
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span className={`badge ${order.paymentStatus === 'Paid' ? 'badge-success' : order.paymentStatus === 'Partial' ? 'badge-warning' : 'badge-danger'}`}>
                                                {order.paymentStatus}
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', background: 'var(--surface-raised)', padding: '2px 6px', borderRadius: '4px' }}>
                                                {order.paymentMethod}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                            {order.paymentDate} {order.paymentTime}
                                        </div>
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                            {order.packageWeight ? order.packageWeight : 'N/A'}
                                        </div>
                                        {order.packageLength && (
                                             <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                                {order.packageLength}x{order.packageWidth}x{order.packageHeight}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <span className={`badge ${order.courierSent === 'Yes' ? 'badge-success' : 'badge-secondary'}`}>
                                            {order.courierSent === 'Yes' ? 'Dispatched' : 'Pending'}
                                        </span>
                                        {order.courierSent === 'Yes' && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                                {order.courierSendDate}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                            <button
                                                onClick={() => generateInvoice(order)}
                                                className="icon-btn"
                                                title="Generate Invoice"
                                                style={{ color: 'var(--primary-light)' }}
                                            >
                                                <FileText size={18} />
                                            </button>
                                            {userRole === 'admin' && (
                                                <>
                                                    <button onClick={() => handleOpenModal(order)} className="icon-btn" title="Edit">
                                                        <Edit2 size={18} />
                                                    </button>
                                                    <button onClick={() => handleDeleteOrder(order.id)} className="icon-btn" title="Delete" style={{ color: 'var(--danger)' }}>
                                                        <Trash2 size={18} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content animate-slide-up" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--surface-border)', position: 'sticky', top: 0, backgroundColor: 'var(--surface-base)', zIndex: 10 }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{editingOrder ? 'Edit Online Order' : 'Add Order'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="icon-btn"><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSaveOrder} style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                            {/* PICKUP ADDRESS */}
                            <section>
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>Pickup Address</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '1rem' }}>Add the Address from where pickup will happen</p>
                                <div style={{ background: 'var(--surface-raised)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                                    <div style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {formData.pickupAddress} <span style={{ color: 'var(--success)', fontSize: '0.75rem', background: 'rgba(34, 197, 94, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>✔ Verified</span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        Karan Arjun Krushi Seva Kendra, Nandgaon, Karjat, Ahilyanagar, Maharashtra - 414402
                                    </div>
                                </div>
                            </section>

                            {/* DELIVERY DETAILS */}
                            <section>
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>Delivery Details</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '1rem' }}>Enter the Delivery Details of your buyer</p>
                                <div style={{ display: 'grid', gap: '1rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label className="input-label">Mobile Number</label>
                                            <input required placeholder="Enter Mobile Number" className="input-field" value={formData.phoneNumber} onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="input-label">Alternate Mobile (Optional)</label>
                                            <input placeholder="Enter Alt Mobile" className="input-field" value={formData.alternatePhone} onChange={e => setFormData({ ...formData, alternatePhone: e.target.value })} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="input-label">Full Name</label>
                                        <input required placeholder="Enter Customer full name" className="input-field" value={formData.customerName} onChange={e => setFormData({ ...formData, customerName: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="input-label">Complete Address</label>
                                        <textarea required rows={3} placeholder="Enter complete delivery address" className="input-field" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                                    </div>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={formData.billingSameAsDelivery} onChange={e => setFormData({ ...formData, billingSameAsDelivery: e.target.checked })} />
                                        Billing Address Same as Delivery Address
                                    </label>
                                </div>
                            </section>

                            {/* PRODUCT DETAILS */}
                            <section>
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>Product Details</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '1rem' }}>Enter the product details for the items in this order</p>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {formData.products.map((product, index) => (
                                        <div key={index} style={{ background: 'var(--surface-raised)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--surface-border)', position: 'relative' }}>
                                            {formData.products.length > 1 && (
                                                <button type="button" onClick={() => removeProduct(index)} style={{ position: 'absolute', top: '10px', right: '10px', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={16} /></button>
                                            )}
                                            <div style={{ marginBottom: '1rem' }}>
                                                <label className="input-label">Product Name</label>
                                                <input required placeholder="Enter Product name" className="input-field" value={product.productName} onChange={e => handleProductChange(index, 'productName', e.target.value)} />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                                                <div>
                                                    <label className="input-label">Quantity</label>
                                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                                        <button type="button" onClick={() => handleProductChange(index, 'quantity', Math.max(1, product.quantity - 1))} style={{ padding: '0.5rem 1rem', background: 'var(--surface-border)', border: 'none', borderRadius: '4px 0 0 4px', cursor: 'pointer' }}>-</button>
                                                        <input required type="number" min="1" className="input-field" style={{ borderRadius: 0, textAlign: 'center', flex: 1 }} value={product.quantity} onChange={e => handleProductChange(index, 'quantity', Number(e.target.value))} />
                                                        <button type="button" onClick={() => handleProductChange(index, 'quantity', product.quantity + 1)} style={{ padding: '0.5rem 1rem', background: 'var(--surface-border)', border: 'none', borderRadius: '0 4px 4px 0', cursor: 'pointer' }}>+</button>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="input-label">Unit Price (₹)</label>
                                                    <input required type="number" min="0" step="0.01" className="input-field" value={product.unitPrice} onChange={e => handleProductChange(index, 'unitPrice', Number(e.target.value))} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                                                <div>
                                                    <label className="input-label">Product Discount (Optional) (₹)</label>
                                                    <input type="number" min="0" step="0.01" className="input-field" value={product.discount} onChange={e => handleProductChange(index, 'discount', Number(e.target.value))} />
                                                </div>
                                                <div>
                                                    <label className="input-label">Tax Rate (%)</label>
                                                    <select className="input-field" value={product.taxRate} onChange={e => handleProductChange(index, 'taxRate', Number(e.target.value))}>
                                                        <option value={0}>0%</option>
                                                        <option value={5}>5%</option>
                                                        <option value={12}>12%</option>
                                                        <option value={18}>18%</option>
                                                        <option value={28}>28%</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.9rem', color: 'var(--primary-light)' }}>
                                                Sub-total: ₹{product.subTotal.toFixed(2)}
                                            </div>
                                        </div>
                                    ))}
                                    
                                    <button type="button" onClick={addProduct} className="btn" style={{ border: '1px dashed var(--primary-light)', color: 'var(--primary-light)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1rem' }}>
                                        <Plus size={18} /> Add Another Product
                                    </button>

                                    <div style={{ background: 'var(--surface-raised)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                                            <span>Sub-total for Products</span>
                                            <span>₹{formData.amount.toFixed(2)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.25rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--surface-border)' }}>
                                            <span>Total Order Value</span>
                                            <span style={{ color: 'var(--primary-light)' }}>₹{formData.amount.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* PAYMENT METHOD */}
                            <section>
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>Payment Method</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '1rem' }}>Select the payment mode, chosen by the buyer</p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface-raised)', padding: '1rem', borderRadius: '8px', border: formData.paymentMethod === 'Cash on Delivery' ? '2px solid var(--primary-light)' : '1px solid var(--surface-border)', cursor: 'pointer' }}>
                                        <input type="radio" name="paymentMethod" checked={formData.paymentMethod === 'Cash on Delivery'} onChange={() => setFormData({ ...formData, paymentMethod: 'Cash on Delivery', paymentStatus: 'Unpaid' })} style={{ accentColor: 'var(--primary-light)' }} />
                                        Cash on Delivery
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface-raised)', padding: '1rem', borderRadius: '8px', border: formData.paymentMethod === 'Prepaid' ? '2px solid var(--primary-light)' : '1px solid var(--surface-border)', cursor: 'pointer' }}>
                                        <input type="radio" name="paymentMethod" checked={formData.paymentMethod === 'Prepaid'} onChange={() => setFormData({ ...formData, paymentMethod: 'Prepaid' })} style={{ accentColor: 'var(--primary-light)' }} />
                                        Prepaid
                                    </label>
                                </div>
                                {formData.paymentMethod === 'Prepaid' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                                        <div>
                                            <label className="input-label">Payment Status</label>
                                            <select className="input-field" value={formData.paymentStatus} onChange={e => setFormData({ ...formData, paymentStatus: e.target.value as any })}>
                                                <option value="Unpaid">Unpaid</option>
                                                <option value="Partial">Partial</option>
                                                <option value="Paid">Paid</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="input-label">Payment Date</label>
                                            <input type="date" className="input-field" value={formData.paymentDate} onChange={e => setFormData({ ...formData, paymentDate: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="input-label">Payment Time</label>
                                            <input type="time" className="input-field" value={formData.paymentTime} onChange={e => setFormData({ ...formData, paymentTime: e.target.value })} />
                                        </div>
                                    </div>
                                )}
                            </section>

                            {/* PACKAGE DETAILS */}
                            <section>
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>Package Details</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '1rem' }}>Provide details of the final package</p>
                                
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label className="input-label">Package Dead Weight</label>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        {['0.5 kg', '1 kg', '1.5 kg', '2 kg'].map(weight => (
                                            <button key={weight} type="button" onClick={() => setFormData({ ...formData, packageWeight: weight })} style={{ padding: '0.5rem 1rem', borderRadius: '20px', background: formData.packageWeight === weight ? 'var(--primary-light)' : 'var(--surface-raised)', color: formData.packageWeight === weight ? 'white' : 'inherit', border: '1px solid var(--surface-border)', cursor: 'pointer' }}>
                                                {weight}
                                            </button>
                                        ))}
                                        <input placeholder="Other (e.g. 5 kg)" className="input-field" style={{ width: '150px', borderRadius: '20px' }} value={!['0.5 kg', '1 kg', '1.5 kg', '2 kg', ''].includes(formData.packageWeight) ? formData.packageWeight : ''} onChange={e => setFormData({ ...formData, packageWeight: e.target.value })} />
                                    </div>
                                </div>

                                <div>
                                    <label className="input-label">Package Dimension (cm)</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}>
                                        <div style={{ position: 'relative' }}>
                                            <input type="number" step="0.1" placeholder="Length" className="input-field" value={formData.packageLength} onChange={e => setFormData({ ...formData, packageLength: e.target.value })} style={{ paddingRight: '3rem' }} />
                                            <span style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }}>cm</span>
                                        </div>
                                        <div style={{ position: 'relative' }}>
                                            <input type="number" step="0.1" placeholder="Width" className="input-field" value={formData.packageWidth} onChange={e => setFormData({ ...formData, packageWidth: e.target.value })} style={{ paddingRight: '3rem' }} />
                                            <span style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }}>cm</span>
                                        </div>
                                        <div style={{ position: 'relative' }}>
                                            <input type="number" step="0.1" placeholder="Height" className="input-field" value={formData.packageHeight} onChange={e => setFormData({ ...formData, packageHeight: e.target.value })} style={{ paddingRight: '3rem' }} />
                                            <span style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }}>cm</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                                        <button type="button" onClick={() => setFormData({ ...formData, packageLength: '15', packageWidth: '15', packageHeight: '8' })} className="badge badge-secondary" style={{ cursor: 'pointer' }}>15x15x8</button>
                                        <button type="button" onClick={() => setFormData({ ...formData, packageLength: '20', packageWidth: '20', packageHeight: '10' })} className="badge badge-secondary" style={{ cursor: 'pointer' }}>20x20x10</button>
                                        <button type="button" onClick={() => setFormData({ ...formData, packageLength: '25', packageWidth: '25', packageHeight: '10' })} className="badge badge-secondary" style={{ cursor: 'pointer' }}>25x25x10</button>
                                    </div>
                                </div>
                            </section>

                            <hr style={{ borderColor: 'var(--surface-border)' }} />

                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}>
                                <div>
                                    <label className="input-label">Courier Sent?</label>
                                    <select className="input-field" value={formData.courierSent} onChange={e => setFormData({ ...formData, courierSent: e.target.value as any })}>
                                        <option value="No">No</option>
                                        <option value="Yes">Yes</option>
                                    </select>
                                </div>
                                {formData.courierSent === 'Yes' && (
                                    <div>
                                        <label className="input-label">Send Date</label>
                                        <input type="date" className="input-field" value={formData.courierSendDate} onChange={e => setFormData({ ...formData, courierSendDate: e.target.value })} />
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="input-label">Internal Remarks (Optional)</label>
                                <input className="input-field" value={formData.remarks} onChange={e => setFormData({ ...formData, remarks: e.target.value })} />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary">
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Save size={18} /> Save Order
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
