import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';
import { Truck, X, AlertTriangle } from 'lucide-react';

interface Props {
    onClose: () => void;
    onSaved?: (id: string, name: string, mobile: string) => void;
}

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.8rem', fontWeight: 600,
    color: 'var(--text-secondary)', marginBottom: '0.3rem',
};

export default function AddTransporterModal({ onClose, onSaved }: Props) {
    const { tenantId } = useAuth();
    const { showToast } = useToast();

    const [form, setForm] = useState({ name: '', contactPerson: '', mobile: '', vehicleRoute: '', notes: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Lock background scroll
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, []);

    // Escape to close
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [saving, onClose]);

    const handleSave = async () => {
        if (!tenantId) return;
        const name = form.name.trim();
        if (!name) { setError('Transporter name is required.'); return; }
        setSaving(true); setError(null);
        try {
            const ref = await addDoc(getTenantCollection(db, tenantId, 'transporters'), {
                name,
                contactPerson: form.contactPerson.trim() || null,
                mobile: form.mobile.trim() || null,
                vehicleRoute: form.vehicleRoute.trim() || null,
                notes: form.notes.trim() || null,
                createdAt: serverTimestamp(),
            });
            showToast('Transporter added.', 'success');
            onSaved?.(ref.id, name, form.mobile.trim());
            onClose();
        } catch (e) {
            console.error('AddTransporterModal save failed:', e);
            setError('Could not save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const modal = (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 1200,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '1rem',
                background: 'hsla(220,30%,4%,0.72)',
                backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Add Transporter"
            onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose(); }}
        >
            <div
                className="glass-panel"
                style={{ width: '100%', maxWidth: '480px', padding: '1.75rem', borderRadius: '16px', position: 'relative' }}
            >
                <button
                    onClick={() => !saving && onClose()}
                    aria-label="Close"
                    style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
                >
                    <X size={20} />
                </button>

                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Truck size={18} className="primary-gradient-text" /> Add Transporter
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div>
                        <label style={labelStyle}>Transporter / Company Name *</label>
                        <input
                            className="input-field"
                            style={{ width: '100%', margin: 0 }}
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="e.g. Sharma Transport Co."
                            autoFocus
                        />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                            <label style={labelStyle}>Contact Person</label>
                            <input
                                className="input-field"
                                style={{ width: '100%', margin: 0 }}
                                value={form.contactPerson}
                                onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))}
                                placeholder="e.g. Ramesh Sharma"
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Mobile Number</label>
                            <input
                                className="input-field"
                                style={{ width: '100%', margin: 0 }}
                                value={form.mobile}
                                onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))}
                                placeholder="10-digit mobile"
                            />
                        </div>
                    </div>
                    <div>
                        <label style={labelStyle}>Vehicle / Route</label>
                        <input
                            className="input-field"
                            style={{ width: '100%', margin: 0 }}
                            value={form.vehicleRoute}
                            onChange={e => setForm(f => ({ ...f, vehicleRoute: e.target.value }))}
                            placeholder="e.g. MH-12 AB 1234 · Pune–Nashik"
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Notes</label>
                        <input
                            className="input-field"
                            style={{ width: '100%', margin: 0 }}
                            value={form.notes}
                            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Optional remarks"
                        />
                    </div>
                </div>

                {error && (
                    <div style={{ fontSize: '0.78rem', color: '#ef4444', marginTop: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <AlertTriangle size={13} /> {error}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.25rem' }}>
                    <button onClick={() => !saving && onClose()} className="btn btn-secondary" disabled={saving} style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}>
                        Cancel
                    </button>
                    <button onClick={handleSave} className="btn btn-primary" disabled={saving} style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}>
                        {saving ? 'Saving...' : 'Add Transporter'}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
}
