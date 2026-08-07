import { useState, useEffect } from 'react';
import { query, orderBy, getDocs, limit, where, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Users, UserPlus, TrendingUp, ShieldAlert, BarChart3, CheckCircle, XCircle, FileText, Bot, Calculator, ReceiptText, Package, Activity, Settings2, X, Truck, Bell, ClipboardList, ShoppingCart, Layers, Store, History, Link2, IndianRupee, Calendar, TrendingDown, Target, ArrowRight } from 'lucide-react';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import SalesChart from '../components/SalesChart';

interface Retailer {
    id: string;
    name: string;
    location: string;
    number: string;
    portfolioSize: string;
    createdAt: any;
}

// All available quick actions matching every page in the nav sidebar
const ALL_QUICK_ACTIONS = [
    { id: 'pos',              label: 'POS Billing',        path: '/pos',                color: 'var(--primary-light)', icon: 'Calculator',    roles: ['admin', 'analyst'] },
    { id: 'worklist',         label: 'Digital Khata',      path: '/digital-khata',       color: 'var(--secondary)',     icon: 'ReceiptText',   roles: ['admin', 'analyst'] },
    { id: 'inventory',        label: 'Inventory',          path: '/inventory-batches',   color: '#8b5cf6',              icon: 'Package',       roles: ['admin', 'analyst'] },
    { id: 'analytics',        label: 'Analytics',          path: '/analytics',           color: '#06b6d4',              icon: 'BarChart3',     roles: ['admin', 'analyst'] },
    { id: 'dispatch',         label: 'Dispatch Board',     path: '/dispatch',            color: '#f97316',              icon: 'Truck',         roles: ['admin', 'analyst'] },
    { id: 'b2b',              label: 'B2B Invoice',        path: '/b2b-invoice',         color: '#f59e0b',              icon: 'FileText',      roles: ['admin', 'analyst'] },
    { id: 'quotations',       label: 'Quotations',         path: '/quotations',          color: '#0ea5e9',              icon: 'ClipboardList', roles: ['admin', 'analyst'] },
    { id: 'payment-remind',   label: 'Payment Reminders',  path: '/payment-reminders',   color: '#ef4444',              icon: 'Bell',          roles: ['admin', 'analyst'] },
    { id: 'purchase-orders',  label: 'Purchase Orders',    path: '/purchase-orders',     color: '#84cc16',              icon: 'ShoppingCart',  roles: ['admin', 'analyst'] },
    { id: 'delivery-challans',label: 'Delivery Challans',  path: '/delivery-challans',   color: '#14b8a6',              icon: 'Layers',        roles: ['admin', 'analyst'] },
    { id: 'gst-reports',      label: 'GST Reports',        path: '/gst-reports',         color: '#a855f7',              icon: 'FileText2',     roles: ['admin', 'analyst'] },
    { id: 'financial-reports',label: 'Financial Reports',  path: '/financial-reports',   color: '#ec4899',              icon: 'TrendingUp',    roles: ['admin', 'analyst'] },
    { id: 'warehouses',       label: 'Warehouses',         path: '/warehouses',          color: '#78716c',              icon: 'Store',         roles: ['admin', 'analyst'] },
    { id: 'barcode',          label: 'Barcode Labels',     path: '/barcode',             color: '#64748b',              icon: 'Scan',          roles: ['admin', 'analyst'] },
    { id: 'order-history',    label: 'Order History',      path: '/order-history',       color: '#6366f1',              icon: 'History',       roles: ['admin', 'analyst'] },
    { id: 'online-orders',    label: 'Online Orders',      path: '/online-orders',       color: '#10b981',              icon: 'ShoppingCart',  roles: ['admin', 'analyst'] },
    { id: 'b2c-dashboard',    label: 'B2C Dashboard',      path: '/b2c-dashboard',       color: '#f43f5e',              icon: 'BarChart3',     roles: ['admin', 'analyst'] },
    { id: 'online-dashboard', label: 'Online Dashboard',   path: '/online-dashboard',    color: '#22d3ee',              icon: 'Activity',      roles: ['admin', 'analyst'] },
    { id: 'ai',               label: 'AI Advisor',         path: '/ai-advisor',          color: '#a78bfa',              icon: 'Bot',           roles: ['admin'] },
    { id: 'onboarding',       label: 'New Retailer',       path: '/onboarding',          color: 'var(--primary)',       icon: 'UserPlus',      roles: ['admin'] },
    { id: 'manufacturers',    label: 'Manufacturers',      path: '/admin/manufacturers', color: '#fb923c',              icon: 'Factory',       roles: ['admin'] },
    { id: 'payment-links',    label: 'Payment Links',      path: '/payment-links',       color: '#38bdf8',              icon: 'Link2',         roles: ['admin'] },
];

function getIconComponent(icon: string, size = 36, color = 'inherit') {
    switch (icon) {
        case 'Calculator':    return <Calculator size={size} color={color} />;
        case 'ReceiptText':   return <ReceiptText size={size} color={color} />;
        case 'Package':       return <Package size={size} color={color} />;
        case 'Bot':           return <Bot size={size} color={color} />;
        case 'BarChart3':     return <BarChart3 size={size} color={color} />;
        case 'UserPlus':      return <UserPlus size={size} color={color} />;
        case 'FileText':      return <FileText size={size} color={color} />;
        case 'FileText2':     return <FileText size={size} color={color} />;
        case 'Truck':         return <Truck size={size} color={color} />;
        case 'Bell':          return <Bell size={size} color={color} />;
        case 'ClipboardList': return <ClipboardList size={size} color={color} />;
        case 'ShoppingCart':  return <ShoppingCart size={size} color={color} />;
        case 'Layers':        return <Layers size={size} color={color} />;
        case 'TrendingUp':    return <TrendingUp size={size} color={color} />;
        case 'Store':         return <Store size={size} color={color} />;
        case 'History':       return <History size={size} color={color} />;
        case 'Link2':         return <Link2 size={size} color={color} />;
        default:              return <Activity size={size} color={color} />;
    }
}

export default function DashboardPage() {
    const { currentUser, userRole, tenantId, userName } = useAuth();
    const { t } = useTranslation();
    const [retailers, setRetailers] = useState<Retailer[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ total: 0, big: 0, medium: 0, small: 0, totalRevenue: 0, outstandingKhata: 0 });
    const [salesKpi, setSalesKpi] = useState({ today: 0, thisMonth: 0, todayCount: 0, monthCount: 0, pendingDues: 0, pendingCount: 0 });
    const [chartData, setChartData] = useState<{ date: string; amount: number }[]>([]);
    const [pendingPOs, setPendingPOs] = useState<any[]>([]);
    const [showCustomize, setShowCustomize] = useState(false);
    const [hasProducts, setHasProducts] = useState(false);
    const { showToast } = useToast();

    // Load saved action preferences per user
    const storageKey = `quickActions_${currentUser?.uid || 'default'}`;
    const availableActions = ALL_QUICK_ACTIONS.filter(a => a.roles.includes(userRole || ''));
    const defaultVisibleIds = availableActions.slice(0, 5).map(a => a.id);

    const [visibleActionIds, setVisibleActionIds] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem(storageKey);
            return saved ? JSON.parse(saved) : defaultVisibleIds;
        } catch { return defaultVisibleIds; }
    });

    const visibleActions = availableActions.filter(a => visibleActionIds.includes(a.id));

    const toggleAction = (id: string) => {
        setVisibleActionIds(prev => {
            const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
            localStorage.setItem(storageKey, JSON.stringify(next));
            return next;
        });
    };

    useEffect(() => {
        if (!tenantId) return;

        const fetchDashboardData = async () => {
            try {
                const retailersQ = query(getTenantCollection(db, tenantId, 'retailers'), orderBy('createdAt', 'desc'));
                const retailersSnapshot = await getDocs(retailersQ);

                let total = 0, big = 0, medium = 0, small = 0;
                let outstandingKhata = 0;
                const fetchedRetailers: Retailer[] = [];

                retailersSnapshot.docs.forEach(doc => {
                    const data = doc.data() as Omit<Retailer, 'id'>;
                    fetchedRetailers.push({ id: doc.id, ...data });
                    total++;
                    if (data.portfolioSize === 'Big') big++;
                    else if (data.portfolioSize === 'Medium') medium++;
                    else small++;
                    outstandingKhata += Math.max(0, Number((data as any).totalSales ?? 0) - Number((data as any).totalPaid ?? 0));
                });

                let totalRevenue = 0;
                let todaySales = 0, todayCount = 0;
                let monthSales = 0, monthCount = 0;
                let pendingDues = 0, pendingCount = 0;
                const dailyData: Record<string, number> = {};

                const now = new Date();
                const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

                // Read from salesOrders — contains both POS bills and B2B GST invoices
                const salesQ = query(
                    getTenantCollection(db, tenantId, 'salesOrders'),
                    orderBy('createdAt', 'desc'),
                    limit(300)
                );
                const salesSnap = await getDocs(salesQ);
                salesSnap.forEach(doc => {
                    const data = doc.data();
                    const amount = Number(data.grandTotal ?? data.netAmount ?? (data as any).totalAmount ?? data.amount ?? 0);
                    totalRevenue += amount;

                    const ts: Date = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || 0);
                    const dateStr = ts.toISOString().split('T')[0];
                    dailyData[dateStr] = (dailyData[dateStr] || 0) + amount;

                    if (ts >= startOfToday) { todaySales += amount; todayCount++; }
                    if (ts >= startOfMonth) { monthSales += amount; monthCount++; }

                    const isPending = data.status === 'pending' || (data as any).paymentStatus === 'pending';
                    if (isPending) { pendingDues += amount; pendingCount++; }
                });

                setSalesKpi({ today: todaySales, thisMonth: monthSales, todayCount, monthCount, pendingDues, pendingCount });

                const formattedChartData = Object.entries(dailyData).map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);

                const pos: any[] = [];
                if (userRole === 'admin') {
                    try {
                        const poQ = query(
                            getTenantCollection(db, tenantId, 'purchaseOrders'),
                            where('status', '==', 'pending_approval'),
                            orderBy('createdAt', 'desc'),
                            limit(5)
                        );
                        const poSnapshot = await getDocs(poQ);
                        poSnapshot.forEach(doc => pos.push({ id: doc.id, ...doc.data() }));
                    } catch (e) {
                        console.error('Error fetching POs', e);
                    }
                }

                setRetailers(fetchedRetailers.slice(0, 15));
                setStats({ total, big, medium, small, totalRevenue, outstandingKhata });
                setChartData(formattedChartData);
                setPendingPOs(pos);

                // Fetch product count for checklist
                const productsSnap = await getDocs(query(getTenantCollection(db, tenantId, 'products'), limit(1)));
                setHasProducts(!productsSnap.empty);
            } catch (err) {
                console.error("Error fetching dashboard data: ", err);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, [userRole, tenantId]);

    if (userRole !== 'admin' && userRole !== 'analyst') {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--danger)' }}>
                <ShieldAlert size={48} style={{ margin: '0 auto 1rem auto' }} />
                <h2>{t('dashboard.access_denied')}</h2>
                <p>{t('dashboard.admin_only')}</p>
                <div style={{ marginTop: '2rem' }}>
                    <Link to="/worklist" className="btn btn-primary animate-pulse" style={{ textDecoration: 'none' }}>{t('dashboard.go_to_worklist')}</Link>
                </div>
            </div>
        );
    }

    const handleApprovePO = async (poId: string, isApproved: boolean) => {
        if (!tenantId) return;
        try {
            await updateDoc(getTenantDoc(db, tenantId, 'purchaseOrders', poId), {
                status: isApproved ? 'approved' : 'rejected',
                updatedAt: new Date()
            });
            setPendingPOs(prev => prev.filter(po => po.id !== poId));
            showToast(`Purchase Order ${isApproved ? 'Approved' : 'Rejected'}`, 'success');
        } catch (e) {
            console.error(e);
            showToast('Failed to update PO', 'error');
        }
    };

    /** Compact Indian number formatter: ₹999 / ₹19K / ₹8.54L / ₹1.2Cr */
    const fmtINR = (n: number): string => {
        if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1).replace(/\.0$/, '')}Cr`;
        if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2).replace(/\.?0+$/, '')}L`;
        if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
        return `₹${Math.round(n).toLocaleString('en-IN')}`;
    };

    const displayName = userName ? userName.split(' ')[0] : (currentUser?.displayName ? currentUser.displayName.split(' ')[0] : 'there');

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem' }}>
                        Welcome back, {displayName}! 👋
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
                        {userRole === 'admin' ? 'Ready for business?' : 'Here\'s your daily overview.'}
                    </p>
                </div>
                {userRole === 'admin' && (
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button
                            onClick={() => {
                                import('../utils/seedData').then(m => {
                                    if (tenantId) m.seedDemoData(tenantId);
                                });
                                alert("Seeding started. Please refresh after a few seconds.");
                            }}
                            className="btn btn-secondary"
                        >
                            Seed Demo Data
                        </button>
                        <Link to="/onboarding" className="btn btn-primary animate-pulse" style={{ textDecoration: 'none' }}>
                            <UserPlus size={20} /> {t('dashboard.new_retailer')}
                        </Link>
                    </div>
                )}
            </div>

            {/* Day 1 Mastery Checklist - Shown if no sales yet (Success Path for Kirana Owners) */}
            {stats.totalRevenue === 0 && (
                <div style={{ marginBottom: '4rem' }}>
                    <div className="glass-panel pulse-glow" style={{ padding: '2.5rem', border: '1px solid var(--primary-light)', background: 'linear-gradient(135deg, hsla(152, 60%, 40%, 0.05), transparent)' }}>
                        <div style={{ marginBottom: '2rem' }}>
                            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.75rem', marginBottom: '0.5rem' }}>
                                <Target size={32} color="var(--primary-light)" className="pulse-success" />
                                Day 1 Mastery Checklist
                            </h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Your path to becoming a Digital Retailer. Complete these 4 steps.</p>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <Link to="/inventory-batches" className={`checklist-item ${hasProducts ? 'done' : ''}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: hasProducts ? 'var(--primary)' : 'var(--surface-raised)', border: hasProducts ? 'none' : '2px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: hasProducts ? 'white' : 'var(--text-tertiary)', fontWeight: 800 }}>
                                    {hasProducts ? <CheckCircle size={20} /> : 1}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ margin: 0, fontSize: '1.1rem' }}>Add your first Stock</h4>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-tertiary)' }}>{hasProducts ? 'Success! Inventory is ready.' : 'Add at least 5 products to start billing.'}</p>
                                </div>
                                <ArrowRight size={20} color="var(--text-tertiary)" />
                            </Link>

                            <Link to="/pos" className="checklist-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--surface-raised)', border: '2px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontWeight: 800 }}>2</div>
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ margin: 0, fontSize: '1.1rem' }}>Generate your first POS Bill</h4>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-tertiary)' }}>Experience the 3-second billing speed.</p>
                                </div>
                                <ArrowRight size={20} color="var(--text-tertiary)" />
                            </Link>

                            <Link to="/digital-khata" className="checklist-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--surface-raised)', border: '2px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontWeight: 800 }}>3</div>
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ margin: 0, fontSize: '1.1rem' }}>Set up Digital Khata (Udhaar)</h4>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-tertiary)' }}>Add a customer and record their first transaction.</p>
                                </div>
                                <ArrowRight size={20} color="var(--text-tertiary)" />
                            </Link>

                            <Link to="/invoice-settings" className="checklist-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--surface-raised)', border: '2px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontWeight: 800 }}>4</div>
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ margin: 0, fontSize: '1.1rem' }}>Connect Hardware</h4>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-tertiary)' }}>Set up your Thermal Printer and GST preferences.</p>
                                </div>
                                <ArrowRight size={20} color="var(--text-tertiary)" />
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Actions Grid */}
            <div style={{ marginBottom: '3rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', margin: 0 }}>
                        <Activity size={24} color="var(--primary-light)" /> Quick Actions
                    </h3>
                    <button
                        onClick={() => setShowCustomize(v => !v)}
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                    >
                        <Settings2 size={15} /> Customize
                    </button>
                </div>

                {/* Customize Panel */}
                {showCustomize && (
                    <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1rem', border: '1px solid var(--primary)', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>Toggle visible actions</p>
                            <button onClick={() => setShowCustomize(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <X size={18} />
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                            {availableActions.map(action => {
                                const isOn = visibleActionIds.includes(action.id);
                                return (
                                    <button
                                        key={action.id}
                                        onClick={() => toggleAction(action.id)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                            padding: '0.45rem 1rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                                            border: `2px solid ${isOn ? action.color : 'var(--surface-border)'}`,
                                            background: isOn ? `${action.color}22` : 'transparent',
                                            color: isOn ? action.color : 'var(--text-secondary)',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {getIconComponent(action.icon, 14, isOn ? action.color : 'var(--text-secondary)')}
                                        {action.label}
                                        {isOn ? <CheckCircle size={14} /> : <XCircle size={14} />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                    {visibleActions.map(action => (
                        <Link
                            key={action.id}
                            to={action.path}
                            className="glass-panel"
                            style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', gap: '0.75rem', color: 'var(--text-primary)', transition: 'transform 0.2s', cursor: 'pointer' }}
                            onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
                            onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            {getIconComponent(action.icon, 36, action.color)}
                            <span style={{ fontWeight: 600, fontSize: '0.9rem', textAlign: 'center' }}>{action.label}</span>
                        </Link>
                    ))}
                    {visibleActions.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-tertiary)', padding: '2rem' }}>
                            No actions selected. Click <strong>Customize</strong> to add some.
                        </div>
                    )}
                </div>
            </div>

            {/* ⚡ Sales KPI Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>

                {/* Today's Sales */}
                <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', borderLeft: '4px solid #10b981', background: 'linear-gradient(120deg, rgba(16,185,129,0.08), transparent)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>Today's Sales</p>
                            <h2 style={{ margin: 0, fontSize: 'clamp(1.1rem, 2.5vw, 1.55rem)', fontWeight: 800, color: '#10b981', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmtINR(salesKpi.today)}</h2>
                            <p style={{ margin: '0.2rem 0 0', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>{salesKpi.todayCount} invoice{salesKpi.todayCount !== 1 ? 's' : ''} today</p>
                        </div>
                        <div style={{ background: 'rgba(16,185,129,0.15)', borderRadius: '12px', padding: '0.65rem', flexShrink: 0 }}>
                            <IndianRupee size={20} color="#10b981" />
                        </div>
                    </div>
                </div>

                {/* This Month's Sales */}
                <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', borderLeft: '4px solid #6366f1', background: 'linear-gradient(120deg, rgba(99,102,241,0.08), transparent)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>This Month's Sales</p>
                            <h2 style={{ margin: 0, fontSize: 'clamp(1.1rem, 2.5vw, 1.55rem)', fontWeight: 800, color: '#818cf8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmtINR(salesKpi.thisMonth)}</h2>
                            <p style={{ margin: '0.2rem 0 0', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>{salesKpi.monthCount} invoices this month</p>
                        </div>
                        <div style={{ background: 'rgba(99,102,241,0.15)', borderRadius: '12px', padding: '0.65rem', flexShrink: 0 }}>
                            <Calendar size={20} color="#818cf8" />
                        </div>
                    </div>
                </div>

                {/* Pending Dues */}
                <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', borderLeft: '4px solid #f59e0b', background: 'linear-gradient(120deg, rgba(245,158,11,0.08), transparent)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>Pending Dues</p>
                            <h2 style={{ margin: 0, fontSize: 'clamp(1.1rem, 2.5vw, 1.55rem)', fontWeight: 800, color: '#f59e0b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmtINR(salesKpi.pendingDues)}</h2>
                            <p style={{ margin: '0.2rem 0 0', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>{salesKpi.pendingCount} unpaid invoices</p>
                        </div>
                        <div style={{ background: 'rgba(245,158,11,0.15)', borderRadius: '12px', padding: '0.65rem', flexShrink: 0 }}>
                            <TrendingDown size={20} color="#f59e0b" />
                        </div>
                    </div>
                </div>

                {/* Gross Revenue (all time) */}
                <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', borderLeft: '4px solid #0ea5e9', background: 'linear-gradient(120deg, rgba(14,165,233,0.08), transparent)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>Gross Business Value</p>
                            <h2 style={{ margin: 0, fontSize: 'clamp(1.1rem, 2.5vw, 1.55rem)', fontWeight: 800, color: '#38bdf8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmtINR(stats.totalRevenue)}</h2>
                            <p style={{ margin: '0.2rem 0 0', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>All-time total sales</p>
                        </div>
                        <div style={{ background: 'rgba(14,165,233,0.15)', borderRadius: '12px', padding: '0.65rem', flexShrink: 0 }}>
                            <TrendingUp size={20} color="#38bdf8" />
                        </div>
                    </div>
                </div>

            </div>

            {/* Retailer Stats Overview */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '3rem' }}>
                <div className="glass-panel animate-fade-in delay-100" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', animationFillMode: 'forwards' }}>
                    <div style={{ background: 'hsla(152, 60%, 40%, 0.2)', borderRadius: '12px', padding: '1rem' }}>
                        <Users size={24} color="var(--primary-light)" />
                    </div>
                    <div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{t('dashboard.total_retailers')}</p>
                        <h2 style={{ margin: 0 }}>{loading ? '-' : stats.total}</h2>
                    </div>
                </div>

                <div className="glass-panel animate-fade-in delay-200" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', animationFillMode: 'forwards' }}>
                    <div style={{ background: 'hsla(45, 93%, 47%, 0.2)', borderRadius: '12px', padding: '1rem' }}>
                        <TrendingUp size={24} color="var(--secondary)" />
                    </div>
                    <div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{t('dashboard.big_customers')}</p>
                        <h2 style={{ margin: 0 }}>{loading ? '-' : stats.big}</h2>
                    </div>
                </div>

                {/* Admin-only financial stats */}
                {userRole === 'admin' && (
                    <>
                        <div className="glass-panel animate-fade-in delay-300" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', animationFillMode: 'forwards', borderLeft: '4px solid var(--primary)' }}>
                            <div style={{ background: 'hsla(152, 60%, 40%, 0.2)', borderRadius: '12px', padding: '1rem' }}>
                                <TrendingUp size={24} color="var(--primary-light)" />
                            </div>
                            <div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{t('dashboard.gross_revenue')}</p>
                                <h2 style={{ margin: 0, color: 'var(--primary-light)' }}>
                                    {loading ? '-' : fmtINR(stats.totalRevenue)}
                                </h2>
                            </div>
                        </div>
                        <div className="glass-panel animate-fade-in delay-400" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', animationFillMode: 'forwards', borderLeft: '4px solid var(--danger)' }}>
                            <div style={{ background: 'hsla(0, 84%, 60%, 0.2)', borderRadius: '12px', padding: '1rem' }}>
                                <ShieldAlert size={24} color="var(--danger)" />
                            </div>
                            <div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Outstanding Khata</p>
                                <h2 style={{ margin: 0, color: 'var(--danger)' }}>
                                    {loading ? '-' : fmtINR(stats.outstandingKhata)}
                                </h2>
                            </div>
                        </div>
                    </>
                )}

                {/* Analyst-only: small/medium count instead */}
                {userRole === 'analyst' && (
                    <div className="glass-panel animate-fade-in delay-300" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', animationFillMode: 'forwards' }}>
                        <div style={{ background: 'hsla(220, 10%, 75%, 0.2)', borderRadius: '12px', padding: '1rem' }}>
                            <Users size={24} color="var(--text-secondary)" />
                        </div>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{t('dashboard.small_medium')}</p>
                            <h2 style={{ margin: 0 }}>{loading ? '-' : (stats.small + stats.medium)}</h2>
                        </div>
                    </div>
                )}
            </div>

            {/* Sales Chart — admin only */}
            {userRole === 'admin' && (
                <div style={{ marginBottom: '3rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                        <BarChart3 size={24} color="var(--primary-light)" />
                        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{t('dashboard.sales_analytics')}</h2>
                    </div>
                    <SalesChart data={chartData} />
                </div>
            )}

            <h3 style={{ marginBottom: '1rem' }}>{t('dashboard.recent_onboardings')}</h3>

            {/* PO Approvals — admin only */}
            {userRole === 'admin' && pendingPOs.length > 0 && (
                <div style={{ marginBottom: '3rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                        <FileText size={24} color="var(--primary-light)" />
                        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Action Required: PO Approvals</h2>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {pendingPOs.map((po) => (
                            <div key={po.id} className="glass-panel" style={{ padding: '1.25rem', display: 'flex', justifyItems: 'center', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid var(--warning)' }}>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '1.1rem' }}>PO {po.poNumber || po.id.substring(0, 6)} <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '0.5rem' }}>for {po.supplierName || 'Unknown Supplier'}</span></h4>
                                    <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>Amount: <strong style={{ color: 'var(--text-primary)' }}>₹{Number(po.totalAmount || 0).toLocaleString()}</strong></p>
                                </div>
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button onClick={() => handleApprovePO(po.id, false)} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                                        <XCircle size={16} /> Reject
                                    </button>
                                    <button onClick={() => handleApprovePO(po.id, true)} className="btn btn-primary" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--success)', color: '#fff' }}>
                                        <CheckCircle size={16} /> Approve
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* AI Advisor promo — admin only */}
            {userRole === 'admin' && (
                <div style={{ marginBottom: '3rem' }}>
                    <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, hsla(250, 60%, 20%, 0.8), hsla(250, 60%, 15%, 0.9))', border: '1px solid hsla(250, 60%, 40%, 0.5)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                            <div style={{ background: 'hsla(250, 60%, 50%, 0.2)', padding: '1rem', borderRadius: '50%' }}>
                                <Bot size={32} color="#a78bfa" />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#fff' }}>Business AI Advisor</h3>
                                <p style={{ margin: '0.25rem 0 0 0', color: '#c4b5fd', fontSize: '0.9rem' }}>Get instant insights on inventory, fast-moving products, and cash flow.</p>
                            </div>
                        </div>
                        <Link to="/ai-advisor" className="btn btn-primary" style={{ background: '#8b5cf6', border: 'none', color: '#fff', textDecoration: 'none' }}>Ask AI</Link>
                    </div>
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
                    {t('dashboard.loading_retailers')}
                </div>
            ) : retailers.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                    <Users size={48} color="var(--surface-border)" style={{ marginBottom: '1rem' }} />
                    <h3 style={{ color: 'var(--text-secondary)' }}>{t('dashboard.no_retailers')}</h3>
                    <p style={{ color: 'var(--text-tertiary)', marginBottom: '1.5rem' }}>{t('dashboard.no_retailers_desc')}</p>
                    {userRole === 'admin' && <Link to="/onboarding" className="btn btn-secondary animate-pulse" style={{ textDecoration: 'none' }}>{t('dashboard.new_retailer')}</Link>}
                </div>
            ) : (
                <div className="dashboard-grid" style={{ marginTop: '0' }}>
                    {retailers.map((r, i) => (
                        <div key={r.id} className={`glass-panel dashboard-card animate-fade-in delay-${Math.min((i + 1) * 100, 300)}`} style={{ animationFillMode: 'forwards' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '1.125rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>{r.name}</h4>
                                    <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>{r.location}</p>
                                </div>
                                <span className={`status-badge ${r.portfolioSize === 'Big' ? 'big' : 'small'}`}>
                                    {r.portfolioSize === 'Big' ? t('dashboard.portfolio_big') : r.portfolioSize === 'Medium' ? t('dashboard.portfolio_medium') : t('dashboard.portfolio_small')}
                                </span>
                            </div>
                            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>{r.number}</span>
                                <Link to={`/worklist`} style={{ color: 'var(--primary-light)', textDecoration: 'none', fontWeight: 500 }}>{t('dashboard.view')} →</Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
