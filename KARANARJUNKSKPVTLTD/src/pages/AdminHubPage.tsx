import { useEffect } from 'react';
import {
    UserCog, Shield, TrendingUp, Target, Lock, ShieldAlert, Users,
    Palette, Store, Factory, Layers, Database,
} from 'lucide-react';
import { useHashTab } from '../hooks/useHashTab';
import { useAuth } from '../contexts/AuthContext';
import type { AppScreen, UserRole } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';

// Sub-pages rendered inside the Admin hub. AdminHubPage itself is lazy-loaded by
// App.tsx, so these direct imports keep the whole Admin area in one chunk —
// consistent with InventoryPage's in-page tab pattern.
import AdminPage from './AdminPage';
import AuditLogPage from './AuditLogPage';
import TeamPerformancePage from './TeamPerformancePage';
import SalesTargetsAdminPage from './SalesTargetsAdminPage';
import DataSecurityPage from './DataSecurityPage';
import ManageRolesPage from './ManageRolesPage';
import ManageRetailersPage from './ManageRetailersPage';
import InvoiceSettingsPage from './InvoiceSettingsPage';
import AdminStoreProductsPage from './AdminStoreProductsPage';
import ManufacturersPage from './ManufacturersPage';
import InvoiceTemplateBuilderPage from './InvoiceTemplateBuilderPage';
import SchemaBuilderPage from './SchemaBuilderPage';

// ─── Tab definitions ──────────────────────────────────────────────────────────
// `id` is the URL hash (/admin#<id>). `requireRole` + `appScreen` mirror the
// exact gating each sub-page had as its own route, so permissions are preserved.

type AdminTab = {
    id: string;
    label: string;
    icon: React.ReactNode;
    requireRole: UserRole[];
    appScreen: AppScreen;
    Comp: React.ComponentType;
};

const ADMIN_TABS: AdminTab[] = [
    { id: 'manage-users',      label: 'Manage Users',      icon: <UserCog size={16} />,     requireRole: ['admin'],            appScreen: 'admin',             Comp: AdminPage },
    { id: 'audit-log',         label: 'Audit Log',         icon: <Shield size={16} />,      requireRole: ['admin'],            appScreen: 'audit_log',         Comp: AuditLogPage },
    { id: 'team-performance',  label: 'Team Performance',  icon: <TrendingUp size={16} />,  requireRole: ['admin'],            appScreen: 'admin',             Comp: TeamPerformancePage },
    { id: 'sales-target',      label: 'Sales Target',      icon: <Target size={16} />,      requireRole: ['admin'],            appScreen: 'admin',             Comp: SalesTargetsAdminPage },
    { id: 'data-security',     label: 'Data Security',     icon: <Lock size={16} />,        requireRole: ['admin'],            appScreen: 'admin',             Comp: DataSecurityPage },
    { id: 'role-matrix',       label: 'Role Matrix',       icon: <ShieldAlert size={16} />, requireRole: ['admin'],            appScreen: 'admin',             Comp: ManageRolesPage },
    { id: 'manage-retailers',  label: 'Manage Retailers',  icon: <Users size={16} />,       requireRole: ['admin', 'analyst'], appScreen: 'manage_retailers',  Comp: ManageRetailersPage },
    { id: 'invoice-branding',  label: 'Invoice Branding',  icon: <Palette size={16} />,     requireRole: ['admin', 'analyst'], appScreen: 'invoice_settings',  Comp: InvoiceSettingsPage },
    { id: 'manage-store',      label: 'Manage Store',      icon: <Store size={16} />,       requireRole: ['admin', 'analyst'], appScreen: 'manage_store',      Comp: AdminStoreProductsPage },
    { id: 'manufacturers',     label: 'Manufacturers',     icon: <Factory size={16} />,     requireRole: ['admin', 'analyst'], appScreen: 'manufacturers',     Comp: ManufacturersPage },
    { id: 'invoice-templates', label: 'Invoice Templates', icon: <Layers size={16} />,      requireRole: ['admin', 'analyst'], appScreen: 'invoice_templates', Comp: InvoiceTemplateBuilderPage },
    { id: 'schema-builder',    label: 'UI Layout Builder', icon: <Database size={16} />,    requireRole: ['admin', 'analyst'], appScreen: 'schema_builder',    Comp: SchemaBuilderPage },
];

const VALID_TABS: readonly string[] = ADMIN_TABS.map(t => t.id);

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminHubPage() {
    const { userRole, permissions } = useAuth();
    const [activeTab, setActiveTab] = useHashTab<string>(VALID_TABS, 'manage-users', 'fiinny-tab-admin');

    // Only show tabs the current role/permissions allow — mirrors the nav filter.
    const visibleTabs = ADMIN_TABS.filter(t => {
        if (!userRole) return false;
        if (!t.requireRole.includes(userRole as UserRole)) return false;
        if (permissions && permissions[userRole] && !permissions[userRole][t.appScreen]) return false;
        return true;
    });

    // If the resolved tab isn't accessible (e.g. analyst opening /admin with no
    // hash defaults to manage-users), fall to the first tab they can see.
    useEffect(() => {
        if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === activeTab) && !window.location.hash) {
            setActiveTab(visibleTabs[0].id);
        }
    }, [visibleTabs, activeTab, setActiveTab]);

    const active = ADMIN_TABS.find(t => t.id === activeTab) ?? ADMIN_TABS[0];
    const ActiveComp = active.Comp;

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1400px', margin: '0 auto' }}>

            {/* ── Sticky Tab Bar ── */}
            <div
                style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 50,
                    background: 'var(--surface-base)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    display: 'flex',
                    gap: '0.25rem',
                    borderBottom: '2px solid var(--surface-border)',
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                    marginLeft: '-2rem',
                    marginRight: '-2rem',
                    paddingLeft: '2rem',
                    paddingRight: '2rem',
                    marginTop: '-2rem',
                    paddingTop: '0.75rem',
                    marginBottom: '1.75rem',
                }}
            >
                {visibleTabs.map(tab => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.65rem 1.25rem',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: isActive ? '2px solid var(--primary-light)' : '2px solid transparent',
                                marginBottom: '-2px',
                                color: isActive ? 'var(--primary-light)' : 'var(--text-tertiary)',
                                fontWeight: isActive ? 700 : 400,
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                whiteSpace: 'nowrap',
                                transition: 'color 0.15s ease, border-color 0.15s ease',
                                flexShrink: 0,
                            }}
                            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
                            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; }}
                        >
                            <span style={{ opacity: isActive ? 1 : 0.6, display: 'flex' }}>{tab.icon}</span>
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ── Tab Content — wrapped in the same gate the sub-page had as a route ── */}
            <ProtectedRoute requireRole={active.requireRole} appScreen={active.appScreen}>
                <ActiveComp />
            </ProtectedRoute>
        </div>
    );
}
