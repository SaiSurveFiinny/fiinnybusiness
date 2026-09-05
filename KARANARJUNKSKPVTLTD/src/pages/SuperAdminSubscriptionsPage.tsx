import { useState, useEffect, useCallback } from 'react';
import {
    ShieldCheck, Save, Layers, Building2, RefreshCw, Check, Info, ArrowLeft, Loader2, LayoutDashboard,
    LayoutGrid, Pencil, X, Calendar, CreditCard,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, setDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
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

// Compact colour map for the subscription status badge.
const STATUS_BADGE: Record<SubscriptionStatus, { bg: string; fg: string; label: string }> = {
    active:    { bg: 'hsla(152,60%,40%,0.15)',  fg: 'hsl(152,55%,38%)',  label: 'Active' },
    trial:     { bg: 'hsla(210,100%,50%,0.15)', fg: 'hsl(210,90%,55%)',  label: 'Trial' },
    past_due:  { bg: 'hsla(38,92%,50%,0.15)',   fg: 'hsl(38,80%,45%)',   label: 'Past due' },
    suspended: { bg: 'hsla(25,90%,52%,0.15)',   fg: 'hsl(25,80%,50%)',   label: 'Suspended' },
    cancelled: { bg: 'hsla(0,75%,55%,0.15)',    fg: 'hsl(0,70%,55%)',    label: 'Cancelled' },
};

// Firestore Timestamp | Date | millis → readable date, or an em-dash when absent.
const formatDate = (ts: unknown): string => {
    if (!ts) return '—';
    try {
        const d = typeof ts === 'object' && ts !== null && 'toDate' in ts
            ? (ts as { toDate: () => Date }).toDate()
            : new Date(ts as string | number);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
        return '—';
    }
};

interface TenantRow {
    tenantId: string;
    businessName: string;
    subscription: TenantSubscription | null;
}

// Row shape mirrors exactly the fields written by verifySaaSPayment (functions/src/payments.ts).
// No field is read that the ledger does not store; razorpay_signature is never persisted.
interface SaasPaymentRow {
    razorpayPaymentId: string;
    razorpayOrderId?: string;
    tenantId?: string;
    planId?: string;
    cycle?: string;
    amount?: number;       // stored in paise
    currency?: string;
    status?: string;
    createdAt?: unknown;
}

type Section = 'overview' | 'businesses' | 'plans' | 'payments';

// Every section is addressable via a stable hash (/super-admin#<id>). Adding a
// future section only requires appending an entry here.
const SIDEBAR_SECTIONS: { id: Section; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'overview',   label: 'Overview',   icon: LayoutGrid },
    { id: 'businesses', label: 'Businesses', icon: Building2 },
    { id: 'plans',      label: 'Plans',      icon: Layers },
    { id: 'payments',   label: 'Payments',   icon: CreditCard },
];

const SECTION_IDS: Section[] = SIDEBAR_SECTIONS.map(s => s.id);

// URL hash → active section; unknown/empty hash falls back to the default Overview.
const readHashSection = (): Section => {
    const h = window.location.hash.slice(1) as Section;
    return SECTION_IDS.includes(h) ? h : 'overview';
};

// Format a paise amount stored in saasPayments as a readable currency string.
const formatAmount = (paise?: number, currency = 'INR'): string => {
    if (typeof paise !== 'number' || isNaN(paise)) return '—';
    try {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(paise / 100);
    } catch {
        return `${(paise / 100).toFixed(2)} ${currency}`;
    }
};

export default function SuperAdminSubscriptionsPage() {
    const { isSuperAdmin, currentUser, enterTenantView } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();

    // Open a tenant's normal ERP dashboard with full Super Admin access.
    const openTenantDashboard = (row: TenantRow) => {
        enterTenantView(row.tenantId, row.businessName);
        navigate('/dashboard');
    };

    // Active section is driven by the URL hash so refresh/back/forward all work and
    // the section is deep-linkable (e.g. /super-admin#businesses).
    const [section, setSectionState] = useState<Section>(readHashSection);
    const goToSection = (id: Section) => {
        setSelectedPlan(null);
        if (window.location.hash.slice(1) !== id) {
            window.location.hash = id; // pushes history + fires hashchange
        }
        setSectionState(id);
    };

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
    const [tenantsError, setTenantsError] = useState(false);
    const [savingTenant, setSavingTenant] = useState<string | null>(null);
    // Business whose subscription is being edited in the modal (null = closed).
    const [editingTenant, setEditingTenant] = useState<TenantRow | null>(null);

    // ── SaaS payments ledger state ──
    const [payments, setPayments] = useState<SaasPaymentRow[]>([]);
    const [paymentsLoading, setPaymentsLoading] = useState(false);
    const [paymentsError, setPaymentsError] = useState(false);

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
        setTenantsError(false);
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
            setTenantsError(true);
            showToast('Failed to load businesses.', 'error');
        } finally {
            setTenantsLoading(false);
        }
    }, [showToast]);

    const loadPayments = useCallback(async () => {
        setPaymentsLoading(true);
        setPaymentsError(false);
        try {
            // Ordered newest-first by the ledger's own createdAt server timestamp.
            const snap = await getDocs(query(collection(db, 'saasPayments'), orderBy('createdAt', 'desc')));
            setPayments(snap.docs.map(d => ({
                razorpayPaymentId: d.id,
                ...(d.data() as Omit<SaasPaymentRow, 'razorpayPaymentId'>),
            })));
        } catch {
            setPaymentsError(true);
            showToast('Failed to load payments.', 'error');
        } finally {
            setPaymentsLoading(false);
        }
    }, [showToast]);

    // Keep the active section in sync with the URL hash (back/forward + refresh).
    useEffect(() => {
        const onHashChange = () => setSectionState(readHashSection());
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    useEffect(() => { if (isSuperAdmin) loadPlans(); }, [isSuperAdmin, loadPlans]);
    // Businesses are needed by the Overview summary, the Businesses table, and to
    // resolve tenant display names in the Payments table.
    useEffect(() => {
        if (isSuperAdmin && (section === 'businesses' || section === 'overview' || section === 'payments')) loadTenants();
    }, [isSuperAdmin, section, loadTenants]);
    useEffect(() => {
        if (isSuperAdmin && section === 'payments') loadPayments();
    }, [isSuperAdmin, section, loadPayments]);

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
            <div style={{ padding: '2rem', color: 'var(--danger)', textAlign: 'center', width: '100%' }}>
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
            setEditingTenant(null);
        } catch {
            showToast('Failed to update subscription.', 'error');
        } finally {
            setSavingTenant(null);
        }
    };

    // Save enables only when the editor differs from the plan as loaded.
    const planDirty = serializeEditor(editKeys, editSections, editDefaultLanding) !== planBaseline;

    // Overview metrics
    const activeCount = tenants.filter(t => t.subscription && ['active', 'trial', 'past_due'].includes(t.subscription.status)).length;
    const noSubCount = tenants.filter(t => !t.subscription).length;
    const plansConfigured = PLAN_ORDER.filter(id => plans[id]).length;

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', width: '100%', minHeight: 'calc(100vh - 66px)' }}>
            {/* Persistent admin sidebar */}
            <aside style={{
                width: '220px', flexShrink: 0, borderRight: '1px solid var(--surface-border)',
                background: 'var(--surface-raised)', padding: '1.25rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem',
            }}>
                {SIDEBAR_SECTIONS.map(({ id, label, icon: Icon }) => {
                    const active = section === id;
                    return (
                        <button
                            key={id}
                            onClick={() => goToSection(id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.7rem', width: '100%', textAlign: 'left',
                                padding: '0.6rem 0.85rem', borderRadius: '10px', cursor: 'pointer', font: 'inherit', fontSize: '0.9rem',
                                border: 'none', transition: 'background 0.15s',
                                fontWeight: active ? 600 : 500,
                                color: active ? '#fff' : 'var(--text-secondary)',
                                background: active ? 'var(--primary)' : 'transparent',
                            }}
                        >
                            <Icon size={18} /> {label}
                        </button>
                    );
                })}
            </aside>

            {/* Main content area */}
            <div style={{ flex: 1, minWidth: 0, padding: '1.75rem 2rem', overflow: 'auto' }}>
                {section === 'overview' && (
                    <OverviewSection
                        loading={tenantsLoading}
                        total={tenants.length}
                        active={activeCount}
                        noSub={noSubCount}
                        plansConfigured={plansConfigured}
                        onManageBusinesses={() => goToSection('businesses')}
                        onManagePlans={() => goToSection('plans')}
                    />
                )}

                {section === 'businesses' && (
                    <>
                        <SectionHeader
                            title="Businesses"
                            subtitle="Every tenant on the platform. Open a business dashboard or adjust its subscription."
                            actions={
                                <button onClick={loadTenants} disabled={tenantsLoading} className="btn btn-secondary"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                    {tenantsLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refresh
                                </button>
                            }
                        />

                        <div className="glass-panel" style={{ overflow: 'hidden' }}>
                            {tenantsLoading ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                    <Loader2 size={22} className="animate-spin" style={{ marginBottom: '0.5rem' }} />
                                    <div>Loading businesses…</div>
                                </div>
                            ) : tenantsError ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--danger)' }}>
                                    Couldn't load businesses.{' '}
                                    <button onClick={loadTenants} className="btn btn-secondary" style={{ marginLeft: '0.5rem', fontSize: '0.82rem' }}>Retry</button>
                                </div>
                            ) : tenants.length === 0 ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No businesses found.</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            <th style={thStyle}>Business Name</th>
                                            <th style={thStyle}>Subscription</th>
                                            <th style={thStyle}>Created</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tenants.map(row => (
                                            <tr key={row.tenantId} style={{ borderTop: '1px solid var(--surface-border)' }}>
                                                <td style={tdStyle}>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.businessName}</div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{row.tenantId}</div>
                                                </td>
                                                <td style={tdStyle}>
                                                    <SubscriptionCell subscription={row.subscription} planName={row.subscription ? (plans[row.subscription.planId]?.name || row.subscription.planId) : null} />
                                                </td>
                                                <td style={{ ...tdStyle, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                        <Calendar size={13} style={{ color: 'var(--text-tertiary)' }} />
                                                        {formatDate(row.subscription?.startedAt)}
                                                    </span>
                                                </td>
                                                <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                        <button
                                                            onClick={() => openTenantDashboard(row)}
                                                            title={`Open ${row.businessName}'s dashboard as Super Admin`}
                                                            className="btn btn-secondary"
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                                                        >
                                                            <LayoutDashboard size={14} /> Dashboard
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingTenant(row)}
                                                            title={`Edit ${row.businessName}'s subscription`}
                                                            className="btn btn-primary"
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                                                        >
                                                            <Pencil size={14} /> Edit Subscription
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
                )}

                {section === 'payments' && (
                    <>
                        <SectionHeader
                            title="Payments"
                            subtitle="SaaS subscription payments received via Razorpay. Each row is a verified, captured payment from the server-side ledger."
                            actions={
                                <button onClick={loadPayments} disabled={paymentsLoading} className="btn btn-secondary"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                    {paymentsLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refresh
                                </button>
                            }
                        />

                        <div className="glass-panel" style={{ overflowX: 'auto' }}>
                            {paymentsLoading ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                    <Loader2 size={22} className="animate-spin" style={{ marginBottom: '0.5rem' }} />
                                    <div>Loading payments…</div>
                                </div>
                            ) : paymentsError ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--danger)' }}>
                                    Couldn't load payments.{' '}
                                    <button onClick={loadPayments} className="btn btn-secondary" style={{ marginLeft: '0.5rem', fontSize: '0.82rem' }}>Retry</button>
                                </div>
                            ) : payments.length === 0 ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No SaaS payments recorded yet.</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: '900px' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            <th style={thStyle}>Business / Tenant</th>
                                            <th style={thStyle}>Plan</th>
                                            <th style={thStyle}>Cycle</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                                            <th style={thStyle}>Status</th>
                                            <th style={thStyle}>Date</th>
                                            <th style={thStyle}>Payment ID</th>
                                            <th style={thStyle}>Order ID</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payments.map(p => {
                                            const businessName = p.tenantId
                                                ? (tenants.find(t => t.tenantId === p.tenantId)?.businessName || p.tenantId)
                                                : '—';
                                            const planName = p.planId ? (plans[p.planId]?.name || p.planId) : '—';
                                            const badge = p.status ? PAYMENT_STATUS_BADGE(p.status) : null;
                                            return (
                                                <tr key={p.razorpayPaymentId} style={{ borderTop: '1px solid var(--surface-border)' }}>
                                                    <td style={tdStyle}>
                                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{businessName}</div>
                                                        {p.tenantId && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{p.tenantId}</div>}
                                                    </td>
                                                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{planName}</td>
                                                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{p.cycle || '—'}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatAmount(p.amount, p.currency)}</td>
                                                    <td style={tdStyle}>
                                                        {badge
                                                            ? <span style={{ ...badgeBase, background: badge.bg, color: badge.fg }}>{badge.label}</span>
                                                            : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                                                    </td>
                                                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                            <Calendar size={13} style={{ color: 'var(--text-tertiary)' }} />
                                                            {formatDate(p.createdAt)}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{p.razorpayPaymentId}</td>
                                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{p.razorpayOrderId || '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
                )}

                {section === 'plans' && !selectedPlan && (
                    <>
                        <SectionHeader
                            title="Plans"
                            subtitle="Configure the plan catalogue. A plan defines the maximum set of screens a tenant can access."
                            actions={
                                <button onClick={seedDefaults} disabled={seeding} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                    {seeding ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Seed missing defaults
                                </button>
                            }
                        />

                        <div className="glass-panel" style={{ padding: '0.75rem 1rem', marginBottom: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', background: 'hsla(210,100%,50%,0.05)', border: '1px solid hsla(210,100%,50%,0.2)' }}>
                            <Info size={18} style={{ color: 'var(--primary-light)', flexShrink: 0, marginTop: '2px' }} />
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                Select a plan to enable/disable the ERP modules it unlocks. Settings is always on so
                                a tenant is never fully locked out. Seed the defaults first if the catalogue is empty.
                            </p>
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

                {section === 'plans' && selectedPlan && (
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
            </div>

            {/* Edit Subscription modal — reuses assignTenant + the plan/status selectors */}
            {editingTenant && (
                <EditSubscriptionModal
                    row={editingTenant}
                    plans={plans}
                    saving={savingTenant === editingTenant.tenantId}
                    planExists={(id: PlanId) => !!plans[id]}
                    onSave={assignTenant}
                    onClose={() => setEditingTenant(null)}
                />
            )}
        </div>
    );
}

// ─── Shared bits ──────────────────────────────────────────────────────────────
const thStyle: React.CSSProperties = { padding: '0.7rem 1.1rem', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '0.75rem 1.1rem', verticalAlign: 'middle' };

function SectionHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <div>
                <h1 className="primary-gradient-text" style={{ fontSize: '1.6rem', display: 'flex', alignItems: 'center', gap: '0.55rem', margin: '0 0 0.3rem' }}>
                    <ShieldCheck size={24} /> {title}
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: 0, maxWidth: '640px' }}>{subtitle}</p>
            </div>
            {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
        </div>
    );
}

function SubscriptionCell({ subscription, planName }: { subscription: TenantSubscription | null; planName: string | null }) {
    if (!subscription) {
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ ...badgeBase, background: 'var(--surface-border)', color: 'var(--text-tertiary)' }}>No subscription</span>
            </span>
        );
    }
    const badge = STATUS_BADGE[subscription.status];
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{planName}</span>
            <span style={{ ...badgeBase, background: badge.bg, color: badge.fg }}>{badge.label}</span>
        </span>
    );
}

const badgeBase: React.CSSProperties = {
    fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.55rem', borderRadius: '999px', whiteSpace: 'nowrap',
};

// Colour map for the Razorpay payment status stored in saasPayments (currently
// 'captured'; other Razorpay statuses are handled gracefully with a neutral badge).
function PAYMENT_STATUS_BADGE(status: string): { bg: string; fg: string; label: string } {
    const label = status.charAt(0).toUpperCase() + status.slice(1);
    switch (status) {
        case 'captured':
        case 'authorized':
            return { bg: 'hsla(152,60%,40%,0.15)', fg: 'hsl(152,55%,38%)', label };
        case 'created':
        case 'pending':
            return { bg: 'hsla(38,92%,50%,0.15)', fg: 'hsl(38,80%,45%)', label };
        case 'failed':
        case 'refunded':
            return { bg: 'hsla(0,75%,55%,0.15)', fg: 'hsl(0,70%,55%)', label };
        default:
            return { bg: 'var(--surface-border)', fg: 'var(--text-secondary)', label };
    }
}

function OverviewSection({
    loading, total, active, noSub, plansConfigured, onManageBusinesses, onManagePlans,
}: {
    loading: boolean; total: number; active: number; noSub: number; plansConfigured: number;
    onManageBusinesses: () => void; onManagePlans: () => void;
}) {
    const cards = [
        { label: 'Total businesses', value: total, icon: Building2 },
        { label: 'Active subscriptions', value: active, icon: Check },
        { label: 'Without subscription', value: noSub, icon: Info },
        { label: 'Plans configured', value: `${plansConfigured}/${PLAN_ORDER.length}`, icon: Layers },
    ];
    return (
        <>
            <SectionHeader title="Overview" subtitle="Platform snapshot across all tenants and plans." />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {cards.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="glass-panel" style={{ padding: '1.1rem 1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-tertiary)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                            <Icon size={16} /> {label}
                        </div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {loading ? '…' : value}
                        </div>
                    </div>
                ))}
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button onClick={onManageBusinesses} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                    <Building2 size={15} /> Manage Businesses
                </button>
                <button onClick={onManagePlans} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                    <Layers size={15} /> Manage Plans
                </button>
            </div>
        </>
    );
}

// ─── Edit Subscription modal ──────────────────────────────────────────────────
function EditSubscriptionModal({
    row, plans, saving, planExists, onSave, onClose,
}: {
    row: TenantRow;
    plans: Record<string, Plan>;
    saving: boolean;
    planExists: (id: PlanId) => boolean;
    onSave: (row: TenantRow, planId: PlanId, status: SubscriptionStatus) => void;
    onClose: () => void;
}) {
    const [planId, setPlanId] = useState<PlanId>((row.subscription?.planId as PlanId) || 'retailer');
    const [status, setStatus] = useState<SubscriptionStatus>(row.subscription?.status || 'active');

    const dirty = planId !== row.subscription?.planId || status !== row.subscription?.status;
    const current = row.subscription;

    return (
        <div
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
        >
            <div onClick={e => e.stopPropagation()} className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.2rem' }}>Edit Subscription</h2>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{row.businessName}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{row.tenantId}</div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0.2rem' }}>
                        <X size={20} />
                    </button>
                </div>

                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-secondary)' }}>Plan</label>
                <select className="input-field" style={{ width: '100%', marginBottom: '1rem' }} value={planId} onChange={e => setPlanId(e.target.value as PlanId)}>
                    {PLAN_ORDER.map(id => (
                        <option key={id} value={id} disabled={!planExists(id)}>
                            {plans[id]?.name || (id.charAt(0).toUpperCase() + id.slice(1))}{planExists(id) ? '' : ' (not seeded)'}
                        </option>
                    ))}
                </select>

                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-secondary)' }}>Status</label>
                <select className="input-field" style={{ width: '100%', marginBottom: '1.5rem' }} value={status} onChange={e => setStatus(e.target.value as SubscriptionStatus)}>
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                    <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>Cancel</button>
                    <button
                        onClick={() => onSave(row, planId, status)}
                        disabled={saving || !dirty || !planExists(planId)}
                        className="btn btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', opacity: (saving || !dirty || !planExists(planId)) ? 0.55 : 1 }}
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {current ? 'Update' : 'Assign'}
                    </button>
                </div>
            </div>
        </div>
    );
}
