import { useState, useEffect } from 'react';
import { Save, ChevronDown, ChevronRight, ShieldCheck, Info } from 'lucide-react';
import { setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../contexts/AuthContext';
import {
    PERMISSION_MODULES,
    DEFAULT_FEATURE_PERMISSIONS,
    collectSectionActions,
    type FeaturePermissions,
    type FeaturePermissionMap,
    type PermissionSection,
} from '../utils/featurePermissions';
import { getTenantDoc } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';

const EDITABLE_ROLES: { key: UserRole; label: string }[] = [
    { key: 'admin',        label: 'Admin' },
    { key: 'analyst',      label: 'Analyst' },
    { key: 'sales',        label: 'Sales' },
    { key: 'retailer',     label: 'Retailer' },
    { key: 'shopkeeper',   label: 'Shopkeeper' },
    { key: 'manufacturer', label: 'Manufacturer' },
    { key: 'customer',     label: 'Customer' },
];

// ─── Recursive section renderer ───────────────────────────────────────────────

interface SectionProps {
    section: PermissionSection;
    roleMap: FeaturePermissionMap;
    expanded: Set<string>;
    onToggleExpand: (id: string) => void;
    onToggleAction: (permId: string) => void;
    onToggleSection: (sectionId: string, value: boolean) => void;
    depth?: number;
}

function SectionRow({ section, roleMap, expanded, onToggleExpand, onToggleAction, onToggleSection, depth = 0 }: SectionProps) {
    const isExpanded = expanded.has(section.id);
    const allActions = collectSectionActions(section);
    const totalActions = allActions.length;
    const enabledCount = allActions.filter(a => roleMap[a.id]).length;
    const allEnabled = enabledCount === totalActions && totalActions > 0;
    const someEnabled = enabledCount > 0 && !allEnabled;
    const indentPx = 20 + depth * 20;

    return (
        <>
            {/* Section header */}
            <div
                onClick={() => onToggleExpand(section.id)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: `0.65rem 1.25rem 0.65rem ${indentPx}px`,
                    cursor: 'pointer',
                    userSelect: 'none',
                    borderBottom: '1px solid var(--surface-border)',
                    background: depth > 0 ? 'hsla(0,0%,100%,0.02)' : 'transparent',
                }}
            >
                <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </span>
                <input
                    type="checkbox"
                    checked={allEnabled}
                    ref={el => { if (el) el.indeterminate = someEnabled; }}
                    onChange={e => { e.stopPropagation(); onToggleSection(section.id, e.target.checked); }}
                    onClick={e => e.stopPropagation()}
                    style={{ width: '1.05rem', height: '1.05rem', cursor: 'pointer', accentColor: 'var(--primary-light)', flexShrink: 0 }}
                />
                <span style={{ fontWeight: depth === 0 ? 600 : 500, fontSize: depth === 0 ? '0.9rem' : '0.85rem', flex: 1 }}>
                    {section.label}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                    {enabledCount}/{totalActions}
                </span>
            </div>

            {/* Expanded: own actions then child sections */}
            {isExpanded && (
                <>
                    {(section.actions ?? []).map(action => (
                        <label
                            key={action.id}
                            onClick={e => e.stopPropagation()}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.6rem',
                                cursor: 'pointer',
                                padding: `0.3rem 1.25rem 0.3rem ${indentPx + 36}px`,
                                borderBottom: '1px solid var(--surface-border)',
                                background: 'hsla(0,0%,100%,0.015)',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={roleMap[action.id] ?? false}
                                onChange={() => onToggleAction(action.id)}
                                style={{ width: '1rem', height: '1rem', cursor: 'pointer', accentColor: 'var(--primary-light)' }}
                            />
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', flex: 1 }}>{action.label}</span>
                            <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: 'var(--text-tertiary)' }}>{action.id}</span>
                        </label>
                    ))}

                    {(section.children ?? []).map(child => (
                        <SectionRow
                            key={child.id}
                            section={child}
                            roleMap={roleMap}
                            expanded={expanded}
                            onToggleExpand={onToggleExpand}
                            onToggleAction={onToggleAction}
                            onToggleSection={onToggleSection}
                            depth={depth + 1}
                        />
                    ))}
                </>
            )}
        </>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuperAdminPermissionsPage() {
    const { tenantId, userRole, featurePermissions } = useAuth();
    const { showToast } = useToast();

    const [selectedRole, setSelectedRole] = useState<UserRole>('analyst');
    const [matrix, setMatrix] = useState<FeaturePermissions>(featurePermissions || DEFAULT_FEATURE_PERMISSIONS);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (featurePermissions) setMatrix(featurePermissions);
    }, [featurePermissions]);

    if (userRole !== 'admin') {
        return <div style={{ padding: '2rem', color: 'var(--danger)', textAlign: 'center' }}>Access Denied. Only Admins can manage feature permissions.</div>;
    }

    const roleMap: FeaturePermissionMap = matrix[selectedRole] ?? {};

    const toggleAction = (permId: string) => {
        setMatrix(prev => ({
            ...prev,
            [selectedRole]: { ...(prev[selectedRole] ?? {}), [permId]: !(prev[selectedRole]?.[permId] ?? false) },
        }));
    };

    const toggleSection = (sectionId: string, value: boolean) => {
        // Find the section anywhere in the tree and toggle all its actions.
        const allSections = PERMISSION_MODULES.flatMap(m => m.sections).flatMap(flattenSections);
        const target = allSections.find(s => s.id === sectionId);
        if (!target) return;
        const updates: FeaturePermissionMap = {};
        for (const action of collectSectionActions(target)) updates[action.id] = value;
        setMatrix(prev => ({
            ...prev,
            [selectedRole]: { ...(prev[selectedRole] ?? {}), ...updates },
        }));
    };

    const toggleExpand = (id: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleSave = async () => {
        if (!tenantId) return;
        setSaving(true);
        try {
            const ref = getTenantDoc(db, tenantId, 'settings', 'featurePermissions');
            await setDoc(ref, { ...matrix, updatedAt: serverTimestamp() });
            showToast('Feature permissions saved. Changes apply immediately.', 'success');
        } catch {
            showToast('Failed to save feature permissions.', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '860px', margin: '0 auto', padding: '1rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '1.75rem', display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
                        <ShieldCheck size={28} /> Feature Permissions
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                        Granular action-level access control per role. Module-level access is managed in Role Matrix.
                    </p>
                </div>
                <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Save size={16} /> {saving ? 'Saving…' : 'Save'}
                </button>
            </div>

            {/* Info banner */}
            <div className="glass-panel" style={{ padding: '0.75rem 1rem', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', background: 'hsla(210,100%,50%,0.05)', border: '1px solid hsla(210,100%,50%,0.2)' }}>
                <Info size={18} style={{ color: 'var(--primary-light)', flexShrink: 0, marginTop: '2px' }} />
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Changes here control which tabs, buttons, and actions each role can see and use.
                    The <strong>Admin</strong> role always has full access regardless of these settings.
                </p>
            </div>

            {/* Role selector */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {EDITABLE_ROLES.map(r => (
                    <button
                        key={r.key}
                        onClick={() => setSelectedRole(r.key)}
                        className={selectedRole === r.key ? 'btn btn-primary' : 'btn btn-secondary'}
                        style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}
                    >
                        {r.label}
                    </button>
                ))}
            </div>

            {/* Permission tree */}
            {PERMISSION_MODULES.map(mod => (
                <div key={mod.id} className="glass-panel" style={{ marginBottom: '1rem', overflow: 'hidden' }}>
                    <div style={{ padding: '0.85rem 1.25rem', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', background: 'var(--surface-raised)', borderBottom: '1px solid var(--surface-border)' }}>
                        {mod.label}
                    </div>
                    {mod.sections.length === 0 ? (
                        <div style={{ padding: '0.85rem 1.25rem', fontSize: '0.82rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                            Sub-tabs coming soon.
                        </div>
                    ) : mod.sections.map(section => (
                        <SectionRow
                            key={section.id}
                            section={section}
                            roleMap={roleMap}
                            expanded={expandedSections}
                            onToggleExpand={toggleExpand}
                            onToggleAction={toggleAction}
                            onToggleSection={toggleSection}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flattenSections(section: PermissionSection): PermissionSection[] {
    return [section, ...(section.children ?? []).flatMap(flattenSections)];
}
