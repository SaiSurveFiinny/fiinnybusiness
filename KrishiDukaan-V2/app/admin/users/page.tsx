"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pencil, Search, ShieldCheck, Users, AlertTriangle, X,
  ChevronUp, ChevronDown, UserPlus, Loader2,
  SlidersHorizontal, Calendar, RotateCcw, LayoutDashboard,
  Download, FileSpreadsheet,
} from "lucide-react";
import {
  promoteToAdmin,
  fetchUsersPage, fetchSubscriptionsForPhones, type UserRoleFilter,
} from "../../firebase";
import { AdminUserEditPanel } from "../_components/admin-user-edit-panel";
import { CreateUserModal } from "../_components/create-user-modal";
import { RefreshButton } from "../_components/refresh-button";
import { useAdminAuth } from "../_context/admin-auth-context";
import {
  getRoleCounts, invalidateUsers,
} from "../_lib/admin-data";
import { phoneKey, summarizeSubscriptions, type OwnerSubscriptionSummary } from "../../lib/subscription-status";
import { searchUsers } from "../_lib/admin-queries";
import type { SeatSummary } from "../_lib/seller-seats-export";

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-red-100 text-red-700 border border-red-200",
  manufacturer: "bg-blue-100 text-blue-700 border border-blue-200",
  retailer: "bg-green-100 text-green-700 border border-green-200",
  customer: "bg-gray-100 text-gray-600 border border-gray-200",
};

export default function AdminUsersPage() {
  const identity = useAdminAuth();
  const isFullAdmin = identity.role === "admin";
  // Browse mode — Firestore-paginated "page N of users", loaded 25 at a time via "See More".
  const PAGE_SIZE = 20;
  const [pageUsers, setPageUsers] = useState<any[]>([]);
  const [pageSubs, setPageSubs] = useState<any[]>([]);
  // Seats can't be trusted when the subscriptions read failed — say so instead of showing 0.
  const [subsLoadFailed, setSubsLoadFailed] = useState(false);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [roleCounts, setRoleCounts] = useState({ all: 0, retailer: 0, manufacturer: 0, admin: 0, customer: 0 });

  // Full mode — the complete users/subscriptions collections, pulled from the shared
  // admin cache (app/admin/_lib/admin-data) the moment search/role-filter/advanced-filter/
  // promote needs to look beyond whatever pages are currently loaded. The cache is shared
  // with the other admin tabs, so this is normally free after the first use.
  // Products are deliberately NOT fetched here — this tab shows no product data.
  const [fullUsers, setFullUsers] = useState<any[] | null>(null);
  const [fullSubs, setFullSubs] = useState<any[] | null>(null);
  const [fullLoading, setFullLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dataAge, setDataAge] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  // Debounced copy of `search` — the input stays instant while the (potentially
  // thousands-of-rows) filter/sort pass runs at most once per pause in typing.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState("all");

  // Advanced filters
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterHasSubscription, setFilterHasSubscription] = useState<"all" | "yes" | "no">("all");
  const [filterCity, setFilterCity] = useState("");
  const [filterState, setFilterState] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  const [editUser, setEditUser] = useState<any | null>(null);

  const [showPromotePanel, setShowPromotePanel] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState<any | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [promoteSearch, setPromoteSearch] = useState("");

  // Create User modal — the form/logic lives in the shared <CreateUserModal>.
  const [showCreate, setShowCreate] = useState(false);

  // Whether the admin has engaged search/role-chip/advanced-filter/promote-panel — any of
  // these need to look beyond whatever pages are currently loaded, so they trigger a
  // one-time fetch-and-cache of the complete collections instead of scoped paginated data.
  // Role is now applied by Firestore inside fetchUsersPage, so it no longer
  // forces the whole collection into memory. Only the filters Firestore cannot
  // express as a paginated query still do — free-text search across several
  // fields, subscription joins, and the city/state/date predicates.
  // Text search runs as queries (searchUsers: name/shop/business/email
  // prefixes, phone, id) instead of downloading every user. The advanced
  // filters page through the users 20 at a time: sign-up dates and "paid"
  // run in the query, the rest narrow each loaded page.
  const isFiltering = !!debouncedSearch.trim();

  // Derived "current dataset" — paginated browse-mode pages by default, or the fully
  // cached collections once full mode has been triggered and loaded.
  const users = isFiltering ? (fullUsers ?? []) : pageUsers;
  const allSubs = isFiltering ? (fullSubs ?? []) : pageSubs;
  // Promote-to-admin: the users found by its own search box (or the loaded page).
  const [promoteResults, setPromoteResults] = useState<any[] | null>(null);
  const promoteSourceUsers = promoteResults ?? pageUsers;
  useEffect(() => {
    const q = promoteSearch.trim();
    if (q.length < 2) { setPromoteResults(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      searchUsers(q).then((us) => { if (!cancelled) setPromoteResults(us); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [promoteSearch]);

  /** Server-side part of the advanced filters, for fetchUsersPage. */
  const serverFilters = () => ({
    fromMs: filterDateFrom ? new Date(filterDateFrom).getTime() : null,
    toMs: filterDateTo ? new Date(filterDateTo).getTime() + 86399999 : null,
    paidOnly: filterActive === "active",
  });

  /**
   * Reloads the first page. `force` (the Refresh button, and every write on this tab)
   * also drops the shared users cache so the next search re-reads Firestore; a plain
   * reload reuses whatever the cache already holds.
   */
  const load = (force = false, role: string = filterRole) => {
    if (force) invalidateUsers();
    setLoading(true);
    setPageUsers([]); setPageSubs([]);
    setLastDoc(null); setHasMore(true);
    setFullUsers(null); setFullSubs(null);
    return Promise.all([
      fetchUsersPage(PAGE_SIZE, null, role as UserRoleFilter, serverFilters()),
      getRoleCounts({ force }),
    ])
      .then(async ([page, counts]) => {
        setPageUsers(page.users);
        setLastDoc(page.lastDoc);
        setHasMore(page.hasMore);
        setRoleCounts(counts);
        setDataAge(Date.now());
        const ss = await fetchSubscriptionsForPhones(page.users.map(u => u.phone || u.id), page.users.map(u => u.uid)).catch(() => null);
        setSubsLoadFailed(ss === null);
        setPageSubs(ss ?? []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Switching role tab re-queries Firestore for that role instead of filtering a
  // fully-downloaded list. Skips the very first run, which load() above covers.
  const didMountRole = useRef(false);
  useEffect(() => {
    if (!didMountRole.current) { didMountRole.current = true; return; }
    load(false, filterRole);
  }, [filterRole, filterDateFrom, filterDateTo, filterActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link support: Admin → Payments links a customer here as ?q=<phone>.
  // Read from window (not useSearchParams, which would force a Suspense
  // boundary around this large page). Seeding `search` flows through the
  // debounce + full-collection fetch below, so the page opens pre-filtered to
  // that customer. Runs once on mount, client-only.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Clearing the box takes effect immediately; typing settles after 250ms.
    if (!search) { setDebouncedSearch(""); return; }
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Seats export (Excel): read only on click — nothing extra on page load.
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ ok: boolean; text: string } | null>(null);
  const handleExportSeats = async () => {
    if (exporting) return;
    setExporting(true);
    setExportResult(null);
    try {
      const { exportSellerSeats } = await import("../_lib/seller-seats-export");
      const s: SeatSummary = await exportSellerSeats();
      setExportResult({
        ok: true,
        text: `Exported ${s.sellers} sellers · ${s.withRunningPlan} with a running plan · ${s.seatsUsed}/${s.seatsPurchased} seats used, ${s.seatsRemaining} empty.`,
      });
    } catch (err) {
      console.error("[seats export]", err);
      setExportResult({ ok: false, text: "Export failed. Please try again." });
    } finally {
      setExporting(false);
    }
  };

  // Export Users (CSV) — confirmation dialog, then a one-time read of every user.
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [exportingUsers, setExportingUsers] = useState(false);
  const handleExportUsers = async () => {
    if (exportingUsers) return;
    setExportingUsers(true);
    setExportResult(null);
    try {
      const { exportUsersCsv } = await import("../_lib/users-export");
      const n = await exportUsersCsv();
      setShowExportConfirm(false);
      setExportResult({ ok: true, text: `Exported ${n} user${n === 1 ? "" : "s"} to CSV.` });
    } catch (err) {
      console.error("[users export]", err);
      setExportResult({ ok: false, text: "Export failed. Please try again." });
    } finally {
      setExportingUsers(false);
    }
  };

  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    load(true).finally(() => setRefreshing(false));
  };

  const loadMore = async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchUsersPage(PAGE_SIZE, lastDoc, filterRole as UserRoleFilter, serverFilters());
      setPageUsers(prev => [...prev, ...page.users]);
      setLastDoc(page.lastDoc);
      setHasMore(page.hasMore);
      const ss = await fetchSubscriptionsForPhones(page.users.map(u => u.phone || u.id), page.users.map(u => u.uid)).catch(() => null);
      if (ss === null) setSubsLoadFailed(true);
      setPageSubs(prev => {
        const seen = new Set(prev.map(p => p.id));
        return [...prev, ...(ss ?? []).filter(p => !seen.has(p.id))];
      });
    } finally {
      setLoadingMore(false);
    }
  };

  // Search mode: the matching users (a few small queries) and their subscriptions.
  useEffect(() => {
    const q = debouncedSearch.trim();
    if (!q) { setFullUsers(null); setFullSubs(null); return; }
    let cancelled = false;
    setFullLoading(true);
    searchUsers(q)
      .then(async (us) => {
        const ss = await fetchSubscriptionsForPhones(us.map((u) => u.phone || u.id), us.map((u) => u.uid)).catch(() => []);
        if (cancelled) return;
        setFullUsers(us); setFullSubs(ss);
      })
      .finally(() => { if (!cancelled) setFullLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedSearch]);

  const promoteCandidates = promoteSourceUsers.filter(u =>
    u.role !== "admin" &&
    (!promoteSearch || [u.name, u.email].join(" ").toLowerCase().includes(promoteSearch.toLowerCase()))
  );

  // Role-chip counts come from cheap server-side aggregates (roleCounts), not the
  // currently-loaded page — they stay accurate no matter how many pages are loaded.
  const counts = roleCounts;

  // Each user's subscriptions as they stand right now (summarizeSubscriptions):
  // seats and status count only plans that are active, started and not past
  // their expiry date. users.totalSeats / users.isPaid are NOT used — they are
  // snapshots that kept expired seats. Subs are matched by phone (any format)
  // and by the owner's uid, since older plans carry only ownerId.
  const subsByKey = useMemo(() => {
    const m = new Map<string, any[]>();
    const add = (key: string, sub: any) => {
      if (!key) return;
      const list = m.get(key) ?? [];
      if (!list.includes(sub)) list.push(sub);
      m.set(key, list);
    };
    for (const sub of allSubs) {
      add(`p:${phoneKey(sub.ownerPhone)}`, sub);
      if (sub.ownerId) add(`u:${sub.ownerId}`, sub);
      add(`p:${phoneKey(sub.ownerId)}`, sub);
    }
    return m;
  }, [allSubs]);

  const subscriptionOf = (u: any): OwnerSubscriptionSummary => {
    const found = new Set<any>();
    for (const key of [`p:${phoneKey(u.phone || u.id)}`, u.uid ? `u:${u.uid}` : "", `u:${u.id}`]) {
      for (const sub of subsByKey.get(key) ?? []) found.add(sub);
    }
    return summarizeSubscriptions(Array.from(found));
  };

  // Utility: extract a numeric timestamp from a Firestore Timestamp, Date, or string
  const getTs = (val: any): number => {
    if (!val) return 0;
    if (typeof val.toDate === "function") return val.toDate().getTime();
    if (val instanceof Date) return val.getTime();
    if (typeof val === "string" || typeof val === "number") return new Date(val).getTime();
    return 0;
  };

  // Utility: format a Firestore timestamp or date string nicely
  const fmtDate = (val: any): string => {
    if (!val) return "—";
    let d: Date | null = null;
    if (typeof val.toDate === "function") d = val.toDate();
    else if (val instanceof Date) d = val;
    else if (typeof val === "string" || typeof val === "number") d = new Date(val);
    if (!d || isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const resetAdvanced = () => {
    setFilterActive("all");
    setFilterHasSubscription("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterCity("");
    setFilterState("");
  };

  const filtered = users.filter(u => {
    const q = debouncedSearch.toLowerCase();
    const matchSearch = !q || [u.name, u.email, u.role, u.id, u.phone, u.city, u.state, u.shopName, u.businessName].join(" ").toLowerCase().includes(q);
    const matchRole = filterRole === "all" || (filterRole === "customer" ? (!u.role || u.role === "customer") : u.role === filterRole);

    // Advanced filters
    const matchActive =
      filterActive === "all" ? true :
      filterActive === "active" ? subscriptionOf(u).state === "active" :
      subscriptionOf(u).state !== "active";

    const matchSubscription =
      filterHasSubscription === "all" ? true :
      filterHasSubscription === "yes" ? (!!u.subscriptionStatus && u.subscriptionStatus !== "" && u.subscriptionStatus !== "free") :
      (!u.subscriptionStatus || u.subscriptionStatus === "" || u.subscriptionStatus === "free");

    // Date filtering — createdAt can be a Firestore Timestamp or a JS Date
    const uCreatedAt = getTs(u.createdAt);
    const matchDateFrom = !filterDateFrom ? true : (uCreatedAt > 0 ? uCreatedAt >= new Date(filterDateFrom).getTime() : false);
    const matchDateTo   = !filterDateTo   ? true : (uCreatedAt > 0 ? uCreatedAt <= new Date(filterDateTo).getTime() + 86399999 : false);

    const matchCity  = !filterCity.trim()  ? true : (u.city  || "").toLowerCase().includes(filterCity.trim().toLowerCase());
    const matchState = !filterState.trim() ? true : (u.state || "").toLowerCase().includes(filterState.trim().toLowerCase());

    return matchSearch && matchRole && matchActive && matchSubscription && matchDateFrom && matchDateTo && matchCity && matchState;
  });

  // Sort filtered results by createdAt (desc = newest first, asc = oldest first)
  const sorted = [...filtered].sort((a, b) =>
    sortOrder === "desc" ? getTs(b.createdAt) - getTs(a.createdAt) : getTs(a.createdAt) - getTs(b.createdAt),
  );

  // Count how many advanced filters are active
  const activeAdvancedCount = [
    filterActive !== "all",
    filterHasSubscription !== "all",
    !!filterDateFrom,
    !!filterDateTo,
    !!filterCity.trim(),
    !!filterState.trim(),
  ].filter(Boolean).length;

  const handlePromoteConfirm = async () => {
    if (!promoteTarget) return;
    if (confirmEmail.trim().toLowerCase() !== (promoteTarget.email || "").toLowerCase()) {
      alert("Email does not match. Promotion cancelled.");
      return;
    }
    setPromoting(true);
    try {
      await promoteToAdmin(promoteTarget.id);
      invalidateUsers();
      const promote = (prev: any[]) => prev.map(u => u.id === promoteTarget.id ? { ...u, role: "admin", isPaid: true } : u);
      setPageUsers(promote);
      setFullUsers(prev => (prev === null ? prev : promote(prev)));
      setPromoteResults(prev => (prev === null ? prev : promote(prev)));
      getRoleCounts({ force: true }).then(setRoleCounts).catch(() => {});
      setPromoteTarget(null);
      setConfirmEmail("");
      setShowPromotePanel(false);
    } catch (e) {
      alert("Failed to promote. Check console.");
      console.error(e);
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 mb-1">
            <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-lg sm:text-2xl font-black text-on-surface">Users & Roles</h1>
          </div>
          <p className="text-xs sm:text-sm text-on-surface-variant ml-7 sm:ml-9">View and edit all platform users.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <RefreshButton savedAt={dataAge} refreshing={refreshing} onRefresh={handleRefresh} />
          <button
            type="button"
            onClick={() => void handleExportSeats()}
            disabled={exporting}
            title="Excel: every seller's running plan, seats bought / used / empty, and who to call"
            className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-white px-4 py-2.5 text-sm font-bold text-on-surface hover:bg-surface-container-low disabled:opacity-60"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? "Exporting…" : "Export seats"}
          </button>
          <button
            type="button"
            onClick={() => setShowExportConfirm(true)}
            disabled={exportingUsers}
            title="Download every user (name, phone, role) as a CSV"
            className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-white px-4 py-2.5 text-sm font-bold text-on-surface hover:bg-surface-container-low disabled:opacity-60"
          >
            {exportingUsers ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            {exportingUsers ? "Exporting…" : "Export Users"}
          </button>
          {isFullAdmin && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 transition-opacity"
            >
              <UserPlus className="h-4 w-4" /> Create User
            </button>
          )}
        </div>
      </div>
      {exportResult && (
        <p className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${exportResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {exportResult.text}
        </p>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {(["all", "retailer", "manufacturer", "customer", "admin"] as const).map(role => (
          <button key={role} onClick={() => setFilterRole(role)}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap shrink-0 ${filterRole === role ? "bg-primary text-white shadow-sm" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}>
            {role === "all" ? "All" : role.charAt(0).toUpperCase() + role.slice(1)} ({counts[role as keyof typeof counts]})
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="flex flex-1 items-center gap-3 bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-2.5">
          <Search className="h-4 w-4 text-outline shrink-0" />
          <input type="text" placeholder="Search name, email, phone, city…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface placeholder-on-surface-variant" />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="text-outline hover:text-on-surface">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced(v => !v)}
          className={`relative flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all shrink-0 ${
            showAdvanced || activeAdvancedCount > 0
              ? "bg-primary text-white border-primary shadow-sm"
              : "bg-surface-container-low border-outline-variant text-on-surface-variant hover:bg-surface-container"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeAdvancedCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-black text-white">
              {activeAdvancedCount}
            </span>
          )}
        </button>
      </div>

      {/* Advanced Filters Panel */}
      {showAdvanced && (
        <div className="rounded-2xl border border-outline-variant/50 bg-surface-container-lowest p-4 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Advanced Filters
            </p>
            {activeAdvancedCount > 0 && (
              <button type="button" onClick={resetAdvanced}
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:opacity-80">
                <RotateCcw className="h-3 w-3" /> Reset all
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Active Status */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Subscription Status</label>
              <select value={filterActive} onChange={e => setFilterActive(e.target.value as any)}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 appearance-none">
                <option value="all">All</option>
                <option value="active">Active / Paid</option>
                <option value="inactive">Free / Inactive</option>
              </select>
            </div>

            {/* Has Subscription */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Has Subscription</label>
              <select value={filterHasSubscription} onChange={e => setFilterHasSubscription(e.target.value as any)}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 appearance-none">
                <option value="all">All</option>
                <option value="yes">Has Subscription</option>
                <option value="no">No Subscription</option>
              </select>
            </div>

            {/* City */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">City</label>
              <input type="text" value={filterCity} onChange={e => setFilterCity(e.target.value)}
                placeholder="e.g. Pune"
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2" />
            </div>

            {/* State */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">State</label>
              <input type="text" value={filterState} onChange={e => setFilterState(e.target.value)}
                placeholder="e.g. Maharashtra"
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2" />
            </div>

          </div>

          {/* Date Range */}
          <div className="border-t border-outline-variant/20 pt-3">
            <p className="text-xs font-semibold text-on-surface-variant mb-2 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Registered Between
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-on-surface-variant">From</label>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                  className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-on-surface-variant">To</label>
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                  className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2" />
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-surface-container-low border border-outline-variant/20 px-3 py-2 text-xs text-on-surface-variant">
            Showing <span className="font-bold text-on-surface">{filtered.length}</span> of <span className="font-bold text-on-surface">{roleCounts.all}</span> users
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-outline-variant/20 bg-surface-container-low flex items-center gap-2">
            <span className="text-xs font-bold text-on-surface-variant">
              {isFiltering
                ? `${filtered.length} user${filtered.length !== 1 ? "s" : ""}`
                : `Showing ${filtered.length} of ${roleCounts.all} user${roleCounts.all !== 1 ? "s" : ""}`}
            </span>
            {fullLoading && (
              <span className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching users…
              </span>
            )}
          </div>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/20">
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">User</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Role</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Subscription</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Seats</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                    <button
                      type="button"
                      onClick={() => setSortOrder(o => o === "desc" ? "asc" : "desc")}
                      className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                      title={sortOrder === "desc" ? "Newest first — click for oldest first" : "Oldest first — click for newest first"}
                    >
                      Joined
                      {sortOrder === "desc"
                        ? <ChevronDown className="h-3 w-3 text-primary" />
                        : <ChevronUp className="h-3 w-3 text-primary" />}
                    </button>
                  </th>
                  <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(u => (
                  <tr key={u.id} className="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors">
                    <td className="px-5 py-3">
                      {(u.role === "retailer" || u.role === "manufacturer") ? (
                        <>
                          <p className="font-semibold text-on-surface">{u.shopName || u.businessName || u.name || "—"}</p>
                          {(u.name || u.ownerName) && (
                            <p className="text-xs text-on-surface-variant">{u.ownerName || u.name}</p>
                          )}
                          {u.phone && <p className="text-xs text-on-surface-variant/70">{u.phone}</p>}
                        </>
                      ) : (
                        <>
                          <p className="font-semibold text-on-surface">{u.name || "—"}</p>
                          {u.phone && <p className="text-xs text-on-surface-variant/70">{u.phone}</p>}
                        </>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${ROLE_BADGE[u.role] || ROLE_BADGE.customer}`}>
                        {u.role || "customer"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <SubscriptionStatus summary={subscriptionOf(u)} user={u} />
                    </td>
                    <td className="px-5 py-3 text-sm text-on-surface">
                      <SeatCount summary={subscriptionOf(u)} unknown={subsLoadFailed} />
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-on-surface-variant whitespace-nowrap">{fmtDate(u.createdAt)}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {/* Sellers are edited from their own dashboard (Dashboard button) —
                          the inline Edit panel is kept only for roles that have no dashboard. */}
                      <div className="inline-flex items-center gap-1.5">
                        {(u.role === "retailer" || u.role === "manufacturer") ? (
                          <a
                            href={`/dashboard?adminView=${encodeURIComponent(u.phone || u.id)}`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                            title={`Open ${u.shopName || u.name || u.id}'s dashboard`}
                          >
                            <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
                          </a>
                        ) : (
                          <button type="button" onClick={() => setEditUser(u)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container transition-colors">
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-on-surface-variant">No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-outline-variant/10">
            {sorted.map(u => (
              <div key={u.id} className="px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {(u.role === "retailer" || u.role === "manufacturer") ? (
                      <>
                        <p className="text-sm font-semibold text-on-surface truncate">{u.shopName || u.businessName || u.name || "—"}</p>
                        {(u.name || u.ownerName) && (
                          <p className="text-[11px] text-on-surface-variant truncate">{u.ownerName || u.name}</p>
                        )}
                        {u.phone && <p className="text-[11px] text-on-surface-variant/70 truncate">{u.phone}</p>}
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-on-surface truncate">{u.name || "—"}</p>
                        {u.phone && <p className="text-[11px] text-on-surface-variant/70 truncate">{u.phone}</p>}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {(u.role === "retailer" || u.role === "manufacturer") ? (
                      <a
                        href={`/dashboard?adminView=${encodeURIComponent(u.phone || u.id)}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                      >
                        <LayoutDashboard className="h-3 w-3" />
                      </a>
                    ) : (
                      <button type="button" onClick={() => setEditUser(u)}
                        className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2.5 py-1 text-[11px] font-medium text-on-surface hover:bg-surface-container">
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${ROLE_BADGE[u.role] || ROLE_BADGE.customer}`}>
                    {u.role || "customer"}
                  </span>
                  <SubscriptionStatus summary={subscriptionOf(u)} user={u} compact />
                  {subscriptionOf(u).seats > 0 && (
                    <span className="text-[11px] text-on-surface-variant">{subscriptionOf(u).seats} seats</span>
                  )}
                  {u.createdAt && (
                    <span className="text-[11px] text-on-surface-variant flex items-center gap-0.5">
                      <Calendar className="h-2.5 w-2.5" />{fmtDate(u.createdAt)}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {sorted.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-on-surface-variant">No users found.</div>
            )}
          </div>

          {/* See More — only in browse mode; search/filters already show every match. */}
          {!isFiltering && hasMore && (
            <div className="flex justify-center border-t border-outline-variant/20 py-3">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-5 py-2 text-sm font-bold text-on-surface hover:bg-surface-container disabled:opacity-60"
              >
                {loadingMore ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</> : "See More"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Edit User Panel ─────────────────────────────────────────────────────── */}
      {editUser && (
        <AdminUserEditPanel
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { load(true); }}
        />
      )}


      {/* ─── Guarded Admin Promotion Section (full admins only) ──────────── */}
      {isFullAdmin && (
      <div className="rounded-2xl border-2 border-dashed border-red-200 bg-red-50/40 overflow-hidden">
        <button type="button" onClick={() => setShowPromotePanel(v => !v)}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-red-50 transition-colors">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-700">Admin Promotion Zone</p>
            <p className="text-xs text-red-500">Danger area — use only when intentionally granting admin access.</p>
          </div>
          <span className="text-xs font-bold text-red-500 shrink-0">{showPromotePanel ? "Close ↑" : "Open ↓"}</span>
        </button>

        {showPromotePanel && (
          <div className="border-t border-red-200 p-5 space-y-4">
            <p className="text-xs text-red-600 font-semibold">
              Admin access grants full platform control. Select a user, then type their exact email to confirm.
            </p>
            <div className="flex items-center gap-3 bg-white border border-red-200 rounded-xl px-3 py-2">
              <Search className="h-4 w-4 text-red-300 shrink-0" />
              <input type="text" placeholder="Search user to promote…" value={promoteSearch}
                onChange={e => setPromoteSearch(e.target.value)}
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface placeholder-red-300" />
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto rounded-xl border border-red-200 bg-white">
              {promoteCandidates.length === 0 && (
                <p className="text-xs text-on-surface-variant text-center py-4">No matching non-admin users.</p>
              )}
              {promoteCandidates.map(u => (
                <button key={u.id} type="button"
                  onClick={() => { setPromoteTarget(u); setConfirmEmail(""); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-red-50 last:border-0 ${promoteTarget?.id === u.id ? "bg-red-50" : "hover:bg-red-50/50"}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">{u.name || "—"}</p>
                    <p className="text-xs text-on-surface-variant truncate">{u.email}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0 ${ROLE_BADGE[u.role] || ROLE_BADGE.customer}`}>
                    {u.role || "customer"}
                  </span>
                  {promoteTarget?.id === u.id && <span className="text-xs text-red-600 font-bold shrink-0">Selected</span>}
                </button>
              ))}
            </div>
            {promoteTarget && (
              <div className="rounded-xl border border-red-300 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-red-700">
                    Promoting: <span className="text-on-surface">{promoteTarget.name || promoteTarget.email}</span>
                  </p>
                  <button type="button" onClick={() => { setPromoteTarget(null); setConfirmEmail(""); }}
                    className="p-1 rounded-lg hover:bg-red-50 text-red-400"><X className="h-4 w-4" /></button>
                </div>
                <p className="text-xs text-red-600">Type <strong>{promoteTarget.email}</strong> exactly to confirm:</p>
                <input type="text" value={confirmEmail} onChange={e => setConfirmEmail(e.target.value)}
                  placeholder="Type the user's email to confirm…"
                  className="w-full rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200" />
                <button type="button" onClick={handlePromoteConfirm}
                  disabled={promoting || confirmEmail.trim().toLowerCase() !== (promoteTarget.email || "").toLowerCase()}
                  className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  {promoting ? "Promoting…" : "Confirm Promote to Admin"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Export Users — confirmation dialog. */}
      {showExportConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface-container-lowest p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-1">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-black text-on-surface">Export Users?</h2>
            </div>
            <p className="text-sm text-on-surface-variant mb-5">Do you want to download the users list?</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExportConfirm(false)}
                disabled={exportingUsers}
                className="rounded-xl border border-outline-variant/40 bg-white px-4 py-2.5 text-sm font-bold text-on-surface hover:bg-surface-container-low disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleExportUsers()}
                disabled={exportingUsers}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
              >
                {exportingUsers ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {exportingUsers ? "Exporting…" : "Yes, Download"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User — shared modal (form + creation logic live in the component). */}
      {isFullAdmin && (
        <CreateUserModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={() => load(true)}
        />
      )}
    </div>
  );
}

const fmtShortDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * Subscription state from the user's subscription records, not users.isPaid.
 * A seller flagged paid with no plan on record (older data) is called out so
 * it can be fixed, rather than shown as a normal active plan.
 */
function SubscriptionStatus({ summary, user, compact }: { summary: OwnerSubscriptionSummary; user: any; compact?: boolean }) {
  const isSeller = user.role === "retailer" || user.role === "manufacturer";
  const view =
    summary.state === "active"
      ? { dot: "bg-green-500", text: "text-green-600", label: "Active", note: summary.until ? `till ${fmtShortDate(summary.until)}` : "" }
      : summary.state === "scheduled"
        ? { dot: "bg-blue-500", text: "text-blue-600", label: "Scheduled", note: summary.until ? `starts ${fmtShortDate(summary.until)}` : "" }
        : summary.state === "expired"
          ? { dot: "bg-amber-500", text: "text-amber-600", label: "Expired", note: "" }
          : isSeller && user.isPaid
            ? { dot: "bg-amber-500", text: "text-amber-600", label: "Paid flag", note: "no plan on record" }
            : { dot: "bg-gray-300", text: "text-on-surface-variant", label: "Free", note: "" };
  return (
    <span className={`flex ${compact ? "items-center gap-1" : "flex-col"} text-xs font-bold ${view.text}`}>
      <span className="flex items-center gap-1">
        <span className={`h-2 w-2 rounded-full ${view.dot}`} />
        {view.label}
      </span>
      {view.note && !compact && <span className="pl-3 text-[10px] font-medium text-on-surface-variant">{view.note}</span>}
    </span>
  );
}

/** Seats across the plans running now; expired plans add nothing. */
function SeatCount({ summary, unknown }: { summary: OwnerSubscriptionSummary; unknown: boolean }) {
  if (unknown && summary.state === "none") return <span title="Couldn't load subscriptions">—</span>;
  return (
    <span className="flex flex-col">
      <span className={summary.seats > 0 ? "font-semibold" : "text-on-surface-variant"}>{summary.seats}</span>
      {summary.running > 1 && <span className="text-[10px] text-on-surface-variant">{summary.running} plans</span>}
    </span>
  );
}
