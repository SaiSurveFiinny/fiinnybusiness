import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { useHashTab } from '../hooks/useHashTab';
import { useNavigate } from 'react-router-dom';
import {
    Download, Store, Search, Filter, ArrowUpDown,
    Users, Building2, UserPlus, Calendar,
    Bell, ShoppingCart, Truck, Mail, MessageSquare, Wallet,
    X, Copy, CheckSquare, FileText, ChevronDown, ChevronRight, Phone, Clock,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getDocs, orderBy, query, where, collectionGroup, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import UdhariUploadModal from '../components/UdhariUploadModal';
import { type FinancialPeriod, getFinancialDateRange } from '../utils/financialPeriod';

// Import sub-pages directly (WorklistPage itself is lazy-loaded by App.tsx)
import PaymentRemindersPage from './PaymentRemindersPage';
import AllPaymentsPage from './AllPaymentsPage';
import OnlineOrdersPage from './OnlineOrdersPage';
import DispatchBoardPage from './DispatchBoardPage';
// TEMPORARILY DISABLED (2026-07-03): Worklist → Purchase Orders is incomplete/broken.
// Hidden until rebuilt — do not delete. Re-enable by restoring this import and the
// tab entry/render below. Unrelated to Supplier Ledger → Purchase Orders, which uses
// its own PurchaseOrderModal component and is unaffected by this change.
// import PurchaseOrdersPage from './PurchaseOrdersPage';
import B2BInvoiceWorklistPage from './B2BInvoiceWorklistPage';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A salesOrder that should still count toward a retailer's figures.
 *
 * Bills can be soft-deleted (`deleted: true`) or cancelled (`status:
 * 'cancelled'`) from Digital Khata. Both of those pages already exclude them —
 * DigitalKhataPage when it builds its entry list, and POSPage in
 * fetchLiveOutstanding — but this page did not, so a cancelled bill kept
 * inflating Total Sales, Total Invoice Value and outstanding here while
 * disappearing everywhere else. POS's own comment promises the invoice figure
 * cannot diverge from the Khata worklist balance; this keeps that true.
 */
const isLiveSalesOrder = (so: { status?: string; deleted?: boolean }): boolean =>
    !so.deleted && String(so.status ?? '').toLowerCase() !== 'cancelled';

interface Retailer {
    id: string;
    name?: string;
    location?: string;
    district?: string;
    taluka?: string;
    atPost?: string;
    number?: string;
    alternateNumber?: string;
    portfolioSize?: string;
    email?: string;
    bookName?: string;
    billBookPageNo?: string;
    createdAt?: { toMillis?: () => number };
    // Denormalized financial fields kept in sync by all invoice/payment mutations
    outstandingAmount?: number;
    totalSales?: number;
    totalPaid?: number;
    closestCreditDays?: number | null;
    computedOutstanding?: number;
    // Live per-retailer totals — same formula as WorklistDetailsPage's
    // computedTotalSales/computedTotalPaid (sum of live salesOrders / all payments).
    computedTotalSales?: number;
    computedTotalPaid?: number;
    assignedSalespersons?: string[];
}

interface ReminderEntry {
    id: string;
    name: string;
    number?: string;
    email?: string;
    pendingAmount: number;
    pendingOrderCount: number;
    closestCreditDays: number | null;
}

// 'purchase-orders' removed from the union — TEMPORARILY DISABLED (2026-07-03), see note above.
// Tab IDs are URL-hash-safe slugs. Renames: tracking-info→tracking. The 'payments' hash now
// drives the global All Payments view; Payment Reminders moved to the 'reminders' hash.
type ModuleTab = 'partners' | 'invoices' | 'payments' | 'reminders' | 'tracking' | 'online-orders' /* | 'purchase-orders' */;
const VALID_TABS: readonly ModuleTab[] = ['partners', 'invoices', 'payments', 'reminders', 'tracking', 'online-orders'];
type WLSortCol = 'name' | 'district' | 'salesperson' | 'contact' | 'outstanding' | 'totalSales' | 'date';

// Partner Worklist's date filter — a subset of FinancialPeriod (no 'fy', which this
// filter doesn't expose) driving both the dropdown options and its trigger label.
const WORKLIST_DATE_FILTER_OPTIONS: [FinancialPeriod, string][] = [
    ['today',  'Today'],
    ['week',   'This Week'],
    ['month',  'This Month'],
    ['all',    'All Time'],
    ['custom', 'Custom Range'],
];
const WORKLIST_DATE_FILTER_LABELS: Record<FinancialPeriod, string> =
    Object.fromEntries(WORKLIST_DATE_FILTER_OPTIONS) as Record<FinancialPeriod, string>;

const MODULE_TABS: { id: ModuleTab; label: string; icon: React.ReactNode }[] = [
    { id: 'partners',      label: 'Partners',          icon: <Building2 size={16} /> },
    { id: 'invoices',      label: 'Invoices',          icon: <FileText size={16} /> },
    { id: 'payments',      label: 'Payments',          icon: <Wallet size={16} /> },
    { id: 'reminders',     label: 'Payment Reminders', icon: <Bell size={16} /> },
    { id: 'tracking',      label: 'Tracking Info',     icon: <Truck size={16} /> },
    { id: 'online-orders', label: 'Online Orders',     icon: <ShoppingCart size={16} /> },
    // TEMPORARILY DISABLED (2026-07-03): Purchase Orders tab hidden until rebuilt — do not delete.
    // { id: 'purchase-orders', label: 'Purchase Orders', icon: <ShoppingCart size={16} /> },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorklistPage() {
    const [moduleTab, setModuleTab] = useHashTab<ModuleTab>(VALID_TABS, 'partners', 'fiinny-tab-worklist');
    const { userRole } = useAuth();

    const visibleTabs = MODULE_TABS.filter(tab => {
        if (userRole === 'sales' && tab.id === 'online-orders') return false;
        if (userRole === 'retailer' && (tab.id === 'online-orders' || tab.id === 'tracking')) return false;
        return true;
    });

    return (
        <div className="animate-fade-in" style={{ width: '100%' }}>
            {/* ── Tab Bar ── */}
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
                    const active = moduleTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setModuleTab(tab.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.65rem 1.25rem',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: active
                                    ? '2px solid var(--primary-light)'
                                    : '2px solid transparent',
                                marginBottom: '-2px',
                                color: active ? 'var(--primary-light)' : 'var(--text-tertiary)',
                                fontWeight: active ? 700 : 400,
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.15s ease',
                                borderRadius: '0',
                            }}
                        >
                            <span style={{ opacity: active ? 1 : 0.6 }}>{tab.icon}</span>
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ── Tab Content ── */}
            {moduleTab === 'partners'      && <PartnersTab />}
            {moduleTab === 'invoices'      && <B2BInvoiceWorklistPage />}
            {moduleTab === 'payments'      && <AllPaymentsPage />}
            {moduleTab === 'reminders'     && <PaymentRemindersPage />}
            {moduleTab === 'tracking'      && <DispatchBoardPage />}
            {moduleTab === 'online-orders' && <OnlineOrdersPage />}
            {/* TEMPORARILY DISABLED (2026-07-03): Purchase Orders tab content hidden until rebuilt — do not delete. */}
            {/* {moduleTab === 'purchase-orders' && <PurchaseOrdersPage />} */}
        </div>
    );
}

// ─── Partners Tab (former WorklistPage content) ───────────────────────────────

function PartnersTab() {
    const navigate = useNavigate();
    const { tenantId, userRole, assignedDistricts, assignedRetailers } = useAuth();
    const isSales = userRole === 'sales';
    const isRetailer = userRole === 'retailer';
    const isViewOnly = isSales || isRetailer;
    const { t } = useTranslation();
    const [retailers, setRetailers] = useState<Retailer[]>([]);
    const [loading, setLoading] = useState(true);
    const [showUdhariModal, setShowUdhariModal] = useState(false);

    // Raw dated sales/payment entries per retailer — kept alongside `retailers`
    // (which carries the already-computed all-time financials) so the date
    // filter can recompute computedTotalSales/computedTotalPaid/computedOutstanding
    // for a range without a second Firestore read.
    const [sosByRetailer, setSosByRetailer] = useState<Map<string, { invoiceDate?: string; grandTotal?: number; netAmount?: number; totalAmount?: number }[]>>(new Map());
    const [pmtsByRetailer, setPmtsByRetailer] = useState<Map<string, { amount: number; paymentDate?: string }[]>>(new Map());
    const [financialPeriod, setFinancialPeriod] = useState<FinancialPeriod>('all');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [showDateDropdown, setShowDateDropdown] = useState(false);
    const dateDropdownRef = useRef<HTMLDivElement>(null);

    // Close the date filter dropdown on any click outside it.
    useEffect(() => {
        if (!showDateDropdown) return;
        const onDown = (e: MouseEvent) => {
            if (dateDropdownRef.current?.contains(e.target as Node)) return;
            setShowDateDropdown(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [showDateDropdown]);

    const [searchTerm, setSearchTerm] = useState('');
    const [filterSize, setFilterSize] = useState('All');
    const [colSort, setColSort] = useState<{ col: WLSortCol; dir: 'asc' | 'desc' }>({ col: 'date', dir: 'desc' });
    const [partnerView, setPartnerView] = useState<'all' | 'active' | 'cleared'>('all');


    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const toggleExpand = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    };
    const [spTooltip, setSpTooltip] = useState<string | null>(null);

    // ── Selection & bulk correspondence ──────────────────────────────────────
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showReminderModal, setShowReminderModal] = useState(false);
    const [reminderData, setReminderData] = useState<ReminderEntry[]>([]);
    const [loadingReminders, setLoadingReminders] = useState(false);

    const handleSelectionChange = (id: string, selected: boolean) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (selected) next.add(id); else next.delete(id);
            return next;
        });
    };

    const handleSelectAll = () =>
        setSelectedIds(new Set(processedRetailers.map(r => r.id)));

    const handleClearSelection = () => setSelectedIds(new Set());

    const handleSendReminder = async () => {
        if (!tenantId || selectedIds.size === 0) return;
        setLoadingReminders(true);
        try {
            const selected = processedRetailers.filter(r => selectedIds.has(r.id));
            const entries: ReminderEntry[] = await Promise.all(
                selected.map(async (r) => {
                    const q = query(
                        getTenantCollection(db, tenantId, 'salesOrders'),
                        where('retailerId', '==', r.id)
                    );
                    const snap = await getDocs(q);
                    const pendingOrderCount = snap.docs
                        .filter(d => {
                            const so = d.data() as { paymentStatus?: string; status?: string; deleted?: boolean };
                            return isLiveSalesOrder(so) && so.paymentStatus?.toLowerCase() !== 'paid';
                        })
                        .length;
                    // Use total outstanding (Total Sales − Total Payments Received).
                    // r.computedOutstanding already reflects all received payments,
                    // not just those linked to specific invoices.
                    const pendingAmount = r.computedOutstanding ?? 0;
                    return {
                        id: r.id,
                        name: r.name || '—',
                        number: r.number,
                        email: r.email,
                        pendingAmount,
                        pendingOrderCount,
                        closestCreditDays: r.closestCreditDays ?? null,
                    };
                })
            );
            setReminderData(entries);
            setShowReminderModal(true);
        } finally {
            setLoadingReminders(false);
        }
    };

    useEffect(() => {
        const fetchRetailers = async () => {
            if (!tenantId) return;
            try {
                // 4 parallel reads — retailers, salesOrders, payments (collection group),
                // and sales users (for the Assigned Salesperson column).
                const isMasterTenant = tenantId === 'master';
                const [retailersSnap, salesOrdersSnap, paymentsGroupSnap, salesUsersSnap] = await Promise.all([
                    getDocs(query(getTenantCollection(db, tenantId, 'retailers'), orderBy('createdAt', 'desc'))),
                    getDocs(getTenantCollection(db, tenantId, 'salesOrders')),
                    getDocs(collectionGroup(db, 'payments')),
                    getDocs(
                        isMasterTenant
                            ? collection(db, 'users')
                            : query(collection(db, 'users'), where('tenantId', '==', tenantId))
                    ),
                ]);

                // Build retailer → salesperson(s) reverse map from user assignments.
                // Each retailer may have multiple salespersons (district-wide + direct).
                const spByRetailerId = new Map<string, string[]>();
                const spByDistrict   = new Map<string, string[]>();
                salesUsersSnap.docs.forEach(udoc => {
                    const u = udoc.data();
                    if (u.role !== 'sales') return;
                    const spName: string = u.name || '—';
                    (u.assignedRetailers ?? []).forEach((rId: string) => {
                        const arr = spByRetailerId.get(rId) ?? [];
                        if (!arr.includes(spName)) arr.push(spName);
                        spByRetailerId.set(rId, arr);
                    });
                    (u.assignedDistricts ?? []).forEach((d: string) => {
                        const key = d.toLowerCase();
                        const arr = spByDistrict.get(key) ?? [];
                        if (!arr.includes(spName)) arr.push(spName);
                        spByDistrict.set(key, arr);
                    });
                });

                // Sum payment amounts per retailer, filtering strictly to this tenant.
                // getTenantCollection uses two different path layouts depending on tenantId:
                //   master    →  retailers/{retailerId}/payments/{paymentId}        (4 parts)
                //   non-master→  tenants/{tenantId}/retailers/{retailerId}/payments/{paymentId}  (6 parts)
                // The previous filter hard-coded the 6-part form and silently dropped all
                // master-tenant payments, which caused the Outstanding mismatch.
                const paymentsByRetailer = new Map<string, number>();
                const rawPmtsByRetailerMap = new Map<string, { amount: number; paymentDate?: string }[]>();
                paymentsGroupSnap.docs.forEach(pdoc => {
                    const parts = pdoc.ref.path.split('/');
                    let rId: string | undefined;

                    if (isMasterTenant) {
                        // retailers/{retailerId}/payments/{paymentId}
                        if (parts.length === 4 && parts[0] === 'retailers' && parts[2] === 'payments') {
                            rId = parts[1];
                        }
                    } else {
                        // tenants/{tenantId}/retailers/{retailerId}/payments/{paymentId}
                        if (
                            parts.length === 6      &&
                            parts[0] === 'tenants'  &&
                            parts[1] === tenantId   &&
                            parts[2] === 'retailers' &&
                            parts[4] === 'payments'
                        ) {
                            rId = parts[3];
                        }
                    }

                    if (!rId) return;
                    paymentsByRetailer.set(rId, (paymentsByRetailer.get(rId) ?? 0) + Number(pdoc.data().amount ?? 0));
                    const pmtArr = rawPmtsByRetailerMap.get(rId) ?? [];
                    pmtArr.push({ amount: Number(pdoc.data().amount ?? 0), paymentDate: pdoc.data().paymentDate });
                    rawPmtsByRetailerMap.set(rId, pmtArr);
                });

                // Group salesOrders by retailerId (include financial fields for outstanding calc).
                type SOEntry = { invoiceDate?: string; status?: string; paymentStatus?: string; dueDate?: string; grandTotal?: number; netAmount?: number; totalAmount?: number; amountPaid?: number; deleted?: boolean };
                const salesByRetailer = new Map<string, SOEntry[]>();
                salesOrdersSnap.docs.forEach(doc => {
                    const so = doc.data() as { retailerId?: string } & SOEntry;
                    if (!so.retailerId) return;
                    // Filtered at the grouping step so every downstream figure —
                    // total sales, outstanding, due dates, invoice value — sees the
                    // same set of bills.
                    if (!isLiveSalesOrder(so)) return;
                    const arr = salesByRetailer.get(so.retailerId);
                    if (arr) arr.push(so); else salesByRetailer.set(so.retailerId, [so]);
                });

                const today = new Date(); today.setHours(0, 0, 0, 0);

                const retailersWithStatus: Retailer[] = retailersSnap.docs
                    // Exclude B2C walk-in customers auto-created at the POS counter —
                    // they are not B2B partners and shouldn't appear in this worklist.
                    .filter(d => (d.data() as { channel?: string }).channel !== 'pos')
                    .map(doc => {
                    const r = { id: doc.id, ...doc.data() } as Retailer;
                    const salesOrders = salesByRetailer.get(r.id) ?? [];

                    const pendingSOs = salesOrders.filter(so => so.paymentStatus?.toLowerCase() !== 'paid');
                    const dueDates = pendingSOs
                        .map(so => so.dueDate ? new Date(so.dueDate) : null)
                        .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
                    const nearestDue = dueDates.length > 0
                        ? dueDates.sort((a, b) => a.getTime() - b.getTime())[0]
                        : null;
                    const closestCreditDays: number | null = nearestDue !== null
                        ? Math.round((nearestDue.getTime() - today.getTime()) / 864e5)
                        : null;

                    // EXACT same formula as WorklistDetailsPage (retailer profile page):
                    //   computedTotalSales = sum(salesOrder.grandTotal | netAmount | totalAmount)
                    //   computedTotalPaid  = sum(payments.amount) from payments subcollection
                    //   computedOutstanding = max(0, computedTotalSales - computedTotalPaid)
                    // Linked/unlinked status does not matter — every payment entry counts.
                    const soList = salesByRetailer.get(r.id) ?? [];
                    const soTotalSales = soList.reduce((s, so) => s + Number(so.grandTotal ?? so.netAmount ?? so.totalAmount ?? 0), 0);
                    const soTotalPaid  = paymentsByRetailer.get(r.id) ?? 0;
                    const computedOutstanding = Math.max(0, soTotalSales - soTotalPaid);

                    // Merge direct assignments and district-based assignments, deduplicated.
                    // Direct assignments come first so they appear before district-based ones.
                    const directSPs  = spByRetailerId.get(r.id) ?? [];
                    const districtSPs = spByDistrict.get((r.district || '').toLowerCase()) ?? [];
                    const merged = [...directSPs];
                    districtSPs.forEach(sp => { if (!merged.includes(sp)) merged.push(sp); });
                    const assignedSalespersons = merged;
                    return {
                        ...r, closestCreditDays, computedOutstanding, assignedSalespersons,
                        computedTotalSales: soTotalSales, computedTotalPaid: soTotalPaid,
                    };
                });

                // Sales users see retailers matching assignedDistricts OR assignedRetailers (union).
                // Retailer users see only their own shop (exactly one entry in assignedRetailers).
                if (userRole === 'sales') {
                    const lowerDistricts = assignedDistricts.map(d => d.toLowerCase());
                    const retailerIdSet = new Set(assignedRetailers);
                    if (lowerDistricts.length === 0 && retailerIdSet.size === 0) {
                        setRetailers([]); // no access configured
                    } else {
                        setRetailers(retailersWithStatus.filter(r =>
                            lowerDistricts.includes((r.district || '').toLowerCase()) ||
                            retailerIdSet.has(r.id)
                        ));
                    }
                } else if (userRole === 'retailer') {
                    const retailerIdSet = new Set(assignedRetailers);
                    setRetailers(retailerIdSet.size > 0
                        ? retailersWithStatus.filter(r => retailerIdSet.has(r.id))
                        : []
                    );
                } else {
                    setRetailers(retailersWithStatus);
                }
                setSosByRetailer(salesByRetailer);
                setPmtsByRetailer(rawPmtsByRetailerMap);
            } catch (error) {
                console.error('Error fetching retailers: ', error);
            } finally {
                setLoading(false);
            }
        };
        fetchRetailers();
    }, [tenantId, userRole, assignedDistricts.join('|'), assignedRetailers.join('|')]);

    // Recomputes each retailer's computedTotalSales/computedTotalPaid/computedOutstanding
    // scoped to the selected date range, using the exact same formula as the all-time
    // calculation above (sum of live salesOrders' grandTotal|netAmount|totalAmount,
    // sum of payments.amount) — just restricted to entries whose invoiceDate/paymentDate
    // falls inside the range. 'All Time' short-circuits to the already-computed values
    // so no retailer/financial data is recalculated unnecessarily.
    const dateFilteredRetailers = useMemo(() => {
        const range = getFinancialDateRange(financialPeriod, customFrom, customTo);
        if (!range) return retailers;
        const [from, to] = range;
        return retailers.map(r => {
            const soList = sosByRetailer.get(r.id) ?? [];
            const pmtList = pmtsByRetailer.get(r.id) ?? [];
            const totalSales = soList
                .filter(so => { const d = so.invoiceDate || ''; return d >= from && d <= to; })
                .reduce((s, so) => s + Number(so.grandTotal ?? so.netAmount ?? so.totalAmount ?? 0), 0);
            const totalPaid = pmtList
                .filter(p => { const d = p.paymentDate || ''; return d >= from && d <= to; })
                .reduce((s, p) => s + Number(p.amount ?? 0), 0);
            return {
                ...r,
                computedTotalSales: totalSales,
                computedTotalPaid: totalPaid,
                computedOutstanding: Math.max(0, totalSales - totalPaid),
            };
        });
    }, [retailers, sosByRetailer, pmtsByRetailer, financialPeriod, customFrom, customTo]);

    const processedRetailers = useMemo(() => {
        let result = [...dateFilteredRetailers];
        // Outstanding filter — uses Total Sales − Amount Paid (matches profile page)
        if (partnerView === 'active')  result = result.filter(r => (r.computedOutstanding ?? 0) > 0);
        if (partnerView === 'cleared') result = result.filter(r => (r.computedOutstanding ?? 0) <= 0);

        if (searchTerm) {
            const ls = searchTerm.toLowerCase();
            result = result.filter(r =>
                r.name?.toLowerCase().includes(ls) ||
                r.district?.toLowerCase().includes(ls) ||
                r.taluka?.toLowerCase().includes(ls) ||
                r.atPost?.toLowerCase().includes(ls) ||
                r.number?.includes(searchTerm) ||
                r.assignedSalespersons?.some(sp => sp.toLowerCase().includes(ls))
            );
        }
        if (filterSize !== 'All') result = result.filter(r => r.portfolioSize === filterSize);

        const { col, dir } = colSort;
        const asc = dir === 'asc' ? 1 : -1;
        result.sort((a, b) => {
            switch (col) {
                case 'name':
                    return asc * (a.name || '').localeCompare(b.name || '');
                case 'district':
                    return asc * (a.district || '').localeCompare(b.district || '');
                case 'salesperson':
                    return asc * (a.assignedSalespersons?.[0] || '').localeCompare(b.assignedSalespersons?.[0] || '');
                case 'contact':
                    return asc * (a.number || '').localeCompare(b.number || '');
                case 'outstanding':
                    return asc * ((a.computedOutstanding ?? 0) - (b.computedOutstanding ?? 0));
                case 'totalSales':
                    return asc * ((a.totalSales ?? 0) - (b.totalSales ?? 0));
                case 'date':
                default:
                    return asc * ((a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
            }
        });
        return result;
    }, [dateFilteredRetailers, searchTerm, filterSize, colSort, partnerView]);

    // Grand-total summary for the currently visible (filtered/searched) rows —
    // sorting does not affect it since it aggregates the whole processedRetailers
    // set regardless of order. Distinct counts normalize contact numbers by
    // stripping whitespace only (never altering the stored value).
    const worklistSummary = useMemo(() => {
        const distinctContacts = new Set(
            processedRetailers.map(r => (r.number || '').trim()).filter(Boolean)
        );
        const distinctSalespersons = new Set(
            processedRetailers.flatMap(r => r.assignedSalespersons ?? [])
        );
        const totalInvoiceAmount = processedRetailers.reduce((s, r) => s + (r.computedTotalSales ?? 0), 0);
        const totalPaymentReceived = processedRetailers.reduce((s, r) => s + (r.computedTotalPaid ?? 0), 0);
        const totalOutstanding = processedRetailers.reduce((s, r) => s + (r.computedOutstanding ?? 0), 0);
        return {
            retailerCount: processedRetailers.length,
            contactCount: distinctContacts.size,
            salespersonCount: distinctSalespersons.size,
            totalInvoiceAmount,
            totalPaymentReceived,
            totalOutstanding,
        };
    }, [processedRetailers]);

    // Escapes a value for CSV: wraps in quotes (and doubles any embedded quotes)
    // whenever it contains a comma, quote, or line break, per RFC 4180.
    const csvEscape = (val: string) =>
        /[",\n\r]/.test(val) ? `"${val.replace(/"/g, '""')}"` : val;

    // Exports exactly the rows/values currently shown in the table below \u2014 same
    // processedRetailers array (already filtered by Outstanding/Size/search/sort)
    // and the same per-cell values/formatting used in the <tbody> render.
    const handleExportCSV = () => {
        const headers = ['Retailer Name', 'Contact', 'District', 'Salesperson', 'Portfolio', 'Total Invoice Amount', 'Payment Received', 'Outstanding'];
        const csvRows = processedRetailers.map(r => {
            const outstanding = r.computedOutstanding ?? 0;
            const salesperson = (r.assignedSalespersons?.length ?? 0) > 0
                ? r.assignedSalespersons!.join('; ')
                : 'Unassigned';
            return [
                r.name || '\u2014',
                r.number || '\u2014',
                r.district || '\u2014',
                salesperson,
                r.portfolioSize || '\u2014',
                `\u20B9${(r.computedTotalSales ?? 0).toLocaleString('en-IN')}`,
                `\u20B9${(r.computedTotalPaid ?? 0).toLocaleString('en-IN')}`,
                `\u20B9${outstanding.toLocaleString('en-IN')}`,
            ].map(v => csvEscape(String(v))).join(',');
        });
        const csvContent = [headers.join(','), ...csvRows].join('\r\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.setAttribute('href', URL.createObjectURL(blob));
        link.setAttribute('download', `karanarjun-worklist-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // ── Column sort helpers (mirrors SupplierLedgerPage pattern) ──────────────
    const handleSort = (col: WLSortCol) => {
        setColSort(prev =>
            prev.col === col
                ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                : { col, dir: col === 'name' || col === 'district' || col === 'salesperson' || col === 'contact' ? 'asc' : 'desc' }
        );
    };
    const sortIndicator = (col: WLSortCol) =>
        colSort.col === col ? (colSort.dir === 'asc' ? ' ↑' : ' ↓') : '';
    const thStyle = (col: WLSortCol, align: 'left' | 'right' | 'center' = 'left'): React.CSSProperties => ({
        padding: '0.7rem 0.75rem',
        fontWeight: 600,
        fontSize: '0.72rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        textAlign: align,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        userSelect: 'none',
        color: colSort.col === col ? 'var(--primary-light)' : 'var(--text-secondary)',
        transition: 'color 0.15s',
    });

    return (
        <div>
            {/* Access filter indicator for sales users */}
            {userRole === 'sales' && (assignedDistricts.length > 0 || assignedRetailers.length > 0) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', padding: '0.55rem 1rem', marginBottom: '1rem', background: 'hsla(152,60%,40%,0.07)', borderRadius: '8px', border: '1px solid hsla(152,60%,40%,0.2)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <Filter size={13} style={{ color: 'var(--primary-light)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: 'var(--primary-light)' }}>Access filter active:</span>
                    {assignedDistricts.map(d => (
                        <span key={d} style={{ padding: '0.15rem 0.55rem', borderRadius: '10px', background: 'hsla(152,60%,40%,0.15)', color: 'var(--primary-light)', fontWeight: 600, fontSize: '0.75rem' }}>{d}</span>
                    ))}
                    {assignedRetailers.length > 0 && (
                        <span style={{ padding: '0.15rem 0.55rem', borderRadius: '10px', background: 'hsla(38,92%,50%,0.12)', color: '#d97706', fontWeight: 600, fontSize: '0.75rem' }}>
                            +{assignedRetailers.length} specific retailer{assignedRetailers.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
            )}
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                        <Building2 size={28} /> Partner Worklist
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>B2B wholesale partners — orders, dues and follow-ups.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div ref={dateDropdownRef} style={{ position: 'relative' }}>
                        <button
                            className="btn btn-secondary"
                            onClick={() => setShowDateDropdown(v => !v)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Calendar size={16} /> {WORKLIST_DATE_FILTER_LABELS[financialPeriod] ?? 'This Month'}
                            <ChevronDown size={14} style={{ opacity: 0.7, transform: showDateDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                        </button>
                        {showDateDropdown && (
                            <div style={{ position: 'absolute', top: 'calc(100% + 0.4rem)', left: 0, zIndex: 200, background: 'var(--surface-solid)', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '0.4rem', minWidth: '180px', boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
                                {WORKLIST_DATE_FILTER_OPTIONS.map(([p, label]) => (
                                    <button
                                        key={p}
                                        onClick={() => { setFinancialPeriod(p); if (p !== 'custom') setShowDateDropdown(false); }}
                                        style={{
                                            display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.7rem', borderRadius: '6px', border: 'none',
                                            background: financialPeriod === p ? 'var(--primary-light)' : 'transparent',
                                            color: financialPeriod === p ? '#fff' : 'var(--text-secondary)',
                                            fontWeight: financialPeriod === p ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
                                        }}
                                    >
                                        {label}
                                    </button>
                                ))}
                                {financialPeriod === 'custom' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.5rem 0.7rem 0.2rem', borderTop: '1px solid var(--surface-border)', marginTop: '0.3rem' }}>
                                        <label style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                                            From
                                            <input type="date" value={customFrom} max={customTo || undefined}
                                                onChange={e => setCustomFrom(e.target.value)}
                                                className="input-field" style={{ display: 'block', width: '100%', height: '32px', padding: '0 0.5rem', fontSize: '0.82rem', marginTop: '0.2rem' }} />
                                        </label>
                                        <label style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                                            To
                                            <input type="date" value={customTo} min={customFrom || undefined}
                                                onChange={e => setCustomTo(e.target.value)}
                                                className="input-field" style={{ display: 'block', width: '100%', height: '32px', padding: '0 0.5rem', fontSize: '0.82rem', marginTop: '0.2rem' }} />
                                        </label>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <button className="btn btn-secondary" onClick={handleExportCSV} disabled={processedRetailers.length === 0}><Download size={16} /> {t('worklist.export_csv')}</button>
                    {!isViewOnly && (
                        <button className="btn btn-primary" onClick={() => navigate('/onboarding')}><UserPlus size={16} /> {t('worklist.add_new')}</button>
                    )}
                </div>
            </div>

            {/* Filters Bar */}
            <div className="glass-panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--surface-base)', padding: '0.25rem 0.75rem', borderRadius: '10px', border: `1px solid ${partnerView !== 'all' ? 'var(--primary-light)' : 'var(--surface-border)'}` }}>
                    <Filter size={14} color={partnerView !== 'all' ? 'var(--primary-light)' : 'var(--text-secondary)'} />
                    <select
                        value={partnerView}
                        onChange={e => setPartnerView(e.target.value as 'all' | 'active' | 'cleared')}
                        style={{ background: 'transparent', color: partnerView !== 'all' ? 'var(--primary-light)' : 'var(--text-primary)', border: 'none', outline: 'none', padding: '0.35rem 0.25rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: partnerView !== 'all' ? 700 : 400 }}
                    >
                        <option value="all">Outstanding: All</option>
                        <option value="active">Outstanding: Active</option>
                        <option value="cleared">Outstanding: Cleared</option>
                    </select>
                </div>
                <div style={{ flex: '1 1 240px', position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    <input type="text" placeholder={t('worklist.search_worklist_placeholder')} className="input-field"
                        style={{ paddingLeft: '2.2rem', margin: 0, height: '38px' }} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--surface-base)', padding: '0.25rem 0.75rem', borderRadius: '10px', border: '1px solid var(--surface-border)' }}>
                    <Filter size={14} color="var(--text-secondary)" />
                    <select value={filterSize} onChange={e => setFilterSize(e.target.value)} style={{ background: 'transparent', color: 'var(--text-primary)', border: 'none', outline: 'none', padding: '0.35rem 0.25rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <option value="All">{t('worklist.all_sizes')}</option>
                        <option value="Big">{t('onboarding.big_distributor')}</option>
                        <option value="Medium">{t('onboarding.medium_retailer')}</option>
                        <option value="Small">{t('onboarding.small_retailer')}</option>
                    </select>
                </div>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginLeft: 'auto' }}>{processedRetailers.length} partners</span>
            </div>

            {/* Bulk Action Toolbar — hidden in view-only mode */}
            {!isViewOnly && selectedIds.size > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap',
                    padding: '0.6rem 1rem', marginBottom: '0.75rem',
                    background: 'var(--primary-light)', borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                }}>
                    <CheckSquare size={16} color="#fff" />
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.88rem' }}>
                        {selectedIds.size} partner{selectedIds.size !== 1 ? 's' : ''} selected
                    </span>
                    <div style={{ display: 'flex', gap: '0.45rem', marginLeft: '0.25rem' }}>
                        <button
                            onClick={handleSelectAll}
                            style={{ padding: '0.3rem 0.8rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.5)', background: 'transparent', color: '#fff', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                            Select All ({processedRetailers.length})
                        </button>
                        <button
                            onClick={handleClearSelection}
                            style={{ padding: '0.3rem 0.8rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.5)', background: 'transparent', color: '#fff', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                            <X size={13} /> Clear
                        </button>
                    </div>
                    <button
                        onClick={handleSendReminder}
                        disabled={loadingReminders}
                        style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.35rem 1rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.15)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: loadingReminders ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                    >
                        <Mail size={15} /> {loadingReminders ? 'Loading…' : 'Send Reminder Email'}
                    </button>
                </div>
            )}

            {/* List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>{t('common.loading')}</div>
            ) : processedRetailers.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
                    <Store size={48} color="var(--surface-border)" style={{ margin: '0 auto 1rem auto', display: 'block' }} />
                    <h3>{t('worklist.no_retailers_found')}</h3>
                    <p>{t('worklist.no_retailers_found_desc')}</p>
                    {!isViewOnly && (
                        <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => navigate('/onboarding')}>
                            <UserPlus size={16} /> Onboard a Partner
                        </button>
                    )}
                </div>
            ) : (
                <div className="glass-panel" style={{ overflow: 'hidden', marginTop: '0.5rem' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--surface-border)', background: 'var(--surface-raised)', textAlign: 'left' }}>
                                    {!isViewOnly && (
                                        <th style={{ padding: '0.7rem 0.5rem 0.7rem 1rem', width: '36px' }}>
                                            <input type="checkbox"
                                                checked={selectedIds.size === processedRetailers.length && processedRetailers.length > 0}
                                                onChange={e => e.target.checked ? handleSelectAll() : handleClearSelection()}
                                                style={{ cursor: 'pointer' }}
                                            />
                                        </th>
                                    )}
                                    <th style={thStyle('name')}              onClick={() => handleSort('name')}>Retailer Name{sortIndicator('name')}</th>
                                    <th style={thStyle('contact')}           onClick={() => handleSort('contact')}>Contact{sortIndicator('contact')}</th>
                                    <th style={thStyle('district')}          onClick={() => handleSort('district')}>District{sortIndicator('district')}</th>
                                    <th style={thStyle('salesperson')}       onClick={() => handleSort('salesperson')}>Salesperson{sortIndicator('salesperson')}</th>
                                    <th style={{ padding: '0.7rem 0.75rem', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Portfolio</th>
                                    <th style={{ padding: '0.7rem 0.75rem', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Total Invoice Amount</th>
                                    <th style={{ padding: '0.7rem 0.75rem', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Payment Received</th>
                                    <th style={thStyle('outstanding', 'right')} onClick={() => handleSort('outstanding')}>Outstanding{sortIndicator('outstanding')}</th>
                                    <th style={{ width: '36px' }} />
                                </tr>
                            </thead>
                            <tbody>
                                <tr style={{ borderBottom: '2px solid var(--surface-border)', background: 'var(--surface-raised)', fontWeight: 700 }}>
                                    {!isViewOnly && <td style={{ padding: '0.75rem 0.5rem 0.75rem 1rem' }} />}
                                    <td style={{ padding: '0.75rem 0.75rem', color: 'var(--text-primary)' }}>
                                        Total <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>({worklistSummary.retailerCount})</span>
                                    </td>
                                    <td style={{ padding: '0.75rem 0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{worklistSummary.contactCount}</td>
                                    <td style={{ padding: '0.75rem 0.75rem' }}>—</td>
                                    <td style={{ padding: '0.75rem 0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{worklistSummary.salespersonCount}</td>
                                    <td style={{ padding: '0.75rem 0.75rem' }}>—</td>
                                    <td style={{ padding: '0.75rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                                        ₹{worklistSummary.totalInvoiceAmount.toLocaleString('en-IN')}
                                    </td>
                                    <td style={{ padding: '0.75rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap', color: '#10b981' }}>
                                        ₹{worklistSummary.totalPaymentReceived.toLocaleString('en-IN')}
                                    </td>
                                    <td style={{ padding: '0.75rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap', color: worklistSummary.totalOutstanding > 0 ? '#ef4444' : '#10b981' }}>
                                        ₹{worklistSummary.totalOutstanding.toLocaleString('en-IN')}
                                    </td>
                                    <td style={{ padding: '0.75rem 0.5rem' }} />
                                </tr>
                                {processedRetailers.map(r => {
                                    const outstanding = r.computedOutstanding ?? 0;
                                    const isSelected = selectedIds.has(r.id);
                                    const isExpanded = expandedRows.has(r.id);
                                    const isHighRisk = outstanding > 100000;
                                    const psBadge = ({ 'Big': { bg: '#0ea5e922', color: '#0ea5e9' }, 'Medium': { bg: '#8b5cf622', color: '#8b5cf6' }, 'Small': { bg: '#10b98122', color: '#10b981' } } as Record<string, { bg: string; color: string }>)[r.portfolioSize || ''] || { bg: 'var(--surface-raised)', color: 'var(--text-tertiary)' };
                                    // checkbox + 8 data cols + chevron = 10; viewOnly skips checkbox = 9
                                    const expandColSpan = isViewOnly ? 9 : 10;
                                    const rowBg = isHighRisk
                                        ? (isSelected ? 'hsla(0,84%,55%,0.16)' : 'hsla(0,84%,55%,0.09)')
                                        : (isSelected ? 'hsla(210,100%,70%,0.07)' : 'transparent');
                                    const rowBgHover = isHighRisk
                                        ? 'hsla(0,84%,55%,0.2)'
                                        : (isSelected ? 'hsla(210,100%,70%,0.1)' : 'var(--surface-raised)');
                                    return (
                                        <Fragment key={r.id}>
                                            <tr
                                                onClick={() => navigate(`/worklist/${r.id}`)}
                                                style={{ borderBottom: '1px solid var(--surface-border)', cursor: 'pointer', background: rowBg, transition: 'background 0.12s' }}
                                                onMouseEnter={e => { e.currentTarget.style.background = rowBgHover; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}
                                            >
                                                {!isViewOnly && (
                                                    <td style={{ padding: '0.8rem 0.5rem 0.8rem 1rem', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                                        <input type="checkbox" checked={isSelected} onChange={e => handleSelectionChange(r.id, e.target.checked)} style={{ cursor: 'pointer' }} />
                                                    </td>
                                                )}
                                                <td style={{ padding: '0.8rem 0.75rem' }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.name || '—'}</div>
                                                </td>
                                                <td style={{ padding: '0.8rem 0.75rem' }} onClick={e => e.stopPropagation()}>
                                                    {r.number
                                                        ? <a href={`tel:${r.number}`} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--primary-light)', textDecoration: 'none', fontSize: '0.83rem' }}><Phone size={12} />{r.number}</a>
                                                        : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                                                </td>
                                                <td style={{ padding: '0.8rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{r.district || '—'}</td>
                                                <td
                                                    style={{ padding: '0.8rem 0.75rem', fontSize: '0.85rem', position: 'relative' }}
                                                    onMouseEnter={() => (r.assignedSalespersons?.length ?? 0) > 1 && setSpTooltip(r.id)}
                                                    onMouseLeave={() => setSpTooltip(null)}
                                                >
                                                    {(r.assignedSalespersons?.length ?? 0) === 0 ? (
                                                        <span style={{ color: 'var(--text-tertiary)' }}>Unassigned</span>
                                                    ) : (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                                            <Users size={12} color="var(--primary-light)" />
                                                            {r.assignedSalespersons![0]}
                                                            {(r.assignedSalespersons!.length > 1) && (
                                                                <span style={{ fontSize: '0.68rem', fontWeight: 700, background: 'rgba(14,165,233,0.12)', color: '#0ea5e9', padding: '0.1rem 0.4rem', borderRadius: '99px' }}>
                                                                    +{r.assignedSalespersons!.length - 1}
                                                                </span>
                                                            )}
                                                        </span>
                                                    )}
                                                    {spTooltip === r.id && (r.assignedSalespersons?.length ?? 0) > 1 && (
                                                        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, background: 'var(--surface-solid)', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '0.5rem 0.75rem', minWidth: '160px', boxShadow: '0 4px 16px rgba(0,0,0,0.18)', pointerEvents: 'none' }}>
                                                            <p style={{ margin: '0 0 0.3rem', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)' }}>Assigned Salespersons</p>
                                                            {r.assignedSalespersons!.map(sp => (
                                                                <div key={sp} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0', fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                                                    <Users size={11} color="var(--primary-light)" />{sp}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.8rem 0.75rem' }}>
                                                    <span style={{ background: psBadge.bg, color: psBadge.color, padding: '0.15rem 0.55rem', borderRadius: '99px', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                        {r.portfolioSize || '—'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.8rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                                                    ₹{(r.computedTotalSales ?? 0).toLocaleString('en-IN')}
                                                </td>
                                                <td style={{ padding: '0.8rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap', color: '#10b981', fontWeight: 600 }}>
                                                    ₹{(r.computedTotalPaid ?? 0).toLocaleString('en-IN')}
                                                </td>
                                                <td style={{ padding: '0.8rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    {outstanding > 0
                                                        ? <span style={{ color: '#ef4444', fontWeight: 700 }}>₹{outstanding.toLocaleString('en-IN')}</span>
                                                        : <span style={{ color: '#10b981', fontWeight: 700 }}>₹0</span>}
                                                </td>
                                                <td style={{ padding: '0.8rem 0.5rem', textAlign: 'center' }} onClick={e => toggleExpand(r.id, e)}>
                                                    {isExpanded ? <ChevronDown size={15} color="var(--text-tertiary)" /> : <ChevronRight size={15} color="var(--text-tertiary)" />}
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr style={{ borderBottom: '1px solid var(--surface-border)', background: 'var(--surface-raised)' }}>
                                                    <td colSpan={expandColSpan} style={{ padding: '0.5rem 1rem 0.65rem 3.5rem' }}>
                                                        <div style={{ display: 'flex', gap: '2rem', fontSize: '0.82rem' }}>
                                                            <div>
                                                                <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>Taluka</div>
                                                                <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginTop: '0.1rem' }}>{r.taluka || '—'}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>Village / At Post</div>
                                                                <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginTop: '0.1rem' }}>{r.atPost || '—'}</div>
                                                            </div>
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
                </div>
            )}

            <UdhariUploadModal isOpen={showUdhariModal} onClose={() => setShowUdhariModal(false)} onSuccess={() => window.location.reload()} />

            {showReminderModal && (
                <ReminderModal
                    entries={reminderData}
                    onClose={() => setShowReminderModal(false)}
                />
            )}
        </div>
    );
}

// ─── Reminder Modal ───────────────────────────────────────────────────────────

function ReminderModal({ entries, onClose }: { entries: ReminderEntry[]; onClose: () => void }) {
    const generateText = (e: ReminderEntry) => {
        const cd = e.closestCreditDays;
        const dueLine = cd == null ? ''
            : cd === 0 ? ' Your payment is due today.'
            : cd < 0 ? ` Your payment is overdue by ${Math.abs(cd)} day${Math.abs(cd) !== 1 ? 's' : ''}.`
            : ` Payment due in ${cd} day${cd !== 1 ? 's' : ''}.`;
        return `Dear ${e.name},\n\nThis is a payment reminder from KaranArjun KSK.\n\nYou have ${e.pendingOrderCount} pending order${e.pendingOrderCount !== 1 ? 's' : ''} with a total outstanding of ₹${e.pendingAmount.toLocaleString('en-IN')}.${dueLine}\n\nPlease arrange payment at the earliest convenience.\n\nRegards,\nKaranArjun KSK`;
    };

    const copy = (text: string) =>
        navigator.clipboard.writeText(text).catch(() => {});

    const copyAll = () =>
        copy(entries.map(generateText).join('\n\n---\n\n'));

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '1rem',
            }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                background: 'var(--surface-base)', borderRadius: '14px',
                border: '1px solid var(--surface-border)',
                width: '100%', maxWidth: '720px',
                maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--surface-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Mail size={18} color="var(--primary-light)" />
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                            Payment Reminder — {entries.length} Partner{entries.length !== 1 ? 's' : ''}
                        </h3>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                            onClick={copyAll}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.85rem', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                            <Copy size={13} /> Copy All
                        </button>
                        <button
                            onClick={onClose}
                            style={{ display: 'flex', alignItems: 'center', padding: '0.35rem', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Partner list */}
                <div style={{ overflowY: 'auto', padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {entries.length === 0 ? (
                        <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '2rem 0' }}>No pending orders found for selected partners.</p>
                    ) : entries.map(e => (
                        <div key={e.id} style={{ border: '1px solid var(--surface-border)', borderRadius: '10px', overflow: 'hidden' }}>
                            {/* Partner header row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'var(--surface-raised)', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.92rem', flex: 1 }}>{e.name}</span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                    {e.pendingOrderCount} order{e.pendingOrderCount !== 1 ? 's' : ''}
                                </span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ef4444' }}>
                                    ₹{e.pendingAmount.toLocaleString('en-IN')} due
                                </span>
                                {e.closestCreditDays != null && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '8px', background: e.closestCreditDays <= 7 ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', color: e.closestCreditDays <= 7 ? '#ef4444' : '#f59e0b' }}>
                                        <Clock size={11} /> {e.closestCreditDays}d
                                    </span>
                                )}
                            </div>

                            {/* Message preview */}
                            <textarea
                                readOnly
                                value={generateText(e)}
                                rows={6}
                                style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem 1rem', background: 'var(--surface-base)', color: 'var(--text-primary)', border: 'none', borderTop: '1px solid var(--surface-border)', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.82rem', lineHeight: 1.6, outline: 'none' }}
                            />

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.6rem 1rem', background: 'var(--surface-raised)', borderTop: '1px solid var(--surface-border)', flexWrap: 'wrap' }}>
                                <button
                                    onClick={() => copy(generateText(e))}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.75rem', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}
                                >
                                    <Copy size={12} /> Copy
                                </button>
                                {e.number && (
                                    <a
                                        href={`https://wa.me/91${e.number.replace(/\D/g, '')}?text=${encodeURIComponent(generateText(e))}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.75rem', borderRadius: '6px', border: '1px solid #25d36644', background: 'rgba(37,211,102,0.08)', color: '#25d366', fontSize: '0.78rem', textDecoration: 'none', fontWeight: 600 }}
                                    >
                                        <MessageSquare size={12} /> WhatsApp
                                    </a>
                                )}
                                {e.email && (
                                    <a
                                        href={`mailto:${e.email}?subject=${encodeURIComponent('Payment Reminder — KaranArjun KSK')}&body=${encodeURIComponent(generateText(e))}`}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.75rem', borderRadius: '6px', border: '1px solid var(--primary-light)44', background: 'rgba(99,179,237,0.08)', color: 'var(--primary-light)', fontSize: '0.78rem', textDecoration: 'none', fontWeight: 600 }}
                                    >
                                        <Mail size={12} /> Email
                                    </a>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
