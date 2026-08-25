import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot, collection } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { DEFAULT_FEATURE_PERMISSIONS, type FeaturePermissions } from '../utils/featurePermissions';

// 'retailer' is a read-only portal for shops that buy FROM this tenant (see
// RETAILER_ALLOWED_PATHS in App.tsx). 'shopkeeper' is the opposite: a shop owner
// running their own tenant on the KrishiDukan basic plan.
export type BuiltInRole = 'admin' | 'analyst' | 'retailer' | 'shopkeeper' | 'manufacturer' | 'customer' | 'sales';
// Admins can define custom, tenant-scoped roles (see settings/customRoles). Their
// ids are arbitrary strings, so UserRole widens to accept any string while keeping
// autocomplete for the built-ins. 'admin' is never a custom/assignable-as-custom role.
export type UserRole = BuiltInRole | (string & {});

// A tenant-defined custom role. Permissions live in the existing
// settings/rolePermissions and settings/featurePermissions docs keyed by `id`.
export interface CustomRole {
    id: string;
    label: string;
    template?: BuiltInRole;
    createdAt?: any;
}

interface TenantData {
    businessName: string;
    logoUrl?: string;
    location?: string;
    purpose?: string;
    plan?: string;
    planStatus?: string;
    planExpiryAt?: any;
}

export type AppScreen =
    | 'dashboard'
    | 'b2c_dashboard'
    | 'retailers'
    | 'worklist'
    | 'khata'
    | 'dispatch'
    | 'pos'
    | 'inventory'
    | 'settings'
    | 'manage_retailers'
    | 'admin'
    | 'invoice_settings'
    | 'schema_builder'
    | 'invoice_templates'
    | 'manufacturers'
    | 'order_history'
    | 'online_orders'
    | 'online_dashboard'
    | 'manage_store'
    | 'analytics'
    | 'krishidukan'
    | 'loyalty'
    // ── Finance operations (HighRadius-style O2C + S2P) ──
    | 'accounts'
    | 'ar'
    | 'ap'
    | 'cash'
    | 'credit'
    | 'collections'
    | 'disputes'
    | 'promotions'
    | 'contracts'
    | 'finance_analytics'
    | 'expenses'
    | 'audit_log'
    | 'customers';

export type RolePermissions = Record<UserRole, Record<AppScreen, boolean>>;
export const defaultPermissions: RolePermissions = {
    admin: { dashboard: true, b2c_dashboard: true, online_dashboard: true, analytics: true, retailers: true, worklist: true, khata: true, dispatch: true, pos: true, inventory: true, online_orders: true, order_history: true, settings: true, admin: true, manufacturers: true, invoice_templates: true, invoice_settings: true, schema_builder: true, manage_retailers: true, manage_store: true, krishidukan: true, loyalty: true, accounts: true, ar: true, ap: true, cash: true, credit: true, collections: true, disputes: true, promotions: true, contracts: true, finance_analytics: true, expenses: true, audit_log: true, customers: true },
    analyst: { dashboard: true, b2c_dashboard: true, online_dashboard: true, analytics: true, retailers: true, worklist: true, khata: true, dispatch: true, pos: true, inventory: true, online_orders: false, order_history: true, settings: true, admin: false, manufacturers: false, invoice_templates: false, invoice_settings: false, schema_builder: false, manage_retailers: false, manage_store: false, krishidukan: false, loyalty: true, accounts: true, ar: true, ap: true, cash: true, credit: true, collections: true, disputes: true, promotions: true, contracts: true, finance_analytics: true, expenses: true, audit_log: false, customers: true },
    sales: { dashboard: false, b2c_dashboard: false, online_dashboard: false, analytics: false, retailers: false, worklist: true, khata: false, dispatch: false, pos: false, inventory: false, online_orders: false, order_history: false, settings: false, admin: false, manufacturers: false, invoice_templates: false, invoice_settings: false, schema_builder: false, manage_retailers: false, manage_store: false, krishidukan: false, loyalty: false, accounts: false, ar: false, ap: false, cash: false, credit: false, collections: false, disputes: false, promotions: false, contracts: false, finance_analytics: false, expenses: false, audit_log: false, customers: false },
    retailer: { dashboard: false, b2c_dashboard: false, online_dashboard: false, analytics: false, retailers: false, worklist: true, khata: false, dispatch: false, pos: false, inventory: false, online_orders: false, order_history: false, settings: true, admin: false, manufacturers: false, invoice_templates: false, invoice_settings: false, schema_builder: false, manage_retailers: false, manage_store: false, krishidukan: false, loyalty: false, accounts: false, ar: false, ap: false, cash: false, credit: false, collections: false, disputes: false, promotions: false, contracts: false, finance_analytics: false, expenses: false, audit_log: false, customers: false },
    // KrishiDukan basic plan. invoice_settings is on because GST billing without the
    // shop's own name and GSTIN on the invoice is not usable. The enterprise finance
    // suite (ar/ap/cash/credit/collections/…), schema builder and admin tools stay off.
    shopkeeper: { dashboard: false, b2c_dashboard: true, online_dashboard: true, analytics: true, retailers: false, worklist: true, khata: true, dispatch: false, pos: true, inventory: true, online_orders: true, order_history: true, settings: true, admin: false, manufacturers: false, invoice_templates: false, invoice_settings: true, schema_builder: false, manage_retailers: false, manage_store: false, krishidukan: true, loyalty: false, accounts: false, ar: false, ap: false, cash: false, credit: false, collections: false, disputes: false, promotions: false, contracts: false, finance_analytics: false, expenses: false, audit_log: false, customers: true },
    manufacturer: { dashboard: false, b2c_dashboard: false, online_dashboard: false, analytics: false, retailers: false, worklist: false, khata: false, dispatch: false, pos: false, inventory: false, online_orders: false, order_history: false, settings: true, admin: false, manufacturers: false, invoice_templates: false, invoice_settings: false, schema_builder: false, manage_retailers: false, manage_store: false, krishidukan: false, loyalty: false, accounts: false, ar: false, ap: false, cash: false, credit: false, collections: false, disputes: false, promotions: false, contracts: false, finance_analytics: false, expenses: false, audit_log: false, customers: false },
    customer: { dashboard: false, b2c_dashboard: false, online_dashboard: false, analytics: false, retailers: false, worklist: false, khata: false, dispatch: false, pos: false, inventory: false, online_orders: false, order_history: false, settings: true, admin: false, manufacturers: false, invoice_templates: false, invoice_settings: false, schema_builder: false, manage_retailers: false, manage_store: false, krishidukan: false, loyalty: false, accounts: false, ar: false, ap: false, cash: false, credit: false, collections: false, disputes: false, promotions: false, contracts: false, finance_analytics: false, expenses: false, audit_log: false, customers: false }
};

interface AuthContextType {
    currentUser: User | null;
    userRole: UserRole | null;
    tenantId: string | null;
    tenantData: TenantData | null;
    linkedId: string | null;
    userName: string | null;
    permissions: RolePermissions;
    featurePermissions: FeaturePermissions;
    customRoles: CustomRole[];
    // Per-role landing page after login (path), configurable by admins. Empty/missing
    // means "use the built-in default" (see App.tsx role-based redirect).
    roleLandingPages: Record<string, string>;
    loading: boolean;
    logout: () => Promise<void>;
    // District-based and retailer-based access for sales role
    assignedDistricts: string[];
    assignedRetailers: string[];
    // Module system
    enabledModules: string[];
    tenantPlan: string;
    modulesLoading: boolean;
    hasModule: (moduleId: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({
    currentUser: null,
    userRole: null,
    tenantId: null,
    tenantData: null,
    linkedId: null,
    userName: null,
    permissions: defaultPermissions,
    featurePermissions: DEFAULT_FEATURE_PERMISSIONS,
    customRoles: [],
    roleLandingPages: {},
    loading: true,
    logout: async () => { },
    assignedDistricts: [],
    assignedRetailers: [],
    enabledModules: [],
    tenantPlan: 'free',
    modulesLoading: true,
    hasModule: () => false,
});

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const [tenantId, setTenantId] = useState<string | null>(null);
    const [tenantData, setTenantData] = useState<TenantData | null>(null);
    const [linkedId, setLinkedId] = useState<string | null>(null);
    const [userName, setUserName] = useState<string | null>(null);
    const [permissions, setPermissions] = useState<RolePermissions>(defaultPermissions);
    const [featurePermissions, setFeaturePermissions] = useState<FeaturePermissions>(DEFAULT_FEATURE_PERMISSIONS);
    const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
    const [roleLandingPages, setRoleLandingPages] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [assignedDistricts, setAssignedDistricts] = useState<string[]>([]);
    const [assignedRetailers, setAssignedRetailers] = useState<string[]>([]);
    const [enabledModules, setEnabledModules] = useState<string[]>([]);
    const [tenantPlan, setTenantPlan] = useState<string>('free');
    const [modulesLoading, setModulesLoading] = useState(true);

    useEffect(() => {
        let unsubscribePerms: (() => void) | null = null;
        let unsubscribeModules: (() => void) | null = null;

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const userDocRef = doc(db, 'users', user.uid);
                    const userDoc = await getDoc(userDocRef);
                    const emailLC = user.email?.toLowerCase() || '';
                    
                    const MASTER_ADMIN_EMAILS = [
                        'arjuntanpure@karanarjun.com',
                        'arjutanpure@karanarjun.com',
                        'arjun1829@karanarjun.com',
                        'karanarjun@karanarjun.com',
                        'arjutanpure@gmail.com'
                    ];
                    const isMasterAdmin = MASTER_ADMIN_EMAILS.includes(emailLC);

                    let existingRole = userDoc.exists() ? (userDoc.data().role as UserRole) : null;
                    let existingTenantId = userDoc.exists() ? userDoc.data().tenantId : null;

                    let role: UserRole = isMasterAdmin ? 'admin' : (existingRole || 'analyst');
                    let tId = isMasterAdmin ? (existingTenantId && existingTenantId !== 'master' ? existingTenantId : 'master') : existingTenantId;
                    let lId: string | null = userDoc.exists() ? (userDoc.data().linkedId || null) : null;

                    // Avoid unnecessary writes for master admin if doc already exists
                    if (!userDoc.exists()) {
                        await setDoc(userDocRef, {
                            email: user.email,
                            name: user.displayName || user.email?.split('@')[0] || 'Member',
                            role: role,
                            tenantId: tId,
                            linkedId: lId,
                            updatedAt: serverTimestamp(),
                            createdAt: serverTimestamp()
                        }, { merge: true });
                    }

                    setUserRole(role);
                    setTenantId(tId);
                    setLinkedId(lId);
                    setAssignedDistricts(userDoc.exists() ? (userDoc.data().assignedDistricts || []) : []);
                    setAssignedRetailers(userDoc.exists() ? (userDoc.data().assignedRetailers || []) : []);

                    // Priority: Firestore name -> Auth displayName -> Email prefix
                    const resolvedName = userDoc.exists() 
                        ? (userDoc.data().name || user.displayName || user.email?.split('@')[0] || null)
                        : (user.displayName || user.email?.split('@')[0] || null);
                    
                    setUserName(resolvedName);

                    if (tId && tId !== 'master') {
                        const tenantDoc = await getDoc(doc(db, 'tenants', tId));
                        if (tenantDoc.exists()) {
                            setTenantData(tenantDoc.data() as TenantData);
                        }
                    } else if (tId === 'master') {
                        setTenantData({ businessName: 'KaranArjun' });
                    }

                    // Fetch or Initialize Role Permissions
                    if (tId) {
                        try {
                            const [getTenantDoc] = await Promise.all([
                                import('../utils/tenantPath').then(m => m.getTenantDoc)
                            ]);
                            const permDocRef = getTenantDoc(db, tId, 'settings', 'rolePermissions');

                            if (unsubscribePerms) unsubscribePerms();

                            unsubscribePerms = onSnapshot(permDocRef, async (permDoc) => {
                                if (permDoc.exists() && Object.keys(permDoc.data() || {}).length > 0) {
                                    const fetchedPerms = permDoc.data() as RolePermissions;
                                    const mergedPerms: any = { ...defaultPermissions };

                                    for (const [r, pObj] of Object.entries(fetchedPerms)) {
                                        mergedPerms[r] = {
                                            ...(defaultPermissions[r as UserRole] || {}),
                                            ...pObj
                                        };
                                    }
                                    setPermissions(mergedPerms as RolePermissions);
                                } else {
                                    await setDoc(permDocRef, defaultPermissions);
                                    // Snapshot will trigger again automatically after setDoc
                                }
                            }, (_err) => {
                                setPermissions(defaultPermissions);
                            });

                            // Feature-level permissions (granular action/section control)
                            const featPermDocRef = getTenantDoc(db, tId, 'settings', 'featurePermissions');
                            onSnapshot(featPermDocRef, async (snap) => {
                                if (snap.exists() && Object.keys(snap.data() || {}).length > 0) {
                                    const fetched = snap.data() as FeaturePermissions;
                                    const merged: FeaturePermissions = { ...DEFAULT_FEATURE_PERMISSIONS };
                                    for (const [r, pMap] of Object.entries(fetched)) {
                                        merged[r as UserRole] = {
                                            ...(DEFAULT_FEATURE_PERMISSIONS[r as UserRole] || {}),
                                            ...(pMap as Record<string, boolean>),
                                        };
                                    }
                                    setFeaturePermissions(merged);
                                } else {
                                    await setDoc(featPermDocRef, DEFAULT_FEATURE_PERMISSIONS);
                                }
                            }, (_err) => {
                                setFeaturePermissions(DEFAULT_FEATURE_PERMISSIONS);
                            });

                            // Tenant-defined custom roles (admin-created). Their granular
                            // + module permissions live in the featurePermissions /
                            // rolePermissions docs above, keyed by the custom role id.
                            const customRolesDocRef = getTenantDoc(db, tId, 'settings', 'customRoles');
                            onSnapshot(customRolesDocRef, (snap) => {
                                const list = (snap.exists() ? snap.data()?.roles : null);
                                setCustomRoles(Array.isArray(list) ? (list as CustomRole[]) : []);
                            }, (_err) => {
                                setCustomRoles([]);
                            });

                            // Per-role landing pages (admin-configurable).
                            const landingDocRef = getTenantDoc(db, tId, 'settings', 'roleLandingPages');
                            onSnapshot(landingDocRef, (snap) => {
                                const data = (snap.exists() ? snap.data() : null) || {};
                                const { updatedAt: _ua, ...map } = data as Record<string, any>;
                                setRoleLandingPages(map as Record<string, string>);
                            }, (_err) => {
                                setRoleLandingPages({});
                            });
                        } catch (permErr) {
                            console.error("Error fetching permissions", permErr);
                            setPermissions(defaultPermissions);
                        }

                        // Subscribe to tenant's purchased modules
                        try {
                            const tenantSnap = await getDoc(doc(db, 'tenants', tId));
                            setTenantPlan(tenantSnap.data()?.plan || 'free');

                            if (unsubscribeModules) unsubscribeModules();
                            const modulesColRef = collection(db, 'tenants', tId, 'modules');
                            unsubscribeModules = onSnapshot(modulesColRef, (snap) => {
                                const now = new Date();
                                const active = snap.docs
                                    .filter(d => {
                                        const data = d.data();
                                        if (!['active', 'cancelled_at_period_end'].includes(data.status)) return false;
                                        if (data.expiresAt && data.expiresAt.toDate() < now) return false;
                                        return true;
                                    })
                                    .map(d => d.id);
                                setEnabledModules(active);
                                setModulesLoading(false);
                            }, (_err) => {
                                // permission-denied on free/unauthenticated tenants — silent fallback
                                setModulesLoading(false);
                            });
                        } catch (modErr) {
                            console.error("Error fetching modules", modErr);
                            setModulesLoading(false);
                        }
                    } else {
                        if (unsubscribePerms) {
                            unsubscribePerms();
                            unsubscribePerms = null;
                        }
                        setModulesLoading(false);
                    }

                } catch (error) {
                    console.error("Error fetching user role:", error);
                    
                    // Fallback to ensure owner never gets locked out
                    const emailLC = user.email?.toLowerCase() || '';
                    const isMasterAdmin = emailLC.includes('arjuntanpure') || emailLC.includes('arjutanpure') || emailLC.includes('arjun1829') || emailLC.includes('karanarjun');
                    
                    setUserRole(isMasterAdmin ? 'admin' : 'analyst');
                    if (isMasterAdmin) {
                        setTenantId('master');
                        setTenantData({ businessName: 'KaranArjun' });
                    } else {
                        setTenantId(null);
                        setTenantData(null);
                    }
                    setAssignedDistricts([]);
                    setAssignedRetailers([]);
                    setPermissions(defaultPermissions);
                }
            } else {
                setUserRole(null);
                setTenantId(null);
                setTenantData(null);
                setLinkedId(null);
                setAssignedDistricts([]);
                setAssignedRetailers([]);
                setPermissions(defaultPermissions);
                setFeaturePermissions(DEFAULT_FEATURE_PERMISSIONS);
                setCustomRoles([]);
                setRoleLandingPages({});
            }
            setCurrentUser(user);
            setLoading(false);
        });

        return () => {
            unsubscribe();
            if (unsubscribePerms) unsubscribePerms();
            if (unsubscribeModules) unsubscribeModules();
        };
    }, []);

    const logout = () => {
        return signOut(auth);
    };

    const hasModule = (moduleId: string): boolean => enabledModules.includes(moduleId);

    const value = {
        currentUser,
        userRole,
        tenantId,
        tenantData,
        linkedId,
        userName,
        permissions,
        featurePermissions,
        customRoles,
        roleLandingPages,
        loading,
        logout,
        assignedDistricts,
        assignedRetailers,
        enabledModules,
        tenantPlan,
        modulesLoading,
        hasModule,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
