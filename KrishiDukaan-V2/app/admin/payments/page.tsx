"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { auth } from "../../firebase";
import { DateRangePicker, useDateRange } from "../_components/analytics/ui";
import {
  downloadCsv,
  fetchPaymentRows,
  money,
  paymentsToCsv,
  CATEGORY_LABEL,
  PLATFORM_LABEL,
  type PaymentRow,
  type Category,
  type Platform,
} from "./_lib/payments";
import { PaymentsTable } from "./_components/payments-table";
import { PaymentDetailsModal } from "./_components/payment-details-modal";
import { PaymentPieCharts } from "./_components/payment-pie-charts";

/**
 * Admin → Payments.
 *
 * Unified view of two sources, correlated at read time by Razorpay order id:
 *   razorpayPayments — gateway truth (one doc per payment id).
 *   paymentAttempts  — app checkout sessions (one doc per order id).
 *
 * Categories (mutually exclusive, deduped): Successful, Abandoned (gateway
 * timeouts + app-only closed/cancelled checkouts), Failed (genuine gateway
 * failures only), Refunded, Pending, Unresolved (app-paid with no gateway
 * payment — flagged, never guessed). See _lib/payments.ts for the decision table.
 */

const PAGE_SIZE = 25;

type Tab = "all" | Category;
const TABS: Tab[] = ["all", "successful", "abandoned", "failed", "refunded", "pending", "unresolved"];
const TAB_LABEL: Record<Tab, string> = { all: "All", ...CATEGORY_LABEL };

const PLATFORM_OPTIONS: { value: Platform | "all"; label: string }[] = [
  { value: "all", label: "All platforms" },
  { value: "app", label: "App" },
  { value: "web", label: "Web" },
  { value: "razorpay", label: "Razorpay (synced)" },
  { value: "unknown", label: "Unknown" },
];

export default function AdminPaymentsPage() {
  const dr = useDateRange("30d");
  const { from, to } = dr.range;

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("all");
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selected, setSelected] = useState<PaymentRow | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchPaymentRows(from, to));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not load payments. Check the Firestore rules for razorpayPayments.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.getTime(), to.getTime()]);

  useEffect(() => setPage(0), [tab, platform, search]);

  // Range rows after platform + text filters, but NOT the tab — charts and the
  // summary read this so they always show the full distribution.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (platform !== "all" && r.platform !== platform) return false;
      if (!q) return true;
      return (
        (r.phone ?? "").toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.paymentId ?? "").toLowerCase().includes(q) ||
        (r.orderId ?? "").toLowerCase().includes(q) ||
        r.product.toLowerCase().includes(q)
      );
    });
  }, [rows, platform, search]);

  const counts = useMemo(() => {
    const c: Record<Category, number> = {
      successful: 0,
      abandoned: 0,
      failed: 0,
      refunded: 0,
      pending: 0,
      unresolved: 0,
    };
    for (const r of filtered) c[r.category] += 1;
    return c;
  }, [filtered]);

  const refundedValue = useMemo(
    () => filtered.reduce((s, r) => s + (r.payment?.amountRefunded ?? 0), 0),
    [filtered],
  );

  const tabRows = useMemo(
    () => (tab === "all" ? filtered : filtered.filter((r) => r.category === tab)),
    [filtered, tab],
  );

  const pageRows = useMemo(
    () => tabRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [tabRows, page],
  );
  const pageCount = Math.max(1, Math.ceil(tabRows.length / PAGE_SIZE));

  const exportCsv = () => {
    const csv = paymentsToCsv(tabRows);
    const day = new Date().toISOString().slice(0, 10);
    downloadCsv(`krishi-dukan-payments-${day}.csv`, csv);
  };

  // Mirror Razorpay's payment records into `razorpayPayments` (all statuses),
  // then reload. Idempotent server-side (keyed by payment id).
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
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Sync failed");
        totalScanned += data.scanned ?? 0;
        totalWritten += data.written ?? 0;
        skip = data.nextSkip ?? skip;
        hasMore = Boolean(data.hasMore);
      }
      setSyncResult(
        `Scanned ${totalScanned} Razorpay payment${totalScanned === 1 ? "" : "s"}, mirrored ${totalWritten}.`,
      );
      await reload();
    } catch (e) {
      setSyncResult(e instanceof Error ? `Sync failed: ${e.message}` : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-on-surface">Payments</h1>
          <p className="text-sm text-on-surface-variant">
            Every Razorpay payment in the selected range — captured, failed, abandoned and refunded.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={tabRows.length === 0}
            title="Export every record in the current tab, range and filters — not just this page."
            className="flex items-center gap-2 rounded-lg border border-outline/30 px-3 py-2 text-sm font-semibold text-on-surface-variant transition hover:bg-surface-container disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export CSV
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
            onClick={reload}
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

      {/* Date range */}
      <DateRangePicker {...dr} />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="Successful" value={String(counts.successful)} tone="ok" />
        <SummaryCard label="Abandoned" value={String(counts.abandoned)} tone="warn" />
        <SummaryCard label="Failed" value={String(counts.failed)} tone="error" />
        <SummaryCard label="Refunded" value={`${counts.refunded} · ${money(refundedValue)}`} tone="warn" />
        <SummaryCard label="Total" value={String(filtered.length)} tone="neutral" />
      </div>

      {/* Analytics (collapsible) */}
      <div className="rounded-2xl border border-outline/15 bg-surface-container/20">
        <button
          onClick={() => setShowAnalytics((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <BarChart3 className="h-4 w-4 text-primary" />
            Payment analytics
            <span className="text-xs font-normal text-on-surface-variant">
              ({filtered.length} payment{filtered.length === 1 ? "" : "s"} in view)
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 text-outline transition-transform ${showAnalytics ? "rotate-180" : ""}`} />
        </button>
        {showAnalytics && (
          <div className="border-t border-outline/15 p-4">
            <PaymentPieCharts rows={filtered} />
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-4 border-b border-outline/20">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-1 pb-2 text-sm font-semibold ${
              tab === t
                ? "border-b-2 border-primary text-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {TAB_LABEL[t]}
            <span className="rounded-full bg-surface-container px-1.5 py-0.5 text-[11px] font-bold">
              {t === "all" ? filtered.length : counts[t]}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, payment / order id or product"
            className="w-full rounded-lg border border-outline/30 py-2 pl-9 pr-9 text-sm focus:border-primary focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as Platform | "all")}
          className="rounded-lg border border-outline/30 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          {PLATFORM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <p className="py-16 text-center text-sm text-on-surface-variant">Loading…</p>
      ) : tabRows.length === 0 ? (
        <p className="py-16 text-center text-sm text-on-surface-variant">
          {search || platform !== "all"
            ? `No ${TAB_LABEL[tab].toLowerCase()} payments match the current filters.`
            : `No ${TAB_LABEL[tab].toLowerCase()} payments in this range.`}
        </p>
      ) : (
        <>
          <PaymentsTable rows={pageRows} onView={setSelected} />
          <div className="flex items-center justify-between text-sm text-on-surface-variant">
            <span>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, tabRows.length)} of{" "}
              {tabRows.length}
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

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "error" | "warn" | "ok" | "neutral";
}) {
  const toneClass =
    tone === "error"
      ? "text-red-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "ok"
          ? "text-green-700"
          : "text-on-surface";
  return (
    <div className="rounded-xl border border-outline/15 bg-white p-4">
      <p className={`text-2xl font-extrabold ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-xs text-on-surface-variant">{label}</p>
    </div>
  );
}
