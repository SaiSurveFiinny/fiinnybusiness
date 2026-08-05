import { useState, useEffect } from 'react';
import { query, orderBy, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { ShoppingCart, TrendingUp, ShieldAlert, ReceiptText, IndianRupee, Calendar, CreditCard, Clock, BarChart3 } from 'lucide-react';
import { getTenantCollection } from '../utils/tenantPath';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    ResponsiveContainer, ComposedChart, Bar, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';

interface SalesOrder {
    id: string;
    orderNumber: string;
    retailerName: string;
    phoneNumber?: string;
    subtotal?: number;
    grandTotal?: number;
    netAmount?: number;
    totalAmount?: number;
    amount?: number;
    paymentStatus?: string;
    modeOfPayment?: string;
    status?: string;
    invoiceType?: string;
    createdAt?: any;
    lineItems?: any[];
}

const fmtINR = (n: number) => {
    if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1).replace(/\.0$/, '')}Cr`;
    if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2).replace(/\.?0+$/, '')}L`;
    if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

interface DailyBucket { date: string; revenue: number; orders: number; }

export default function B2CDashboardPage() {
    const { userRole, tenantId } = useAuth();
    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalOrders: 0, totalRevenue: 0,
        todayRevenue: 0, todayCount: 0,
        monthRevenue: 0, monthCount: 0,
        avgOrderValue: 0,
        cashRevenue: 0, creditRevenue: 0,
        pendingCount: 0, pendingDues: 0,
    });
    const [chartData, setChartData] = useState<DailyBucket[]>([]);
    const [chartMode, setChartMode] = useState<'30d' | '7d'>('30d');

    useEffect(() => {
        if (!tenantId) return;

        const fetchData = async () => {
            try {
                const snap = await getDocs(query(
                    getTenantCollection(db, tenantId, 'salesOrders'),
                    orderBy('createdAt', 'desc'),
                    limit(500)
                ));

                const now = new Date();
                // Use local midnight for both Today and This Month so they share the same timezone baseline
                const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

                let totalOrders = 0, totalRevenue = 0;
                let todayRevenue = 0, todayCount = 0;
                let monthRevenue = 0, monthCount = 0;
                let monthCashRevenue = 0, monthCreditRevenue = 0;
                let pendingCount = 0, pendingDues = 0;
                const dailyMap = new Map<string, DailyBucket>();
                const fetchedOrders: SalesOrder[] = [];

                snap.docs.forEach(doc => {
                    const data = doc.data() as SalesOrder;
                    // POS only — skip B2B GST invoices
                    if (data.invoiceType === 'B2B_GST') return;

                    const amount = Number(data.grandTotal ?? data.netAmount ?? data.totalAmount ?? data.amount ?? 0);
                    const ts: Date = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || 0);
                    // Local-time date string for chart bucketing
                    const dateStr = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')}`;

                    fetchedOrders.push({ ...data, id: doc.id });
                    totalOrders++;
                    totalRevenue += amount;

                    if (ts >= startOfToday && ts < startOfTomorrow) { todayRevenue += amount; todayCount++; }
                    if (ts >= startOfMonth) {
                        monthRevenue += amount;
                        monthCount++;
                        const mode = (data.modeOfPayment || '').toLowerCase();
                        if (mode === 'cash') monthCashRevenue += amount;
                        else monthCreditRevenue += amount;
                    }

                    const isPending = data.status === 'pending' || data.paymentStatus === 'pending';
                    if (isPending) { pendingCount++; pendingDues += amount; }

                    // Daily bucket
                    if (!dailyMap.has(dateStr)) dailyMap.set(dateStr, { date: dateStr, revenue: 0, orders: 0 });
                    const b = dailyMap.get(dateStr)!;
                    b.revenue += amount;
                    b.orders++;
                });

                setOrders(fetchedOrders.slice(0, 15));
                setStats({
                    totalOrders, totalRevenue,
                    todayRevenue, todayCount,
                    monthRevenue, monthCount,
                    avgOrderValue: monthCount > 0 ? monthRevenue / monthCount : 0,
                    cashRevenue: monthCashRevenue, creditRevenue: monthCreditRevenue,
                    pendingCount, pendingDues,
                });

                const sorted = Array.from(dailyMap.values())
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .slice(-30);
                setChartData(sorted);
            } catch (err) {
                console.error('B2C dashboard error:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [tenantId]);

    if (userRole !== 'admin' && userRole !== 'analyst') {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--danger)' }}>
                <ShieldAlert size={48} style={{ margin: '0 auto 1rem auto' }} />
                <h2>Access Denied</h2>
                <p>Only authorized personnel can view the dashboard.</p>
                <div style={{ marginTop: '2rem' }}>
                    <Link to="/pos" className="btn btn-primary animate-pulse" style={{ textDecoration: 'none' }}>Go to POS Billing</Link>
                </div>
            </div>
        );
    }

    const visibleChart = chartMode === '7d' ? chartData.slice(-7) : chartData;

    const KpiCard = ({ label, value, sub, icon: Icon, color, border }: { label: string; value: string; sub?: string; icon: any; color: string; border: string }) => (
        <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', borderLeft: `4px solid ${border}`, background: `linear-gradient(120deg, ${color}, transparent)`, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>{label}</p>
                    <h2 style={{ margin: 0, fontSize: 'clamp(1rem, 2.2vw, 1.45rem)', fontWeight: 800, color: border, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loading ? '—' : value}</h2>
                    {sub && <p style={{ margin: '0.2rem 0 0', color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>{loading ? '' : sub}</p>}
                </div>
                <div style={{ background: `${border}22`, borderRadius: '12px', padding: '0.65rem', flexShrink: 0 }}>
                    <Icon size={20} color={border} />
                </div>
            </div>
        </div>
    );

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto' }}>

            {/* Header */}
            <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem' }}>B2C Dashboard</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Point-of-sale performance — walk-in & retail counter only.</p>
                </div>
                <Link to="/pos" className="btn btn-primary animate-pulse" style={{ textDecoration: 'none' }}>
                    <ShoppingCart size={20} /> New POS Bill
                </Link>
            </div>

            {/* KPI Grid — 6 cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                <KpiCard label="Today's Revenue" value={fmtINR(stats.todayRevenue)} sub={`${stats.todayCount} bills today`} icon={IndianRupee} color="rgba(16,185,129,0.07)" border="#10b981" />
                <KpiCard label="This Month" value={fmtINR(stats.monthRevenue)} sub={`${stats.monthCount} bills this month`} icon={Calendar} color="rgba(99,102,241,0.07)" border="#818cf8" />
                <KpiCard label="Avg Order Value" value={fmtINR(stats.avgOrderValue)} sub={`across ${stats.monthCount} bills this month`} icon={TrendingUp} color="rgba(245,158,11,0.07)" border="#f59e0b" />
                <KpiCard label="Cash Sales" value={fmtINR(stats.cashRevenue)} sub="this month · Cash" icon={IndianRupee} color="rgba(16,185,129,0.05)" border="#34d399" />
                <KpiCard label="Credit / UPI Sales" value={fmtINR(stats.creditRevenue)} sub="this month · non-cash" icon={CreditCard} color="rgba(96,165,250,0.07)" border="#60a5fa" />
                <KpiCard label="Pending / Unpaid" value={fmtINR(stats.pendingDues)} sub={`${stats.pendingCount} open invoices`} icon={Clock} color="rgba(239,68,68,0.07)" border="#f87171" />
            </div>

            {/* Chart */}
            <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <BarChart3 size={22} color="var(--primary-light)" />
                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>POS Revenue & Order Volume</h3>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {(['7d', '30d'] as const).map(m => (
                            <button key={m} onClick={() => setChartMode(m)}
                                style={{ padding: '0.3rem 0.85rem', borderRadius: '20px', border: `1px solid ${chartMode === m ? 'var(--primary-light)' : 'var(--surface-border)'}`, background: chartMode === m ? 'var(--primary-light)' : 'transparent', color: chartMode === m ? '#fff' : 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                                {m === '7d' ? 'Last 7 days' : 'Last 30 days'}
                            </button>
                        ))}
                    </div>
                </div>
                <div style={{ height: '340px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={visibleChart} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.03} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                            <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false}
                                tickFormatter={s => { const d = new Date(s); return `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`; }} />
                            <YAxis yAxisId="rev" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false}
                                tickFormatter={v => fmtINR(v)} />
                            <YAxis yAxisId="cnt" orientation="right" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false}
                                tickFormatter={v => `${v} bills`} />
                            <Tooltip
                                contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '10px', color: 'var(--text-primary)' }}
                                formatter={(value: any, name?: string) => name === 'revenue' ? [fmtINR(Number(value)), 'Revenue'] : [value, 'Bills']}
                                labelFormatter={s => { const d = new Date(s); return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); }}
                            />
                            <Legend iconType="circle" wrapperStyle={{ fontSize: '0.82rem', paddingTop: '0.5rem' }} />
                            <Bar yAxisId="rev" dataKey="revenue" name="Revenue" fill="url(#revGradient)" stroke="#10b981" strokeWidth={1.5} radius={[4, 4, 0, 0]} />
                            <Line yAxisId="cnt" dataKey="orders" name="Bills" type="monotone" stroke="#818cf8" strokeWidth={2.5} dot={{ r: 3, fill: '#818cf8' }} activeDot={{ r: 5 }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Cash vs Credit Visual Split */}
            {!loading && stats.monthRevenue > 0 && (
                <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', marginBottom: '2rem' }}>
                    <p style={{ margin: '0 0 0.6rem', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Payment Mode Split · This Month</p>
                    <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', height: '28px', gap: '2px' }}>
                        <div style={{ flex: stats.cashRevenue, background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: 700, minWidth: '2px' }}>
                            {stats.monthRevenue > 0 && Math.round(stats.cashRevenue * 100 / stats.monthRevenue) > 8 ? `Cash ${Math.round(stats.cashRevenue * 100 / stats.monthRevenue)}%` : ''}
                        </div>
                        <div style={{ flex: stats.creditRevenue, background: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: 700, minWidth: '2px' }}>
                            {stats.monthRevenue > 0 && Math.round(stats.creditRevenue * 100 / stats.monthRevenue) > 8 ? `Credit/UPI ${Math.round(stats.creditRevenue * 100 / stats.monthRevenue)}%` : ''}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                        <span>🟢 Cash: {fmtINR(stats.cashRevenue)}</span>
                        <span>🟣 Credit/UPI: {fmtINR(stats.creditRevenue)}</span>
                    </div>
                </div>
            )}

            {/* Recent POS Orders */}
            <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ReceiptText size={20} color="var(--primary-light)" /> Recent POS Orders
            </h3>
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>Loading...</div>
            ) : orders.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                    <ShoppingCart size={48} color="var(--surface-border)" style={{ marginBottom: '1rem' }} />
                    <h3 style={{ color: 'var(--text-secondary)' }}>No POS Orders</h3>
                    <p style={{ color: 'var(--text-tertiary)', marginBottom: '1.5rem' }}>No walk-in transactions yet.</p>
                    <Link to="/pos" className="btn btn-secondary animate-pulse" style={{ textDecoration: 'none' }}>Create First Bill</Link>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                    {orders.map((o) => {
                        const amt = Number(o.grandTotal ?? o.netAmount ?? o.totalAmount ?? o.amount ?? 0);
                        const isPaid = o.status === 'paid' || o.modeOfPayment === 'Cash';
                        return (
                            <div key={o.id} className="glass-panel" style={{ padding: '1rem 1.25rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                                    <div style={{ minWidth: 0 }}>
                                        <h4 style={{ margin: 0, fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{o.retailerName || 'Walk-in'}</h4>
                                        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem', margin: '2px 0 0' }}>{o.orderNumber}</p>
                                    </div>
                                    <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary-light)', whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>{fmtINR(amt)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.6rem', borderTop: '1px solid var(--surface-border)', fontSize: '0.78rem' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>{o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString('en-IN') : 'N/A'}</span>
                                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                        <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '0.72rem', fontWeight: 600, background: isPaid ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: isPaid ? '#10b981' : '#f59e0b' }}>
                                            {isPaid ? 'Paid' : 'Pending'}
                                        </span>
                                        <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '0.72rem', fontWeight: 600, background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>
                                            {o.modeOfPayment || 'N/A'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                <Link to="/order-history" style={{ color: 'var(--primary-light)', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem' }}>
                    View All Orders in History →
                </Link>
            </div>
        </div>
    );
}
