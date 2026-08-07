import { useState, useEffect, useMemo } from 'react';
import {
    getDocs, query, orderBy, limit,
    where, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import type { AuditModule, AuditAction } from '../utils/auditLog';
import {
    Shield, Search, Filter, ChevronDown, ChevronRight, RefreshCw,
    User, Clock, Layers, Activity, Info,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditEntry {
    id: string;
    timestamp: Timestamp | null;
    userId: string;
    userName: string;
    userRole: string;
    module: AuditModule;
    action: AuditAction;
    entityName: string;
    entityId?: string;
    remarks?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_MODULES: AuditModule[] = [
    'POS Billing', 'Worklist', 'Supplier Ledger', 'Inventory',
    'Manage Retailers', 'Manage Users', 'Role Matrix', 'B2B Invoice',
    'Digital Khata', 'Purchase Orders', 'Expenses', 'Online Orders',
    'Settings', 'Dispatch Board', 'Delivery Challans',
];

const ALL_ACTIONS: AuditAction[] = [
    'Create', 'Update', 'Delete', 'Record Payment', 'Link Payment',
    'Generate Invoice', 'Cancel Invoice', 'Status Change', 'Login', 'Logout',
];

const ACTION_COLORS: Record<AuditAction, { bg: string; color: string }> = {
    'Create':          { bg: 'rgba(16,185,129,0.12)',  color: '#10b981' },
    'Update':          { bg: 'rgba(14,165,233,0.12)',  color: '#0ea5e9' },
    'Delete':          { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444' },
    'Record Payment':  { bg: 'rgba(20,184,166,0.12)',  color: '#14b8a6' },
    'Link Payment':    { bg: 'rgba(99,102,241,0.12)',  color: '#6366f1' },
    'Generate Invoice':{ bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
    'Cancel Invoice':  { bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
    'Status Change':   { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b' },
    'Login':           { bg: 'rgba(167,139,250,0.12)', color: '#8b5cf6' },
    'Logout':          { bg: 'rgba(107,114,128,0.12)', color: '#6b7280' },
};

const MODULE_COLORS: Partial<Record<AuditModule, string>> = {
    'POS Billing':      '#10b981',
    'Manage Users':     '#ef4444',
    'Role Matrix':      '#f59e0b',
    'Inventory':        '#8b5cf6',
    'Supplier Ledger':  '#f97316',
    'Worklist':         '#0ea5e9',
    'Manage Retailers': '#14b8a6',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTimestamp(ts: Timestamp | null): string {
    if (!ts) return '—';
    const d = ts.toDate();
    return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    });
}

function roleLabel(role: string): string {
    return role.charAt(0).toUpperCase() + role.slice(1);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AuditLogPage() {
    const { tenantId, userRole } = useAuth();

    const [entries, setEntries]       = useState<AuditEntry[]>([]);
    const [loading, setLoading]       = useState(true);
    const [expanded, setExpanded]     = useState<Set<string>>(new Set());

    // Filters
    const [search, setSearch]         = useState('');
    const [dateFrom, setDateFrom]     = useState('');
    const [dateTo, setDateTo]         = useState('');
    const [moduleFilter, setModule]   = useState<'' | AuditModule>('');
    const [actionFilter, setAction]   = useState<'' | AuditAction>('');
    const [userFilter, setUserFilter] = useState('');

    const fetchEntries = async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            let q = query(
                getTenantCollection(db, tenantId, 'auditLogs'),
                orderBy('timestamp', 'desc'),
                limit(500),
            );
            // Server-side date range narrows the fetch for large tenants
            if (dateFrom) {
                const from = new Date(dateFrom);
                from.setHours(0, 0, 0, 0);
                q = query(q, where('timestamp', '>=', Timestamp.fromDate(from)));
            }
            if (dateTo) {
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                q = query(q, where('timestamp', '<=', Timestamp.fromDate(to)));
            }
            const snap = await getDocs(q);
            setEntries(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AuditEntry, 'id'>) })));
        } catch (err) {
            console.error('AuditLog fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchEntries(); }, [tenantId]);

    const toggleExpand = (id: string) =>
        setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

    const filtered = useMemo(() => {
        const ls = search.toLowerCase();
        return entries.filter(e => {
            if (moduleFilter && e.module !== moduleFilter) return false;
            if (actionFilter && e.action !== actionFilter) return false;
            if (userFilter && !e.userName.toLowerCase().includes(userFilter.toLowerCase())) return false;
            if (search && !(
                e.userName.toLowerCase().includes(ls) ||
                e.module.toLowerCase().includes(ls) ||
                e.action.toLowerCase().includes(ls) ||
                e.entityName.toLowerCase().includes(ls) ||
                (e.entityId || '').toLowerCase().includes(ls) ||
                (e.remarks || '').toLowerCase().includes(ls)
            )) return false;
            return true;
        });
    }, [entries, search, moduleFilter, actionFilter, userFilter]);

    if (userRole !== 'admin') {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--danger)' }}>
                <Shield size={48} style={{ margin: '0 auto 1rem', display: 'block' }} />
                <h2>Access Denied</h2>
                <p>Audit Log is restricted to administrators.</p>
            </div>
        );
    }

    const ActionBadge = ({ action }: { action: AuditAction }) => {
        const c = ACTION_COLORS[action] ?? { bg: 'var(--surface-raised)', color: 'var(--text-secondary)' };
        return (
            <span style={{ background: c.bg, color: c.color, padding: '2px 8px', borderRadius: '99px', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {action}
            </span>
        );
    };

    const ModuleBadge = ({ module }: { module: AuditModule }) => {
        const color = MODULE_COLORS[module] ?? '#94a3b8';
        return (
            <span style={{ color, fontWeight: 600, fontSize: '0.82rem' }}>{module}</span>
        );
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1300px', margin: '0 auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                        <Shield size={28} /> Audit Log
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        User activity and system changes across all ERP modules. Append-only.
                    </p>
                </div>
                <button onClick={fetchEntries} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <RefreshCw size={15} /> Refresh
                </button>
            </div>

            {/* Filters */}
            <div className="glass-panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Search */}
                <div style={{ flex: '1 1 220px', position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
                    <input
                        type="text"
                        placeholder="Search user, module, action, entity…"
                        className="input-field"
                        style={{ paddingLeft: '2rem', margin: 0, height: '36px', fontSize: '0.85rem' }}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                {/* Date From */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Clock size={14} color="var(--text-tertiary)" />
                    <input type="date" className="input-field" style={{ margin: 0, height: '36px', fontSize: '0.82rem', width: '140px' }}
                        value={dateFrom} onChange={e => { setDateFrom(e.target.value); }}
                    />
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>–</span>
                    <input type="date" className="input-field" style={{ margin: 0, height: '36px', fontSize: '0.82rem', width: '140px' }}
                        value={dateTo} onChange={e => { setDateTo(e.target.value); }}
                    />
                    {(dateFrom || dateTo) && (
                        <button onClick={() => { setDateFrom(''); setDateTo(''); fetchEntries(); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0 2px', fontSize: '0.8rem' }}>✕</button>
                    )}
                </div>

                {/* Module */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--surface-base)', padding: '0 0.65rem', borderRadius: '8px', border: `1px solid ${moduleFilter ? 'var(--primary-light)' : 'var(--surface-border)'}`, height: '36px' }}>
                    <Layers size={13} color={moduleFilter ? 'var(--primary-light)' : 'var(--text-tertiary)'} />
                    <select value={moduleFilter} onChange={e => setModule(e.target.value as '' | AuditModule)}
                        style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.83rem', color: moduleFilter ? 'var(--primary-light)' : 'var(--text-secondary)', fontWeight: moduleFilter ? 700 : 400, cursor: 'pointer' }}>
                        <option value="">All Modules</option>
                        {ALL_MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>

                {/* Action */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--surface-base)', padding: '0 0.65rem', borderRadius: '8px', border: `1px solid ${actionFilter ? 'var(--primary-light)' : 'var(--surface-border)'}`, height: '36px' }}>
                    <Activity size={13} color={actionFilter ? 'var(--primary-light)' : 'var(--text-tertiary)'} />
                    <select value={actionFilter} onChange={e => setAction(e.target.value as '' | AuditAction)}
                        style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.83rem', color: actionFilter ? 'var(--primary-light)' : 'var(--text-secondary)', fontWeight: actionFilter ? 700 : 400, cursor: 'pointer' }}>
                        <option value="">All Actions</option>
                        {ALL_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                </div>

                {/* User */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--surface-base)', padding: '0 0.65rem', borderRadius: '8px', border: `1px solid ${userFilter ? 'var(--primary-light)' : 'var(--surface-border)'}`, height: '36px' }}>
                    <User size={13} color={userFilter ? 'var(--primary-light)' : 'var(--text-tertiary)'} />
                    <input type="text" placeholder="Filter by user…"
                        value={userFilter} onChange={e => setUserFilter(e.target.value)}
                        style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.83rem', width: '120px', color: 'var(--text-primary)' }}
                    />
                </div>

                <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {filtered.length} {filtered.length !== entries.length ? `of ${entries.length} ` : ''}entries
                </span>
            </div>

            {/* Table */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                    <RefreshCw size={20} className="animate-spin" style={{ color: 'var(--primary-light)' }} /> Loading audit log…
                </div>
            ) : filtered.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                    <Shield size={48} color="var(--surface-border)" style={{ margin: '0 auto 1rem', display: 'block' }} />
                    <h3 style={{ color: 'var(--text-secondary)' }}>No entries found</h3>
                    <p style={{ color: 'var(--text-tertiary)' }}>
                        {entries.length === 0
                            ? 'Audit events will appear here once users perform actions in the ERP.'
                            : 'No entries match the current filters.'}
                    </p>
                </div>
            ) : (
                <div className="glass-panel" style={{ overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--surface-border)', background: 'var(--surface-raised)', textAlign: 'left' }}>
                                    {['Date & Time', 'User', 'Module', 'Action', 'Description'].map((h, i) => (
                                        <th key={h} style={{ padding: '0.7rem 0.75rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', textAlign: i === 4 ? 'left' : 'left' }}>{h}</th>
                                    ))}
                                    <th style={{ width: '32px' }} />
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(e => {
                                    const isOpen = expanded.has(e.id);
                                    const modColor = MODULE_COLORS[e.module] ?? '#94a3b8';
                                    return (
                                        <>
                                            <tr
                                                key={e.id}
                                                onClick={() => toggleExpand(e.id)}
                                                style={{ borderBottom: isOpen ? 'none' : '1px solid var(--surface-border)', cursor: 'pointer', transition: 'background 0.12s', background: isOpen ? 'var(--surface-raised)' : 'transparent' }}
                                                onMouseEnter={el => { el.currentTarget.style.background = 'var(--surface-raised)'; }}
                                                onMouseLeave={el => { el.currentTarget.style.background = isOpen ? 'var(--surface-raised)' : 'transparent'; }}
                                            >
                                                {/* Date & Time */}
                                                <td style={{ padding: '0.75rem', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '0.80rem' }}>
                                                    {fmtTimestamp(e.timestamp)}
                                                </td>

                                                {/* User */}
                                                <td style={{ padding: '0.75rem' }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>{e.userName}</div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '1px' }}>{roleLabel(e.userRole)}</div>
                                                </td>

                                                {/* Module */}
                                                <td style={{ padding: '0.75rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: modColor, flexShrink: 0, display: 'inline-block' }} />
                                                        <ModuleBadge module={e.module} />
                                                    </div>
                                                </td>

                                                {/* Action */}
                                                <td style={{ padding: '0.75rem' }}>
                                                    <ActionBadge action={e.action} />
                                                </td>

                                                {/* Description */}
                                                <td style={{ padding: '0.75rem', color: 'var(--text-primary)', maxWidth: '320px' }}>
                                                    <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.entityName}</div>
                                                    {e.remarks && (
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.remarks}</div>
                                                    )}
                                                </td>

                                                {/* Expand toggle */}
                                                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                                                    {isOpen
                                                        ? <ChevronDown size={15} color="var(--primary-light)" />
                                                        : <ChevronRight size={15} color="var(--text-tertiary)" />}
                                                </td>
                                            </tr>

                                            {/* Expanded detail row */}
                                            {isOpen && (
                                                <tr key={`${e.id}-detail`} style={{ borderBottom: '1px solid var(--surface-border)', background: 'var(--surface-raised)' }}>
                                                    <td colSpan={6} style={{ padding: '0.75rem 1rem 1rem 2.5rem' }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem 1.5rem' }}>
                                                            <DetailField icon={<Clock size={13} />} label="Timestamp" value={fmtTimestamp(e.timestamp)} />
                                                            <DetailField icon={<User size={13} />} label="User" value={`${e.userName} (${roleLabel(e.userRole)})`} />
                                                            <DetailField icon={<Shield size={13} />} label="User ID" value={e.userId} mono />
                                                            <DetailField icon={<Layers size={13} />} label="Module" value={e.module} />
                                                            <DetailField icon={<Activity size={13} />} label="Action" value={e.action} />
                                                            <DetailField icon={<Info size={13} />} label="Entity" value={e.entityName} />
                                                            {e.entityId && <DetailField icon={<Info size={13} />} label="Entity ID" value={e.entityId} mono />}
                                                            {e.remarks  && <DetailField icon={<Info size={13} />} label="Remarks" value={e.remarks} />}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {filtered.length >= 500 && (
                        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--surface-border)', fontSize: '0.78rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                            Showing the 500 most recent entries matching your filters. Narrow the date range to see older events.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Detail field sub-component ────────────────────────────────────────────────
function DetailField({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '2px', color: 'var(--text-tertiary)', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {icon} {label}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500, fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>
                {value || '—'}
            </div>
        </div>
    );
}
