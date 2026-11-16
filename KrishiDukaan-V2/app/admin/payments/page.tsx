"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, ChevronDown, Download, FileSpreadsheet, RefreshCw, Search, X } from "lucide-react";
import { auth } from "../../firebase";
import { rangeForPreset, type RangePreset } from "../_components/analytics/ui";
import {
  downloadCsv,
  fetchPaymentsPage,
  money,
  paymentsToCsv,
  CATEGORY_LABEL,
  EMPTY_PAYMENT_FILTERS,
  type Category,
  type PaymentFilters,
  type PaymentRow,
  type PaymentsPage,
} from "./_lib/payments";
import { PaymentsTable } from "./_components/payments-table";
import { PaymentDetailsModal } from "./_components/payment-details-modal";
import { PaymentPieCharts } from "./_components/payment-pie-charts";
import { PaymentFilterChips } from "./_components/payment-filter-chips";

/**
 * Admin → Payments. Unified razorpayPayments + paymentAttempts, fetched/merged/
 * aggregated server-side. The date window (preset chips + the Date column's
 * custom range) bounds the server fetch; the other per-column filters and the
 * free-text search are applied server-side too, so everything spans ALL records
 * while only a page is sent to the browser.
 */

const PAGE_SIZE = 25;

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "mtd", label: "This month" },
  { key: "ytd", label: "This year" },
  { key: "all", label: "All time" },
];

type Tab = "all" | Category;
const TABS: Tab[] = ["all", "successful", "abandoned", "failed", "refunded", "pending", "unresolved"];
const TAB_LABEL: Record<Tab, string> = { all: "All", ...CATEGORY_LABEL };

const EMPTY: PaymentsPage = {
  counts: { successful: 0, abandoned: 0, failed: 0, refunded: 0, pending: 0, unresolved: 0 },
  amounts: { successful: 0, abandoned: 0, failed: 0, refunded: 0, pending: 0, unresolved: 0 },
  refundedValue: 0,
  total: 0,
  tabTotal: 0,
  rows: [],
};

export default function AdminPaymentsPage() {
  // Date window: preset chips + a custom range entered via the Date column filter.
  const [datePreset, setDatePreset] = useState<RangePreset>("30d");
  const [dFrom, setDFrom] = useState<number | null>(null);
  const [dTo, setDTo] = useState<number | null>(null);
  const win = useMemo(() => {
    if (datePreset === "all") return { fromMs: 0, toMs: Date.now() };
    if (datePreset === "custom") return { fromMs: dFrom ?? 0, toMs: dTo ?? Date.now() };
    const r = rangeForPreset(datePreset);
    return { fromMs: r.from.getTime(), toMs: r.to.getTime() };
  }, [datePreset, dFrom, dTo]);

  const [filters, setFilters] = useState<PaymentFilters>(EMPTY_PAYMENT_FILTERS);
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);

  const [data, setData] = useState<PaymentsPage>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selected, setSelected] = useState<PaymentRow | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(0), [win.fromMs, win.toMs, tab, debouncedSearch, filterKey]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await fetchPaymentsPage({
          from: new Date(win.fromMs),
          to: new Date(win.toMs),
          q: debouncedSearch,
          filters,
          category: tab,
          page,
          pageSize: PAGE_SIZE,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load payments.");
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.fromMs, win.toMs, tab, debouncedSearch, filterKey, page]);

  const { counts, amounts, refundedValue, total, tabTotal, rows } = data;
  const pageCount = Math.max(1, Math.ceil(tabTotal / PAGE_SIZE));

  const clearAll = () => {
    setFilters(EMPTY_PAYMENT_FILTERS);
    setSearch("");
    setDatePreset("30d");
    setDFrom(null);
    setDTo(null);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const full = await fetchPaymentsPage({
        from: new Date(win.fromMs),
        to: new Date(win.toMs),
        q: debouncedSearch,
        filters,
        category: tab,
        all: true,
      });
      const day = new Date().toISOString().slice(0, 10);
      downloadCsv(`krishi-dukan-payments-${day}.csv`, paymentsToCsv(full.rows));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const syncFromRazorpay = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not signed in.");
      let skip = 0;
      let totalScanned = 0;
      let totalWritten = 0;
      let hasMore = true;
      let guard = 0;
      while (hasMore && guard < 50) {
        guard++;
        const res = await fetch("/api/admin/sync-razorpay-payments", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ skip }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d?.error ?? "Sync failed");
        totalScanned += d.scanned ?? 0;
        totalWritten += d.written ?? 0;
        skip = d.nextSkip ?? skip;
        hasMore = Boolean(d.hasMore);
      }
      setSyncResult(`Scanned ${totalScanned} Razorpay payment${totalScanned === 1 ? "" : "s"}, mirrored ${totalWritten}.`);
      await load();
    } catch (e) {
      setSyncResult(e instanceof Error ? `Sync failed: ${e.message}` : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const chipCls = (active: boolean) =>
    `rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
      active
        ? "border-primary bg-primary/10 text-primary"
        : "border-outline/40 bg-surface-container-low text-on-surface hover:bg-surface-container"
    }`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-on-surface">Payments</h1>
          <p className="text-sm text-on-surface-variant">
            Unified Razorpay payments + app checkouts — successful, abandoned, failed and refunded.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={exporting || tabTotal === 0}
            title="Export every record in the current tab, range and filters — not just this page."
            className="flex items-center gap-2 rounded-lg border border-outline/30 px-3 py-2 text-sm font-semibold text-on-surface-variant transition hover:bg-surface-container disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
          <button
            onClick={syncFromRazorpay}
            disabled={syncing}
            title="Mirror Razorpay's payment records into the dashboard (all statuses)."
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <Download className={`h-4 w-4 ${syncing ? "animate-pulse" : ""}`} />
            {syncing ? "Syncing…" : "Sync from Razorpay"}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-outline/30 px-3 py-2 text-sm font-semibold text-on-surface-variant transition hover:bg-surface-container disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {syncResult && (
        <div className="flex items-start gap-2 rounded-xl bg-primary/5 px-4 py-3 text-sm text-on-surface">
          <Download className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>{syncResult}</span>
        </div>
      )}

      {/* Date range presets (custom range is entered via the Date column filter) */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" onClick={() => setDatePreset(p.key)} className={chipCls(datePreset === p.key)}>
            {p.label}
          </button>
        ))}
        {datePreset === "custom" && <span className={chipCls(true)}>Custom range</span>}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="Successful" value={String(counts.successful)} tone="ok" />
        <SummaryCard label="Abandoned" value={String(counts.abandoned)} tone="warn" />
        <SummaryCard label="Failed" value={String(counts.failed)} tone="error" />
        <SummaryCard label="Refunded" value={`${counts.refunded} · ${money(refundedValue)}`} tone="warn" />
        <SummaryCard label="Total" value={String(total)} tone="neutral" />
      </div>

      {/* Analytics */}
      <div className="rounded-2xl border border-outline/15 bg-surface-container/20">
        <button onClick={() => setShowAnalytics((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
          <span className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <BarChart3 className="h-4 w-4 text-primary" />
            Payment analytics
            <span className="text-xs font-normal text-on-surface-variant">
              ({total} payment{total === 1 ? "" : "s"} in view)
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 text-outline transition-transform ${showAnalytics ? "rotate-180" : ""}`} />
        </button>
        {showAnalytics && (
          <div className="border-t border-outline/15 p-4">
            <PaymentPieCharts counts={counts} amounts={amounts} />
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs (status) */}
      <div className="flex flex-wrap gap-4 border-b border-outline/20">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-1 pb-2 text-sm font-semibold ${
              tab === t ? "border-b-2 border-primary text-primary" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {TAB_LABEL[t]}
            <span className="rounded-full bg-surface-container px-1.5 py-0.5 text-[11px] font-bold">
              {t === "all" ? total : counts[t]}
            </span>
          </button>
        ))}
      </div>

      {/* Search + active column-filter chips */}
      <div className="space-y-2">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, payment / order id or product"
            className="w-full rounded-lg border border-outline/30 py-2 pl-9 pr-9 text-sm focus:border-primary focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <PaymentFilterChips filters={filters} onChange={setFilters} onClearAll={clearAll} />
      </div>

      {/* Table */}
      {loading ? (
        <p className="py-16 text-center text-sm text-on-surface-variant">Loading…</p>
      ) : tabTotal === 0 ? (
        <p className="py-16 text-center text-sm text-on-surface-variant">
          No {TAB_LABEL[tab].toLowerCase()} payments match the current filters.
        </p>
      ) : (
        <>
          <PaymentsTable
            rows={rows}
            onView={setSelected}
            filters={filters}
            onFilters={setFilters}
            dateFrom={datePreset === "custom" ? dFrom : null}
            dateTo={datePreset === "custom" ? dTo : null}
            dateActive={datePreset === "custom"}
            onDateChange={({ fromMs, toMs }) => {
              setDFrom(fromMs);
              setDTo(toMs);
              setDatePreset("custom");
            }}
            onDateClear={() => {
              setDatePreset("30d");
              setDFrom(null);
              setDTo(null);
            }}
          />
          <div className="flex items-center justify-between text-sm text-on-surface-variant">
            <span>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, tabTotal)} of {tabTotal}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border border-outline/30 px-3 py-1.5 font-semibold disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs">
                Page {page + 1} / {pageCount}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="rounded-lg border border-outline/30 px-3 py-1.5 font-semibold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {selected && <PaymentDetailsModal row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "error" | "warn" | "ok" | "neutral" }) {
  const toneClass =
    tone === "error" ? "text-red-600" : tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-green-700" : "text-on-surface";
  return (
    <div className="rounded-xl border border-outline/15 bg-white p-4">
      <p className={`text-2xl font-extrabold ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-xs text-on-surface-variant">{label}</p>
    </div>
  );
}
