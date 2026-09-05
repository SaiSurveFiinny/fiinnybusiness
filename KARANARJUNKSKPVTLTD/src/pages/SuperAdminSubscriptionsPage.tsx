import { useState, useEffect, useCallback } from 'react';
import {
    ShieldCheck, Save, Layers, Building2, RefreshCw, Check, Info, ArrowLeft, Loader2, LayoutDashboard,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
    DEFAULT_PLAN_CATALOGUE,
    ALWAYS_ALLOWED_SCREENS,
    type Plan,
    type PlanId,
    type SubscriptionStatus,
    type TenantSubscription,
} from '../utils/subscriptionPlans';
import {
    SUBSCRIPTION_MODULES,
    buildPlanEntitlement,
    derivePlanEditorState,
} from '../utils/subscriptionCatalog';

// Plans shown in the catalogue, in tier order. Reuses the Phase 2A seed defaults.
const PLAN_ORDER: PlanId[] = ['retailer', 'distributor', 'manufacturer'];

// Stable signature of the editor's state — used to detect unsaved edits.
const serializeEditor = (keys: Set<string>, sections: Set<string>, landing: string) =>
    JSON.stringify({ k: [...keys].sort(), s: [...sections].sort(), l: landing });

// Selectable landing pages per plan. Keyed by the SUBSCRIPTION_MODULES key that
// must be enabled in the plan for this path to appear in the dropdown.
const PLAN_LANDING_OPTIONS: { path: string; label: string; moduleKey: string }[] = [
    { path: '/dashboard',     label: 'B2B Dashboard',    moduleKey: 'dashboard' },
    { path: '/b2c-dashboard', label: 'B2C Dashboard',    moduleKey: 'b2cDashboard' },
    { path: '/pos',           label: 'POS Billing',      moduleKey: 'pos' },
    { path: '/worklist',      label: 'Worklist',         moduleKey: 'worklist' },
    { path: '/reports',       label: 'Reports',          moduleKey: 'reports' },
    { path: '/analytics',     label: 'Analytics',        moduleKey: 'analytics' },
    { path: '/rates',         label: 'Inventory',        moduleKey: 'inventory' },
    { path: '/expenses',      label: 'Expenses',         moduleKey: 'expenses' },
];

const STATUS_OPTIONS: { value: SubscriptionStatus; label: string }[] = [
    { value: 'active',    label: 'Active' },
    { value: 'trial',     label: 'Trial' },
    { value: 'past_due',  label: 'Past due (grace)' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'cancelled', label: 'Cancelled' },
];

interface TenantRow {
    tenantId: string;
    businessName: string;
    subscription: TenantSubscription | null;
}

export default function SuperAdminSubscriptionsPage() {
    const { isSuperAdmin, currentUser, enterTenantView } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();

    // Open a tenant's normal ERP dashboard with full Super Admin access.
    const openTenantDashboard = (row: TenantRow) => {
        enterTenantView(row.tenantId, row.businessName);
        navigate('/dashboard');
    };

    const [view, setView] = useState<'plans' | 'tenants'>('plans');

    // ── Plan catalogue state ──
    const [plans, setPlans] = useState<Record<string, Plan>>({});
    const [plansLoading, setPlansLoading] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);
    // Enabled top-level modules + enabled sub-sections (checkbox state).
    const [editKeys, setEditKeys] = useState<Set<string>>(new Set());
    const [editSections, setEditSections] = useState<Set<string>>(new Set());
    const [editDefaultLanding, setEditDefaultLanding] = useState('');
    // Signature of the plan as loaded; Save enables only when the editor differs.
    const [planBaseline, setPlanBaseline] = useState('');
    const [savingPlan, setSavingPlan] = useState(false);
    const [seeding, setSeeding] = useState(false);

    // ── Tenant assignment state ──
    const [tenants, setTenants] = useState<TenantRow[]>([]);
    const [tenantsLoading, setTenantsLoading] = useState(false);
    const [savingTenant, setSavingTenant] = useState<string | null>(null);

    // isSuperAdmin comes directly from AuthContext (superadmin@fiinny.com identity check).

    // ── Loaders ──────────────────────────────────────────────────────────────
    const loadPlans = useCallback(async () => {
        setPlansLoading(true);
        try {
            const snap = await getDocs(collection(db, 'plans'));
            const map: Record<string, Plan> = {};
            snap.docs.forEach(d => { map[d.id] = { id: d.id, ...(d.data() as Omit<Plan, 'id'>) }; });
            setPlans(map);
        } catch {
            showToast('Failed to load plans.', 'error');
        } finally {
            setPlansLoading(false);
        }
    }, [showToast]);

    const loadTenants = useCallback(async () => {
        setTenantsLoading(true);
        try {
            const [tenantsSnap, subsSnap] = await Promise.all([
                getDocs(collection(db, 'tenants')),
                getDocs(collection(db, 'tenantSubscriptions')),
            ]);
            const subs: Record<string, TenantSubscription> = {};
            subsSnap.docs.forEach(d => { subs[d.id] = d.data() as TenantSubscription; });

            const rows: TenantRow[] = tenantsSnap.docs.map(d => ({
                tenantId: d.id,
                businessName: (d.data() as { businessName?: string }).businessName || d.id,
                subscription: subs[d.id] || null,
            }));

            // The master tenant uses root-level collections and may have no
            // /tenants/master doc — surface it explicitly so it can be assigned a
            // plan like every other tenant.
            if (!rows.some(r => r.tenantId === 'master')) {
                rows.unshift({ tenantId: 'master', businessName: 'KaranArjun (Master)', subscription: subs['master'] || null });
            }
            setTenants(rows.sort((a, b) => (a.tenantId === 'master' ? -1 : a.businessName.localeCompare(b.businessName))));
        } catch {
            showToast('Failed to load tenants.', 'error');
        } finally {
            setTenantsLoading(false);
        }
    }, [showToast]);

    useEffect(() => { if (isSuperAdmin) loadPlans(); }, [isSuperAdmin, loadPlans]);
    useEffect(() => { if (isSuperAdmin && view === 'tenants') loadTenants(); }, [isSuperAdmin, view, loadTenants]);

    // Initialise the editor when a plan is opened (fall back to seed defaults).
    useEffect(() => {
        if (!selectedPlan) return;
        const existing = plans[selectedPlan];
        const seed = DEFAULT_PLAN_CATALOGUE[selectedPlan as keyof typeof DEFAULT_PLAN_CATALOGUE];
        const { enabledKeys, includedSections } = derivePlanEditorState(
            existing?.screens ?? seed?.screens ?? [],
            existing?.features ?? seed?.features ?? [],
        );
        const landing = existing?.defaultLandingPath ?? '';
        setEditKeys(enabledKeys);
        setEditSections(includedSections);
        setEditDefaultLanding(landing);
        setPlanBaseline(serializeEditor(enabledKeys, includedSections, landing));
    }, [selectedPlan, plans]);

    if (!isSuperAdmin) {
        return (
            <div style={{ padding: '2rem', color: 'var(--danger)', textAlign: 'center' }}>
                Access Denied. Only the platform Super Admin can manage subscriptions.
            </div>
        );
    }

    // ── Plan actions ───────────────────────────────────────────────────────────
    const toggleModule = (key: string) => {
        setEditKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const toggleSection = (id: string) => {
        setEditSections(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const savePlan = async () => {
        if (!selectedPlan) return;
        setSavingPlan(true);
        try {
            const seed = DEFAULT_PLAN_CATALOGUE[selectedPlan as keyof typeof DEFAULT_PLAN_CATALOGUE];
            const existing = plans[selectedPlan];
            const { screens: moduleScreens, features } = buildPlanEntitlement({ enabledKeys: editKeys, includedSections: editSections });
            // Always-allowed screens (Settings) are stored so the set is complete.
            const screens = Array.from(new Set([...moduleScreens, ...ALWAYS_ALLOWED_SCREENS]));
            const payload: Plan = {
                id: selectedPlan,
                name: existing?.name ?? seed?.name ?? selectedPlan,
                description: existing?.description ?? seed?.description ?? '',
                tier: existing?.tier ?? seed?.tier ?? 1,
                isActive: existing?.isActive ?? true,
                screens,
                features,
                modules: existing?.modules ?? seed?.modules ?? [],
                ...(editDefaultLanding ? { defaultLandingPath: editDefaultLanding } : {}),
                createdAt: existing?.createdAt ?? serverTimestamp(),
                updatedAt: serverTimestamp(),
            };
            await setDoc(doc(db, 'plans', selectedPlan), payload, { merge: true });
            setPlans(prev => ({ ...prev, [selectedPlan]: payload }));
            showToast(`Plan "${payload.name}" saved.`, 'success');
        } catch {
            showToast('Failed to save plan.', 'error');
        } finally {
            setSavingPlan(false);
        }
    };

    const seedDefaults = async () => {
        setSeeding(true);
        try {
            for (const id of PLAN_ORDER) {
                if (plans[id]) continue; // never overwrite an edited plan
                const seed = DEFAULT_PLAN_CATALOGUE[id as keyof typeof DEFAULT_PLAN_CATALOGUE];
                await setDoc(doc(db, 'plans', id), {
                    ...seed,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            }
            await loadPlans();
            showToast('Missing plans seeded from defaults.', 'success');
        } catch {
            showToast('Failed to seed plans.', 'error');
        } finally {
            setSeeding(false);
        }
    };

    // ── Tenant actions ─────────────────────────────────────────────────────────
    const assignTenant = async (row: TenantRow, planId: PlanId, status: SubscriptionStatus) => {
        setSavingTenant(row.tenantId);
        try {
            const existing = row.subscription;
            const payload: TenantSubscription = {
                tenantId: row.tenantId,
                planId,
                status,
                assignedBy: currentUser?.email || currentUser?.uid || 'superadmin',
                startedAt: existing?.startedAt ?? serverTimestamp(),
                updatedAt: serverTimestamp(),
                ...(existing?.overrides ? { overrides: existing.overrides } : {}),
            };
            await setDoc(doc(db, 'tenantSubscriptions', row.tenantId), payload, { merge: true });
            setTenants(prev => prev.map(t => t.tenantId === row.tenantId ? { ...t, subscription: payload } : t));
            showToast(`${row.businessName} → ${plans[planId]?.name || planId} (${status}).`, 'success');
        } catch {
            showToast('Failed to update subscription.', 'error');
        } finally {
            setSavingTenant(null);
        }
    };

    // Save enables only when the editor differs from the plan as loaded.
    const planDirty = serializeEditor(editKeys, editSections, editDefaultLanding) !== planBaseline;

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto', padding: '1rem' }}>
            <div style={{ marginBottom: '1.25rem' }}>
                <h1 className="primary-gradient-text" style={{ fontSize: '1.75rem', display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
                    <ShieldCheck size={28} /> Super Admin · Subscriptions
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                    Configure the plan catalogue and assign plans to businesses. A plan defines the
                    <strong> maximum</strong> set of screens a tenant can access; the Role Matrix and Feature
                    Permissions then control access <em>within</em> that boundary.
                </p>
            </div>

            {/* View switch */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                {([['plans', 'Plans', <Layers size={16} />], ['tenants', 'Businesses', <Building2 size={16} />]] as const).map(([id, label, icon]) => (
                    <button
                        key={id}
                        onClick={() => { setView(id); setSelectedPlan(null); }}
                        className={view === id ? 'btn btn-primary' : 'btn btn-secondary'}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                    >
                        {icon} {label}
                    </button>
                ))}
            </div>

            {view === 'plans' && !selectedPlan && (
                <>
                    <div className="glass-panel" style={{ padding: '0.75rem 1rem', marginBottom: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', background: 'hsla(210,100%,50%,0.05)', border: '1px solid hsla(210,100%,50%,0.2)' }}>
                        <Info size={18} style={{ color: 'var(--primary-light)', flexShrink: 0, marginTop: '2px' }} />
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            Select a plan to enable/disable the ERP modules it unlocks. Settings is always on so
                            a tenant is never fully locked out. Seed the defaults first if the catalogue is empty.
                        </p>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                        <button onClick={seedDefaults} disabled={seeding} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                            {seeding ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Seed missing defaults
                        </button>
                    </div>

                    <div className="glass-panel" style={{ overflow: 'hidden' }}>
                        {plansLoading ? (
                            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading plans…</div>
                        ) : PLAN_ORDER.map(id => {
                            const p = plans[id];
                            const seed = DEFAULT_PLAN_CATALOGUE[id as keyof typeof DEFAULT_PLAN_CATALOGUE];
                            return (
                                <div key={id} onClick={() => setSelectedPlan(id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.9rem 1.25rem', cursor: 'pointer', borderBottom: '1px solid var(--surface-border)' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p?.name || seed?.name}</div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{p?.description || seed?.description}</div>
                                    </div>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                                        {p ? `${derivePlanEditorState(p.screens, p.features).enabledKeys.size} modules` : 'not seeded'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {view === 'plans' && selectedPlan && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <button onClick={() => setSelectedPlan(null)} className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '0.35rem 0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <ArrowLeft size={15} /> Back to Plans
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {planDirty && !savingPlan && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--secondary-dark)' }}>Unsaved changes</span>
                            )}
                            <button onClick={savePlan} disabled={savingPlan || !planDirty} className="btn btn-primary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', opacity: (savingPlan || !planDirty) ? 0.55 : 1, cursor: (savingPlan || !planDirty) ? 'not-allowed' : 'pointer' }}>
                                <Save size={16} /> {savingPlan ? 'Saving…' : 'Save Plan'}
                            </button>
                        </div>
                    </div>

                    <h2 style={{ fontSize: '1.2rem', margin: '0 0 0.35rem' }}>
                        {plans[selectedPlan]?.name || DEFAULT_PLAN_CATALOGUE[selectedPlan as keyof typeof DEFAULT_PLAN_CATALOGUE]?.name} · Modules
                    </h2>
                    <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Toggle whole modules on/off — this mirrors the ERP Main Navbar. Enabling a module grants
                        access to the entire module; the Business Admin then controls who can do what inside it.
                        Where a module has sub-sections you can narrow the subscription further (e.g. Worklist on,
                        Payment Reminders off). View/Add/Edit/Delete stay with the Business Admin.
                    </p>

                    <div className="glass-panel" style={{ overflow: 'hidden' }}>
                        {SUBSCRIPTION_MODULES.map(mod => {
                            const on = editKeys.has(mod.key);
                            return (
                                <div key={mod.key} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                                    {/* Module row (top-level toggle) */}
                                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem', padding: '0.7rem 1.25rem', cursor: 'pointer', background: on ? 'hsla(152,60%,40%,0.05)' : 'transparent' }}>
                                        <input type="checkbox" checked={on}
                                            onChange={() => toggleModule(mod.key)}
                                            style={{ width: '1.15rem', height: '1.15rem', accentColor: 'var(--primary-light)', marginTop: '2px' }} />
                                        <span style={{ flex: 1 }}>
                                            <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{mod.label}</span>
                                            {mod.note && (
                                                <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>{mod.note}</span>
                                            )}
                                        </span>
                                        {mod.sections.length > 0 && (
                                            <span style={{ fontSize: '0.7rem', color: on ? 'var(--primary-light)' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                                                {mod.sections.filter(s => editSections.has(s.id)).length}/{mod.sections.length} sub-sections
                                            </span>
                                        )}
                                    </label>

                                    {/* Sub-sections (no actions). Shown only when the module is on. */}
                                    {on && mod.sections.length > 0 && (
                                        <div style={{ padding: '0 1.25rem 0.6rem 2.85rem', display: 'flex', flexWrap: 'wrap', gap: '0.45rem 1.5rem' }}>
                                            {mod.sections.map(s => (
                                                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                                                    <input type="checkbox" checked={editSections.has(s.id)}
                                                        onChange={() => toggleSection(s.id)}
                                                        style={{ width: '0.95rem', height: '0.95rem', accentColor: 'var(--primary-light)' }} />
                                                    {s.label}
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Default landing page — only screens enabled in this plan are selectable */}
                    <div className="glass-panel" style={{ padding: '1rem 1.25rem', marginTop: '1rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: '0.35rem' }}>Default Landing Page</div>
                        <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Where admin/analyst users land after login when no role-specific page is configured.
                            Only pages included in this plan's modules are selectable.
                        </p>
                        <select
                            className="input-field"
                            value={editDefaultLanding}
                            onChange={e => setEditDefaultLanding(e.target.value)}
                            style={{ maxWidth: '280px' }}
                        >
                            <option value="">— Use role default —</option>
                            {PLAN_LANDING_OPTIONS
                                .filter(opt => editKeys.has(opt.moduleKey))
                                .map(opt => (
                                    <option key={opt.path} value={opt.path}>{opt.label} ({opt.path})</option>
                                ))
                            }
                        </select>
                    </div>
                </>
            )}

            {view === 'tenants' && (
                <div className="glass-panel" style={{ overflow: 'hidden' }}>
                    {tenantsLoading ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading businesses…</div>
                    ) : tenants.length === 0 ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No businesses found.</div>
                    ) : tenants.map(row => (
                        <TenantAssignRow
                            key={row.tenantId}
                            row={row}
                            saving={savingTenant === row.tenantId}
                            planExists={(id: PlanId) => !!plans[id]}
                            onSave={assignTenant}
                            onOpenDashboard={openTenantDashboard}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Tenant row with per-row plan + status selectors ──────────────────────────
function TenantAssignRow({
    row, saving, planExists, onSave, onOpenDashboard,
}: {
    row: TenantRow;
    saving: boolean;
    planExists: (id: PlanId) => boolean;
    onSave: (row: TenantRow, planId: PlanId, status: SubscriptionStatus) => void;
    onOpenDashboard: (row: TenantRow) => void;
}) {
    const [planId, setPlanId] = useState<PlanId>((row.subscription?.planId as PlanId) || 'retailer');
    const [status, setStatus] = useState<SubscriptionStatus>(row.subscription?.status || 'active');

    const dirty = planId !== row.subscription?.planId || status !== row.subscription?.status;
    const current = row.subscription;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--surface-border)', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{row.businessName}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                    {row.tenantId}
                    {current
                        ? <> · <span style={{ color: 'var(--text-secondary)' }}>{current.planId} / {current.status}</span></>
                        : <> · <span style={{ color: 'var(--danger)' }}>no subscription</span></>}
                </div>
            </div>
            <button
                onClick={() => onOpenDashboard(row)}
                title={`Open ${row.businessName}'s dashboard as Super Admin`}
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', padding: '0.4rem 0.8rem', flexShrink: 0 }}
            >
                <LayoutDashboard size={14} /> Dashboard
            </button>
            <select className="input-field" style={{ flex: '0 1 150px' }} value={planId} onChange={e => setPlanId(e.target.value as PlanId)}>
                {PLAN_ORDER.map(id => (
                    <option key={id} value={id} disabled={!planExists(id)}>
                        {id.charAt(0).toUpperCase() + id.slice(1)}{planExists(id) ? '' : ' (not seeded)'}
                    </option>
                ))}
            </select>
            <select className="input-field" style={{ flex: '0 1 150px' }} value={status} onChange={e => setStatus(e.target.value as SubscriptionStatus)}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
                onClick={() => onSave(row, planId, status)}
                disabled={saving || !dirty || !planExists(planId)}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', padding: '0.4rem 0.8rem' }}
            >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {current ? 'Update' : 'Assign'}
            </button>
        </div>
    );
}
