import { useState, useEffect, useCallback } from 'react';
import { Trash2, RotateCcw, Search, Filter, AlertTriangle, RefreshCw } from 'lucide-react';
import { getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import { restoreRecord, permanentDeleteRecord } from '../utils/softDelete';
import type { AuditModule } from '../utils/auditLog';

// Collections that participate in soft-delete
const SOFT_DELETE_COLLECTIONS: { name: string; label: string }[] = [
    { name: 'salesOrders',      label: 'Sales Orders' },
    { name: 'retailers',        label: 'Retailers' },
    { name: 'supplierInvoices', label: 'Supplier Invoices' },
    { name: 'purchaseOrders',   label: 'Purchase Orders' },
    { name: 'supplierPayments', label: 'Supplier Payments' },
    { name: 'products',         label: 'Products' },
];

interface DeletedRecord {
    id: string;
    collectionName: string;
    entityName: string;
    module: string;
    deletedAt: Date | null;
    deletedBy: { name: string; role: string } | null;
    deleteReason: string;
    restoreDeadline: string;
    daysRemaining: number;
    expired: boolean;
    // raw doc snapshot
    raw: Record<string, unknown>;
}

function computeDays(restoreDeadline: string): { days: number; expired: boolean } {
    if (!restoreDeadline) return { days: 0, expired: true };
    const deadline = new Date(restoreDeadline);
    const now = new Date();
    const msLeft = deadline.getTime() - now.getTime();
    const days = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
    return { days: Math.max(0, days), expired: days <= 0 };
}

function toDate(val: unknown): Date | null {
    if (!val) return null;
    if (val instanceof Timestamp) return val.toDate();
    if (val instanceof Date) return val;
    return null;
}

function moduleFromRecord(r: Record<string, unknown>): string {
    if (r.deletedModule) return String(r.deletedModule);
    if (r.invoiceType === 'B2B_GST') return 'B2B Invoice';
    if (r.invoiceType) return 'POS Billing';
    return '—';
}

function entityNameFromRecord(r: Record<string, unknown>): string {
    if (r.deletedEntityName) return String(r.deletedEntityName);
    return String(r.orderNumber ?? r.name ?? r.poNumber ?? r.id ?? '—');
}

const MODULES_ALL = 'All Modules';

export default function RecentlyDeletedPage() {
    const { tenantId, currentUser, userName, userRole, userRole: role } = useAuth();
    const isAdmin = role === 'owner' || role === 'admin';

    const [records, setRecords] = useState<DeletedRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [moduleFilter, setModuleFilter] = useState(MODULES_ALL);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [confirmPermanent, setConfirmPermanent] = useState<DeletedRecord | null>(null);

    const load = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            const all: DeletedRecord[] = [];
            await Promise.all(
                SOFT_DELETE_COLLECTIONS.map(async ({ name }) => {
                    const snap = await getDocs(
                        query(getTenantCollection(db, tenantId, name), where('deleted', '==', true))
                    );
                    snap.docs.forEach(d => {
                        const r = { id: d.id, ...d.data() } as Record<string, unknown>;
                        const { days, expired } = computeDays(String(r.restoreDeadline ?? ''));
                        all.push({
                            id: d.id,
                            collectionName: name,
                            entityName: entityNameFromRecord(r),
                            module: moduleFromRecord(r),
                            deletedAt: toDate(r.deletedAt),
                            deletedBy: r.deletedBy as DeletedRecord['deletedBy'] ?? null,
                            deleteReason: String(r.deleteReason ?? ''),
                            restoreDeadline: String(r.restoreDeadline ?? ''),
                            daysRemaining: days,
                            expired,
                            raw: r,
                        });
                    });
                })
            );
            all.sort((a, b) => {
                if (!a.deletedAt) return 1;
                if (!b.deletedAt) return -1;
                return b.deletedAt.getTime() - a.deletedAt.getTime();
            });
            setRecords(all);
        } catch (e) {
            console.error('RecentlyDeleted load error:', e);
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => { load(); }, [load]);

    const handleRestore = async (rec: DeletedRecord) => {
        if (!tenantId) return;
        setActionLoading(rec.id);
        try {
            await restoreRecord({
                db, tenantId,
                collectionName: rec.collectionName,
                docId: rec.id,
                userId: currentUser?.uid || '',
                userName: userName || currentUser?.email || 'Unknown',
                userRole: userRole || 'unknown',
                module: rec.module as AuditModule,
                entityName: rec.entityName,
            });
            setRecords(prev => prev.filter(r => r.id !== rec.id));
        } catch (e) {
            console.error('Restore failed:', e);
            alert('Failed to restore. Please try again.');
        } finally {
            setActionLoading(null);
        }
    };

    const handlePermanentDelete = async (rec: DeletedRecord) => {
        if (!tenantId) return;
        setActionLoading(rec.id);
        setConfirmPermanent(null);
        try {
            await permanentDeleteRecord({
                db, tenantId,
                collectionName: rec.collectionName,
                docId: rec.id,
                userId: currentUser?.uid || '',
                userName: userName || currentUser?.email || 'Unknown',
                userRole: userRole || 'unknown',
                module: rec.module as AuditModule,
                entityName: rec.entityName,
            });
            setRecords(prev => prev.filter(r => r.id !== rec.id));
        } catch (e) {
            console.error('Permanent delete failed:', e);
            alert('Failed to permanently delete. Please try again.');
        } finally {
            setActionLoading(null);
        }
    };

    const allModules = [MODULES_ALL, ...Array.from(new Set(records.map(r => r.module))).sort()];
    const filtered = records.filter(r => {
        const matchesModule = moduleFilter === MODULES_ALL || r.module === moduleFilter;
        const q = searchTerm.toLowerCase();
        const matchesSearch = !q ||
            r.entityName.toLowerCase().includes(q) ||
            (r.deletedBy?.name ?? '').toLowerCase().includes(q) ||
            r.module.toLowerCase().includes(q) ||
            r.deleteReason.toLowerCase().includes(q);
        return matchesModule && matchesSearch;
    });

    const fmtDate = (d: Date | null) => d
        ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';

    return (
        <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <Trash2 size={20} color="var(--danger, #ef4444)" /> Recently Deleted
                    </h2>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        Records are permanently removed after 30 days. Restore or permanently delete below.
                    </p>
                </div>
                <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'transparent', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    <input
                        placeholder="Search by name, deleted by, reason…"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ width: '100%', paddingLeft: '32px', padding: '0.55rem 0.75rem 0.55rem 32px', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-primary)', fontSize: '0.875rem', fontFamily: 'inherit', boxSizing: 'border-box' }}
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Filter size={14} style={{ color: 'var(--text-tertiary)' }} />
                    <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}
                        style={{ padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-primary)', fontSize: '0.875rem', fontFamily: 'inherit', cursor: 'pointer' }}>
                        {allModules.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading deleted records…</div>
            ) : filtered.length === 0 ? (
                <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <Trash2 size={32} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
                    <div style={{ fontWeight: 600 }}>No deleted records</div>
                    <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                        {searchTerm || moduleFilter !== MODULES_ALL ? 'No records match your filters.' : 'Nothing has been soft-deleted yet.'}
                    </div>
                </div>
            ) : (
                <div className="glass-panel" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                                {['Module', 'Name / ID', 'Deleted By', 'Date Deleted', 'Reason', 'Days Remaining', 'Actions'].map(h => (
                                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(rec => (
                                <tr key={`${rec.collectionName}-${rec.id}`} style={{ borderBottom: '1px solid var(--surface-border)', opacity: rec.expired ? 0.6 : 1 }}>
                                    <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                                        <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'hsla(220,80%,60%,0.1)', color: 'var(--primary-light)', fontSize: '0.78rem', fontWeight: 600 }}>{rec.module}</span>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.entityName}</td>
                                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                        <div>{rec.deletedBy?.name ?? '—'}</div>
                                        {rec.deletedBy?.role && <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{rec.deletedBy.role}</div>}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{fmtDate(rec.deletedAt)}</td>
                                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.deleteReason || '—'}</td>
                                    <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                                        {rec.expired ? (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--danger, #ef4444)', fontSize: '0.8rem', fontWeight: 600 }}>
                                                <AlertTriangle size={13} /> Expired
                                            </span>
                                        ) : (
                                            <span style={{ color: rec.daysRemaining <= 5 ? 'var(--danger, #ef4444)' : rec.daysRemaining <= 10 ? '#f59e0b' : 'var(--text-secondary)', fontWeight: rec.daysRemaining <= 5 ? 700 : 400, fontSize: '0.875rem' }}>
                                                {rec.daysRemaining}d
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            {/* Restore */}
                                            <button
                                                onClick={() => handleRestore(rec)}
                                                disabled={!!actionLoading || rec.expired}
                                                title={rec.expired ? 'Restore deadline has passed' : 'Restore this record'}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.75rem', borderRadius: '6px', border: '1px solid var(--surface-border)', background: rec.expired ? 'transparent' : 'hsla(142,70%,45%,0.1)', color: rec.expired ? 'var(--text-tertiary)' : '#16a34a', cursor: rec.expired || !!actionLoading ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit', opacity: actionLoading === rec.id ? 0.5 : 1 }}>
                                                <RotateCcw size={13} /> Restore
                                            </button>

                                            {/* Permanent Delete — admin only */}
                                            {isAdmin && (
                                                <button
                                                    onClick={() => setConfirmPermanent(rec)}
                                                    disabled={!!actionLoading}
                                                    title="Permanently delete (cannot be undone)"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.75rem', borderRadius: '6px', border: '1px solid hsla(0,84%,60%,0.3)', background: 'hsla(0,84%,60%,0.08)', color: 'var(--danger, #ef4444)', cursor: !!actionLoading ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit', opacity: actionLoading === rec.id ? 0.5 : 1 }}>
                                                    <Trash2 size={13} /> Delete
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--surface-border)', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                        {filtered.length} record{filtered.length !== 1 ? 's' : ''}{records.length !== filtered.length ? ` (${records.length} total)` : ''}
                    </div>
                </div>
            )}

            {/* Permanent Delete confirmation modal */}
            {confirmPermanent && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setConfirmPermanent(null)}>
                    <div className="glass-panel" style={{ padding: '2rem', maxWidth: '440px', width: '90%', borderRadius: '16px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <AlertTriangle size={22} color="var(--danger, #ef4444)" />
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Permanently Delete?</h3>
                        </div>
                        <p style={{ margin: '0 0 0.5rem', color: 'var(--text-secondary)', fontSize: '0.925rem' }}>
                            <strong>{confirmPermanent.entityName}</strong> will be permanently removed from the system.
                        </p>
                        <p style={{ margin: '0 0 1.5rem', color: 'var(--danger, #ef4444)', fontSize: '0.875rem', fontWeight: 600 }}>
                            This action cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setConfirmPermanent(null)} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Cancel</button>
                            <button onClick={() => handlePermanentDelete(confirmPermanent)} style={{ padding: '0.6rem 1.4rem', borderRadius: '8px', border: 'none', background: 'var(--danger, #ef4444)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 700 }}>Delete Forever</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
