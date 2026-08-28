import { useState, useEffect, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { updateDoc, deleteDoc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useFeaturePermissions } from '../hooks/useFeaturePermissions';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';
import { Truck, Plus, Pencil, Trash2, X, Phone, User, AlertTriangle, Search, ChevronDown, ChevronRight } from 'lucide-react';
import AddTransporterModal, { VEHICLE_TYPES, checkOptionalMobile } from '../components/AddTransporterModal';

interface Transporter {
    id: string;
    name: string;
    contactPerson?: string;
    mobile?: string;
    altMobile?: string;
    vehicleType?: string;
    area?: string;
    vehicleRoute?: string;
    notes?: string;
    createdAt?: any;
}

const emptyEditForm = () => ({
    name: '', contactPerson: '', mobile: '', altMobile: '',
    vehicleType: '', otherVehicleType: '', area: '', vehicleRoute: '', notes: '',
});

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.8rem', fontWeight: 600,
    color: 'var(--text-secondary)', marginBottom: '0.3rem',
};

function DetailField({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                {label}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500, wordBreak: 'break-word' }}>
                {value || '—'}
            </div>
        </div>
    );
}

function useScrollLock(active: boolean) {
    useEffect(() => {
        if (!active) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [active]);
}

export default function ManageTransportPage() {
    const { tenantId } = useAuth();
    const { showToast } = useToast();

    // Feature-permission layer (Super Admin → Feature Permissions → Inventory → Transport).
    const can = useFeaturePermissions();
    const canAddTransporter    = can('inventory.transfer.add');
    const canEditTransporter   = can('inventory.transfer.edit');
    const canDeleteTransporter = can('inventory.transfer.delete');

    const [transporters, setTransporters] = useState<Transporter[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const toggleExpand = (id: string) => setExpandedId(prev => (prev === id ? null : id));

    // Add modal — delegated to AddTransporterModal (portal + scroll lock built-in)
    const [addOpen, setAddOpen] = useState(false);

    // Edit modal state
    const [editing, setEditing] = useState<Transporter | null>(null);
    const [editForm, setEditForm] = useState(emptyEditForm());
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    // Delete modal state
    const [deleteTarget, setDeleteTarget] = useState<Transporter | null>(null);
    const [deleting, setDeleting] = useState(false);

    const anyModalOpen = !!editing || !!deleteTarget;
    useScrollLock(anyModalOpen);

    useEffect(() => {
        if (!tenantId) return;
        const q = query(getTenantCollection(db, tenantId, 'transporters'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, snap => {
            // `name` coerced at the boundary — the search filter calls
            // .toLowerCase() on it, and a doc missing it crashes the page.
            setTransporters(snap.docs.map(d => {
                const raw = d.data();
                return { id: d.id, ...raw, name: String(raw.name ?? '') } as Transporter;
            }));
            setLoading(false);
        }, err => { console.error('Transporter fetch error:', err); setLoading(false); });
        return () => unsub();
    }, [tenantId]);

    const openEdit = (t: Transporter) => {
        setEditing(t);
        const isKnownVehicleType = !t.vehicleType || VEHICLE_TYPES.includes(t.vehicleType);
        setEditForm({
            name: t.name,
            contactPerson: t.contactPerson || '',
            mobile: t.mobile || '',
            altMobile: t.altMobile || '',
            vehicleType: isKnownVehicleType ? (t.vehicleType || '') : 'Other',
            otherVehicleType: isKnownVehicleType ? '' : (t.vehicleType || ''),
            area: t.area || '',
            vehicleRoute: t.vehicleRoute || '',
            notes: t.notes || '',
        });
        setEditError(null);
    };

    const handleEditSave = async () => {
        if (!tenantId || !editing) return;
        const name = editForm.name.trim();
        if (!name) { setEditError('Transporter name is required.'); return; }
        if (editForm.vehicleType === 'Other' && !editForm.otherVehicleType.trim()) {
            setEditError('Please enter the vehicle type.'); return;
        }
        const mobileCheck = checkOptionalMobile(editForm.mobile);
        if (!mobileCheck.valid) { setEditError(mobileCheck.error!); return; }
        const altMobileCheck = checkOptionalMobile(editForm.altMobile);
        if (!altMobileCheck.valid) { setEditError('Alternate: ' + altMobileCheck.error!); return; }

        const resolvedVehicleType = editForm.vehicleType === 'Other' ? editForm.otherVehicleType.trim() : editForm.vehicleType;

        setEditSaving(true); setEditError(null);
        try {
            await updateDoc(getTenantDoc(db, tenantId, 'transporters', editing.id), {
                name,
                contactPerson: editForm.contactPerson.trim() || null,
                mobile: editForm.mobile.trim() || null,
                altMobile: editForm.altMobile.trim() || null,
                vehicleType: resolvedVehicleType || null,
                area: editForm.area.trim() || null,
                vehicleRoute: editForm.vehicleRoute.trim() || null,
                notes: editForm.notes.trim() || null,
                updatedAt: serverTimestamp(),
            });
            showToast('Transporter updated.', 'success');
            setEditing(null);
        } catch (e) {
            console.error('Edit transporter failed:', e);
            setEditError('Could not save. Please try again.');
        } finally {
            setEditSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!tenantId || !deleteTarget) return;
        setDeleting(true);
        try {
            await deleteDoc(getTenantDoc(db, tenantId, 'transporters', deleteTarget.id));
            showToast('Transporter deleted.', 'success');
            setDeleteTarget(null);
        } catch {
            showToast('Could not delete. Please try again.', 'error');
        } finally {
            setDeleting(false);
        }
    };

    const filtered = transporters.filter(t => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            t.name.toLowerCase().includes(q) ||
            (t.contactPerson || '').toLowerCase().includes(q) ||
            (t.mobile || '').includes(search) ||
            (t.altMobile || '').includes(search) ||
            (t.vehicleType || '').toLowerCase().includes(q) ||
            (t.area || '').toLowerCase().includes(q) ||
            (t.vehicleRoute || '').toLowerCase().includes(q)
        );
    });

    const overlayStyle: React.CSSProperties = {
        position: 'fixed', inset: 0, zIndex: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
        background: 'hsla(220,30%,4%,0.72)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
    };

    const editModal = editing && createPortal(
        <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Edit Transporter"
            onMouseDown={e => { if (e.target === e.currentTarget && !editSaving) setEditing(null); }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '560px', padding: '1.4rem', borderRadius: '16px', position: 'relative' }}>
                <button onClick={() => !editSaving && setEditing(null)} aria-label="Close"
                    style={{ position: 'absolute', top: '0.9rem', right: '0.9rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                    <X size={20} />
                </button>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Truck size={18} className="primary-gradient-text" /> Edit Transporter
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                    {/* Row 1: Transporter / Company Name */}
                    <div>
                        <label style={labelStyle}>Transporter / Company Name *</label>
                        <input className="input-field" style={{ width: '100%', margin: 0 }} value={editForm.name}
                            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} autoFocus />
                    </div>
                    {/* Row 2: Contact Person | Mobile Number | Alternate Mobile Number */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem' }}>
                        <div>
                            <label style={labelStyle}>Contact Person</label>
                            <input className="input-field" style={{ width: '100%', margin: 0 }} value={editForm.contactPerson}
                                onChange={e => setEditForm(f => ({ ...f, contactPerson: e.target.value }))} />
                        </div>
                        <div>
                            <label style={labelStyle}>Mobile Number</label>
                            <input className="input-field" style={{ width: '100%', margin: 0 }} value={editForm.mobile}
                                onChange={e => setEditForm(f => ({ ...f, mobile: e.target.value }))} />
                        </div>
                        <div>
                            <label style={labelStyle}>Alternate Mobile Number</label>
                            <input className="input-field" style={{ width: '100%', margin: 0 }} value={editForm.altMobile}
                                onChange={e => setEditForm(f => ({ ...f, altMobile: e.target.value }))} placeholder="Optional" />
                        </div>
                    </div>
                    {/* Row 3: Vehicle Type | Area */}
                    <div style={{ display: 'grid', gridTemplateColumns: editForm.vehicleType === 'Other' ? '1fr 1fr 1fr' : '1fr 1fr', gap: '0.6rem' }}>
                        <div>
                            <label style={labelStyle}>Vehicle Type</label>
                            <select className="input-field" style={{ width: '100%', margin: 0 }} value={editForm.vehicleType}
                                onChange={e => setEditForm(f => ({ ...f, vehicleType: e.target.value }))}>
                                <option value="">— Select —</option>
                                {VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </div>
                        {editForm.vehicleType === 'Other' && (
                            <div>
                                <label style={labelStyle}>Other Vehicle Type</label>
                                <input className="input-field" style={{ width: '100%', margin: 0 }} value={editForm.otherVehicleType}
                                    onChange={e => setEditForm(f => ({ ...f, otherVehicleType: e.target.value }))} placeholder="Enter vehicle type" />
                            </div>
                        )}
                        <div>
                            <label style={labelStyle}>Area (Optional)</label>
                            <input className="input-field" style={{ width: '100%', margin: 0 }} value={editForm.area}
                                onChange={e => setEditForm(f => ({ ...f, area: e.target.value }))} placeholder="e.g. Shirpur, Dhule" />
                        </div>
                    </div>
                    {/* Row 4: Vehicle / Route */}
                    <div>
                        <label style={labelStyle}>Vehicle / Route</label>
                        <input className="input-field" style={{ width: '100%', margin: 0 }} value={editForm.vehicleRoute}
                            onChange={e => setEditForm(f => ({ ...f, vehicleRoute: e.target.value }))} />
                    </div>
                    <div>
                        <label style={labelStyle}>Notes</label>
                        <input className="input-field" style={{ width: '100%', margin: 0 }} value={editForm.notes}
                            onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                </div>
                {editError && (
                    <div style={{ fontSize: '0.78rem', color: '#ef4444', marginTop: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <AlertTriangle size={13} /> {editError}
                    </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.25rem' }}>
                    <button onClick={() => setEditing(null)} className="btn btn-secondary" disabled={editSaving} style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}>Cancel</button>
                    <button onClick={handleEditSave} className="btn btn-primary" disabled={editSaving} style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}>
                        {editSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );

    const deleteModal = deleteTarget && createPortal(
        <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Delete Transporter"
            onMouseDown={e => { if (e.target === e.currentTarget && !deleting) setDeleteTarget(null); }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '380px', padding: '1.75rem', borderRadius: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                    <AlertTriangle size={20} color="#ef4444" />
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Delete transporter?</h2>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                    <strong>{deleteTarget.name}</strong> will be removed from the master list. Existing invoices that reference this transporter are unaffected.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                    <button onClick={() => setDeleteTarget(null)} className="btn btn-secondary" disabled={deleting} style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}>Cancel</button>
                    <button onClick={handleDelete} disabled={deleting}
                        style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
                        {deleting ? 'Deleting...' : 'Delete'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );

    return (
        <div className="animate-fade-in" style={{ width: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                        <Truck size={28} /> Manage Transport
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Master list of transporters — select one when creating a B2B Invoice.</p>
                </div>
                {canAddTransporter && (
                    <button onClick={() => setAddOpen(true)} className="btn btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                        <Plus size={16} /> Add Transporter
                    </button>
                )}
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                <input
                    type="text"
                    placeholder="Search by name, contact, phone, vehicle type, area or route..."
                    className="input-field"
                    style={{ paddingLeft: '2.2rem', margin: 0 }}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {/* List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Loading...</div>
            ) : filtered.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
                    <Truck size={48} color="var(--surface-border)" style={{ margin: '0 auto 1rem', display: 'block' }} />
                    <h3>{search ? 'No transporters match your search.' : 'No transporters yet.'}</h3>
                    {!search && canAddTransporter && (
                        <>
                            <p>Add your first transporter to use it on B2B Invoices.</p>
                            <button onClick={() => setAddOpen(true)} className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Plus size={15} /> Add Transporter
                            </button>
                        </>
                    )}
                </div>
            ) : (
                <div className="glass-panel" style={{ overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--surface-border)', background: 'var(--surface-raised)' }}>
                                    {['', 'Transporter / Company', 'Contact Person', 'Mobile', 'Vehicle / Route', ''].map((h, i) => (
                                        <th key={i} style={{ padding: '0.8rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: h === '' ? (i === 0 ? 'center' : 'right') : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(t => {
                                    const isOpen = expandedId === t.id;
                                    return (
                                        <Fragment key={t.id}>
                                            <tr
                                                onClick={() => toggleExpand(t.id)}
                                                style={{
                                                    borderBottom: isOpen ? '1px solid var(--primary-light)' : '1px solid var(--surface-border)',
                                                    background: isOpen ? 'hsla(220,80%,60%,0.05)' : 'transparent',
                                                    cursor: 'pointer',
                                                    transition: 'background 0.12s',
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = isOpen ? 'hsla(220,80%,60%,0.07)' : 'var(--surface-raised)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = isOpen ? 'hsla(220,80%,60%,0.05)' : 'transparent')}
                                            >
                                                <td style={{ padding: '0.85rem 0.5rem', textAlign: 'center' }}>
                                                    {isOpen
                                                        ? <ChevronDown size={14} color="var(--primary-light)" />
                                                        : <ChevronRight size={14} color="var(--text-tertiary)" />}
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary)22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            <Truck size={14} color="var(--primary-light)" />
                                                        </div>
                                                        <span style={{ fontWeight: 700 }}>{t.name}</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)' }}>
                                                    {t.contactPerson
                                                        ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><User size={12} /> {t.contactPerson}</span>
                                                        : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem' }}>
                                                    {t.mobile
                                                        ? <a href={`tel:${t.mobile}`} onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--primary-light)', textDecoration: 'none', fontSize: '0.83rem' }}>
                                                            <Phone size={12} /> {t.mobile}
                                                          </a>
                                                        : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)' }}>{t.vehicleRoute || '—'}</td>
                                                <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                                                    <div style={{ display: 'inline-flex', gap: '0.4rem' }} onClick={e => e.stopPropagation()}>
                                                        {canEditTransporter && (
                                                        <button onClick={() => openEdit(t)} title="Edit"
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.6rem', background: 'hsla(220,70%,55%,0.12)', color: '#3b82f6', border: '1px solid hsla(220,70%,55%,0.25)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'inherit' }}>
                                                            <Pencil size={12} /> Edit
                                                        </button>
                                                        )}
                                                        {canDeleteTransporter && (
                                                        <button onClick={() => setDeleteTarget(t)} title="Delete"
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.6rem', background: 'hsla(0,84%,60%,0.12)', color: '#ef4444', border: '1px solid hsla(0,84%,60%,0.25)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'inherit' }}>
                                                            <Trash2 size={12} /> Delete
                                                        </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>

                                            {isOpen && (
                                                <tr style={{ background: 'hsla(220,80%,60%,0.04)', borderBottom: '2px solid var(--primary-light)' }}>
                                                    <td colSpan={6} style={{ padding: '10px 20px 14px 44px' }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px 20px' }}>
                                                            <DetailField label="Alternate Mobile" value={t.altMobile || ''} />
                                                            <DetailField label="Vehicle Type" value={t.vehicleType || ''} />
                                                            <DetailField label="Area" value={t.area || ''} />
                                                            <DetailField label="Notes" value={t.notes || ''} />
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ padding: '0.7rem 1.25rem', borderTop: '1px solid var(--surface-border)', background: 'var(--surface-raised)', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                        {filtered.length} transporter{filtered.length !== 1 ? 's' : ''}
                    </div>
                </div>
            )}

            {/* Add modal — portal + scroll lock handled inside AddTransporterModal */}
            {addOpen && <AddTransporterModal onClose={() => setAddOpen(false)} />}

            {/* Edit modal — portal rendered to document.body */}
            {editModal}

            {/* Delete confirm modal — portal rendered to document.body */}
            {deleteModal}
        </div>
    );
}
