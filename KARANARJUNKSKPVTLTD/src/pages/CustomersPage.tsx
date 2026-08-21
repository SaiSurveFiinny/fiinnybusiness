import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import { Users, Search, Phone, MapPin, ArrowUpDown, UserPlus, Store, ShoppingBag } from 'lucide-react';

interface PosCustomer {
    id: string;
    name?: string;
    number?: string;
    atPost?: string;
    taluka?: string;
    district?: string;
    pin?: string;
    totalSales?: number;
    outstandingAmount?: number;
    totalPaid?: number;
    lastOrderedAt?: any;
    createdAt?: any;
    channel?: string;
}

function customerType(channel?: string): { label: string; color: string; bg: string } {
    if (channel === 'pos') return { label: 'Walk-in', color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)' };
    return { label: 'B2B Retailer', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' };
}

type SortKey = 'name' | 'totalSales' | 'outstanding' | 'lastOrder' | 'district';

const fmtINR = (n: number) => {
    if (!n) return '₹0';
    if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2).replace(/\.?0+$/, '')}L`;
    if (n >= 1_000)    return `₹${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

function fmtDate(ts: any): string {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// `fullWidth` is set when this page is embedded as a POS sub-tab, where it
// should span the full-width POS layout instead of the standalone /customers
// route's centered 1300px column. Defaults false so the standalone route is
// unchanged.
export default function CustomersPage({ fullWidth = false }: { fullWidth?: boolean } = {}) {
    const { tenantId, userRole } = useAuth();
    const navigate = useNavigate();

    const [customers, setCustomers] = useState<PosCustomer[]>([]);
    const [loading, setLoading]     = useState(true);
    const [search, setSearch]       = useState('');
    const [districtFilter, setDistrictFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'pos' | 'b2b'>('all');
    const [sortKey, setSortKey]     = useState<SortKey>('lastOrder');
    const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc');

    useEffect(() => {
        if (!tenantId) return;
        (async () => {
            try {
                const snap = await getDocs(query(
                    getTenantCollection(db, tenantId, 'retailers'),
                    orderBy('createdAt', 'desc'),
                ));
                setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as PosCustomer)));
            } catch (e) {
                console.error('CustomersPage fetch error:', e);
            } finally {
                setLoading(false);
            }
        })();
    }, [tenantId]);

    const districts = useMemo(() => {
        const s = new Set(customers.map(c => c.district).filter(Boolean) as string[]);
        return [...s].sort();
    }, [customers]);

    const handleSort = (col: SortKey) => {
        setSortKey(prev => {
            if (prev === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return col; }
            setSortDir(col === 'name' || col === 'district' ? 'asc' : 'desc');
            return col;
        });
    };
    const sortInd = (col: SortKey) => sortKey === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

    const thStyle = (col: SortKey, align: 'left' | 'right' = 'left'): React.CSSProperties => ({
        padding: '0.7rem 0.75rem', fontWeight: 600, fontSize: '0.72rem',
        textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
        textAlign: align, cursor: 'pointer', userSelect: 'none',
        color: sortKey === col ? 'var(--primary-light)' : 'var(--text-secondary)',
        transition: 'color 0.15s',
    });

    const filtered = useMemo(() => {
        const ls = search.toLowerCase();
        let res = customers.filter(c => {
            if (districtFilter && c.district !== districtFilter) return false;
            if (typeFilter === 'pos' && c.channel !== 'pos') return false;
            if (typeFilter === 'b2b' && c.channel === 'pos') return false;
            if (!ls) return true;
            return (
                c.name?.toLowerCase().includes(ls) ||
                c.number?.includes(search) ||
                c.atPost?.toLowerCase().includes(ls) ||
                c.taluka?.toLowerCase().includes(ls) ||
                c.district?.toLowerCase().includes(ls)
            );
        });
        const asc = sortDir === 'asc' ? 1 : -1;
        res.sort((a, b) => {
            switch (sortKey) {
                case 'name':        return asc * (a.name || '').localeCompare(b.name || '');
                case 'district':    return asc * (a.district || '').localeCompare(b.district || '');
                case 'totalSales':  return asc * ((a.totalSales ?? 0) - (b.totalSales ?? 0));
                case 'outstanding': return asc * ((a.outstandingAmount ?? 0) - (b.outstandingAmount ?? 0));
                case 'lastOrder':
                default: {
                    const tA = a.lastOrderedAt?.seconds ?? a.createdAt?.seconds ?? 0;
                    const tB = b.lastOrderedAt?.seconds ?? b.createdAt?.seconds ?? 0;
                    return asc * (tA - tB);
                }
            }
        });
        return res;
    }, [customers, search, districtFilter, sortKey, sortDir]);

    const totals = useMemo(() => ({
        sales:        customers.reduce((s, c) => s + (c.totalSales ?? 0), 0),
        outstanding:  customers.reduce((s, c) => s + (c.outstandingAmount ?? 0), 0),
        walkin:       customers.filter(c => c.channel === 'pos').length,
        b2b:          customers.filter(c => c.channel !== 'pos').length,
    }), [customers]);

    if (userRole !== 'admin' && userRole !== 'analyst') {
        return <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--danger)' }}>Access restricted.</div>;
    }

    return (
        <div className="animate-fade-in" style={{ maxWidth: fullWidth ? 'none' : '1300px', margin: '0 auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                        <Users size={28} /> Customer Profiles
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Walk-in counter customers managed through POS Billing.</p>
                </div>
                <button className="btn btn-primary" onClick={() => navigate('/pos')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <UserPlus size={16} /> New Bill
                </button>
            </div>

            {/* Summary KPI strip */}
            {!loading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    {[
                        { label: 'Total Customers', value: String(customers.length), color: '#0ea5e9', Icon: Users },
                        { label: 'Walk-in Customers', value: String(totals.walkin), color: '#0ea5e9', Icon: ShoppingBag },
                        { label: 'B2B Retailers', value: String(totals.b2b), color: '#8b5cf6', Icon: Store },
                        { label: 'Total Sales', value: fmtINR(totals.sales), color: '#10b981', Icon: Users },
                        { label: 'Outstanding', value: fmtINR(totals.outstanding), color: totals.outstanding > 0 ? '#ef4444' : '#10b981', Icon: Users },
                    ].map(k => (
                        <div key={k.label} className="glass-panel" style={{ padding: '1rem 1.25rem', borderLeft: `4px solid ${k.color}`, background: `${k.color}11` }}>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>{k.label}</p>
                            <h2 style={{ margin: 0, fontWeight: 800, fontSize: '1.45rem', color: k.color }}>{k.value}</h2>
                        </div>
                    ))}
                </div>
            )}

            {/* Filters */}
            <div className="glass-panel" style={{ padding: '0.85rem 1.25rem', marginBottom: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: '1 1 220px', position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
                    <input type="text" placeholder="Search name, phone, village, taluka, district…" className="input-field"
                        style={{ paddingLeft: '2rem', margin: 0, height: '36px', fontSize: '0.85rem' }}
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                {/* Type filter pills */}
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                    {([['all', 'All'], ['pos', 'Walk-in'], ['b2b', 'B2B']] as const).map(([v, l]) => (
                        <button key={v} onClick={() => setTypeFilter(v)}
                            style={{ padding: '0.3rem 0.75rem', borderRadius: '20px', border: `1px solid ${typeFilter === v ? 'var(--primary-light)' : 'var(--surface-border)'}`, background: typeFilter === v ? 'var(--primary-light)' : 'transparent', color: typeFilter === v ? '#fff' : 'var(--text-secondary)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                            {l}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--surface-base)', padding: '0 0.65rem', borderRadius: '8px', border: `1px solid ${districtFilter ? 'var(--primary-light)' : 'var(--surface-border)'}`, height: '36px' }}>
                    <MapPin size={13} color={districtFilter ? 'var(--primary-light)' : 'var(--text-tertiary)'} />
                    <select value={districtFilter} onChange={e => setDistrictFilter(e.target.value)}
                        style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.83rem', color: districtFilter ? 'var(--primary-light)' : 'var(--text-secondary)', fontWeight: districtFilter ? 700 : 400, cursor: 'pointer' }}>
                        <option value="">All Districts</option>
                        {districts.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--surface-base)', padding: '0 0.65rem', borderRadius: '8px', border: '1px solid var(--surface-border)', height: '36px' }}>
                    <ArrowUpDown size={13} color="var(--text-tertiary)" />
                    <select value={sortKey} onChange={e => { setSortKey(e.target.value as SortKey); setSortDir('desc'); }}
                        style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.83rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <option value="lastOrder">Last Purchase</option>
                        <option value="name">Name A–Z</option>
                        <option value="totalSales">Total Sales</option>
                        <option value="outstanding">Outstanding</option>
                        <option value="district">District</option>
                    </select>
                </div>
                <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {filtered.length}{filtered.length !== customers.length ? ` of ${customers.length}` : ''} customers
                </span>
            </div>

            {/* Table */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-tertiary)' }}>Loading customers…</div>
            ) : filtered.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                    <Users size={48} color="var(--surface-border)" style={{ margin: '0 auto 1rem', display: 'block' }} />
                    <h3 style={{ color: 'var(--text-secondary)' }}>{customers.length === 0 ? 'No customers yet' : 'No results'}</h3>
                    <p style={{ color: 'var(--text-tertiary)' }}>
                        {customers.length === 0
                            ? 'Customer records are created automatically when a POS bill is saved with a phone number.'
                            : 'No customers match the current filters.'}
                    </p>
                </div>
            ) : (
                <div className="glass-panel" style={{ overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--surface-border)', background: 'var(--surface-raised)', textAlign: 'left' }}>
                                    <th style={thStyle('name')}       onClick={() => handleSort('name')}>Customer Name{sortInd('name')}</th>
                                    <th style={{ ...thStyle('name'), cursor: 'default', color: 'var(--text-secondary)' }}>Type</th>
                                    <th style={{ ...thStyle('name'), cursor: 'default', color: 'var(--text-secondary)' }}>Phone</th>
                                    <th style={{ ...thStyle('name'), cursor: 'default', color: 'var(--text-secondary)' }}>Village</th>
                                    <th style={{ ...thStyle('name'), cursor: 'default', color: 'var(--text-secondary)' }}>Taluka</th>
                                    <th style={thStyle('district')}   onClick={() => handleSort('district')}>District{sortInd('district')}</th>
                                    <th style={thStyle('outstanding', 'right')} onClick={() => handleSort('outstanding')}>Outstanding{sortInd('outstanding')}</th>
                                    <th style={thStyle('lastOrder', 'right')}   onClick={() => handleSort('lastOrder')}>Last Purchase{sortInd('lastOrder')}</th>
                                    <th style={thStyle('totalSales', 'right')}  onClick={() => handleSort('totalSales')}>Total Sales{sortInd('totalSales')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(c => {
                                    const ct = customerType(c.channel);
                                    return (
                                    <tr key={c.id}
                                        onClick={() => navigate(`/customers/${c.id}`)}
                                        style={{ borderBottom: '1px solid var(--surface-border)', cursor: 'pointer', transition: 'background 0.12s' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-raised)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{c.name || '—'}</td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <span style={{ padding: '0.15rem 0.55rem', borderRadius: '99px', fontSize: '0.7rem', fontWeight: 700, background: ct.bg, color: ct.color, whiteSpace: 'nowrap' }}>{ct.label}</span>
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            {c.number
                                                ? <a href={`tel:${c.number}`} onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--primary-light)', textDecoration: 'none', fontSize: '0.83rem' }}><Phone size={12} />{c.number}</a>
                                                : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                                        </td>
                                        <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{c.atPost || '—'}</td>
                                        <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{c.taluka || '—'}</td>
                                        <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{c.district || '—'}</td>
                                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: (c.outstandingAmount ?? 0) > 0 ? '#ef4444' : 'var(--text-tertiary)' }}>
                                            {(c.outstandingAmount ?? 0) > 0 ? fmtINR(c.outstandingAmount!) : '—'}
                                        </td>
                                        <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{fmtDate(c.lastOrderedAt)}</td>
                                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>{fmtINR(c.totalSales ?? 0)}</td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
