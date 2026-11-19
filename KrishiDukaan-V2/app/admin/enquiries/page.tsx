"use client";

/**
 * Admin → Enquiries. The same lost-sale enquiries the seller dashboard shows
 * (/dashboard/enquiry), but across EVERY retailer so the platform team can
 * follow up with customers whose checkout failed or was abandoned.
 *
 * Nothing new is written: this reads the shared `enquiries` collection and
 * moves a doc through the same follow-up states (open → contacted → closed)
 * via the shared `setEnquiryStatus`, so a status set here is visible to the
 * retailer and vice-versa. The retailer page and its queries are untouched —
 * admin scope is a separate query that drops the per-seller `sellerPhones`
 * filter (allowed by the `isAdmin()` branch in the enquiries firestore.rules).
 *
 * Laid out like Admin → Orders / Customer payments: one newest-first table with
 * per-column header filters, status tabs on top, and the loss reason as a
 * column filter.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Phone,
  PhoneCall,
  RefreshCw,
  ShoppingCart,
  MessageCircle,
} from "lucide-react";
import {
  setEnquiryStatus,
  toEnquiryDoc,
  type EnquiryStatus,
} from "../../dashboard/_lib/enquiries-firestore";
import {
  adminEnquiriesQuery,
  countAdminEnquiries,
  type EnquiryReason,
} from "./_lib/admin-enquiries-firestore";
import {
  EMPTY_ENQUIRY_FILTERS,
  matchesEnquiryFilters,
  type EnquiryFilters,
} from "./_lib/enquiry-filters";
import {
  ColumnFilter,
  TextFilter,
  AmountFilter,
  DateFilter,
  MultiSelectFilter,
} from "../orders/_components/order-column-filters";
import { usePagedQuery } from "../../lib/use-paged-query";

type Tab = "open" | "contacted" | "closed" | "all";

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** Digits only, +91-prefixed — what tel: and wa.me both want. */
function dialable(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
}

const STATUS_BADGE: Record<EnquiryStatus, { label: string; cls: string }> = {
  open: { label: "Not contacted", cls: "bg-amber-50 text-amber-700" },
  contacted: { label: "Contacted", cls: "bg-blue-50 text-blue-700" },
  closed: { label: "Closed", cls: "bg-surface-container text-on-surface-variant" },
};

const REASON_BADGE: Record<EnquiryReason, { label: string; cls: string }> = {
  failed: { label: "Payment failed", cls: "bg-red-50 text-red-700" },
  abandoned: { label: "Abandoned", cls: "bg-amber-50 text-amber-700" },
};

const TABS: { key: Tab; label: string }[] = [
  { key: "open", label: "Not contacted" },
  { key: "contacted", label: "Contacted" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

const REASON_OPTIONS: { value: EnquiryReason; label: string }[] = [
  { value: "failed", label: "Payment failed" },
  { value: "abandoned", label: "Abandoned" },
];

export default function AdminEnquiriesPage() {
  const [filters, setFilters] = useState<EnquiryFilters>(EMPTY_ENQUIRY_FILTERS);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [counts, setCounts] = useState({ open: 0, contacted: 0, closed: 0, all: 0 });
  const [statusError, setStatusError] = useState<string | null>(null);

  // One newest-first query; every narrowing is client-side (below) so the page
  // needs no composite index to load.
  const base = useMemo(() => adminEnquiriesQuery(), []);
  const paged = usePagedQuery(base, toEnquiryDoc);
  const enquiries = paged.rows;
  const setEnquiries = paged.setRows;
  const loading = paged.loading;
  const error = statusError ?? (paged.error ? "Could not load enquiries. Check your connection and retry." : null);

  const patch = (p: Partial<EnquiryFilters>) => setFilters((f) => ({ ...f, ...p }));

  const loadCounts = useCallback(() => {
    countAdminEnquiries().then(setCounts).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setStatusError(null);
    await paged.reload();
    loadCounts();
  }, [paged.reload, loadCounts]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const handleStatus = async (id: string, status: EnquiryStatus) => {
    setBusyId(id);
    // Optimistic: the row moves to its new status immediately, and is put back
    // if the write is rejected.
    const previous = enquiries;
    const from = enquiries.find((r) => r.id === id)?.status;
    setEnquiries((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    if (from && from !== status) {
      setCounts((c) => ({ ...c, [from]: Math.max(0, c[from] - 1), [status]: c[status] + 1 }));
    }
    try {
      await setEnquiryStatus(id, status);
    } catch (e) {
      console.error("[admin-enquiry] status update failed:", e);
      setEnquiries(previous);
      loadCounts();
      setStatusError("Could not update that enquiry. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const visible = useMemo(
    () => enquiries.filter((e) => matchesEnquiryFilters(e, filters)),
    [enquiries, filters],
  );

  const dateActive = filters.fromMs !== null || filters.toMs !== null;
  const amountActive = !!(filters.amount.min.trim() || filters.amount.max.trim());

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <div className="mb-1 flex items-center gap-2 sm:gap-3">
          <PhoneCall className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
          <h1 className="text-lg font-black text-on-surface sm:text-2xl">Enquiries</h1>
        </div>
        <p className="ml-7 max-w-2xl text-xs text-on-surface-variant sm:ml-9 sm:text-sm">
          Customers who started an order but didn&apos;t complete payment, across every retailer.
          Call them to find out what went wrong — the sale may still be there.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => patch({ status: key })}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                filters.status === key
                  ? "bg-primary text-white"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              {label} ({counts[key]})
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-2 text-xs font-bold text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : enquiries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/40 px-6 py-14 text-center">
          <ShoppingCart className="mx-auto h-10 w-10 text-on-surface-variant/40" />
          <p className="mt-3 text-base font-bold text-on-surface">No enquiries yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-on-surface-variant">
            When a customer starts ordering online and doesn&apos;t finish paying, they show up here
            with their number so the team can follow up.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-outline/15 bg-white">
            <table className="w-full min-w-[64rem] text-sm">
              <thead className="border-b border-outline/15 bg-surface-container/40 text-left text-xs uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">
                    <ColumnFilter label="Date &amp; time" active={dateActive} onClear={() => patch({ fromMs: null, toMs: null })}>
                      <DateFilter fromMs={filters.fromMs} toMs={filters.toMs} onChange={({ fromMs, toMs }) => patch({ fromMs, toMs })} />
                    </ColumnFilter>
                  </th>
                  <th className="px-3 py-2.5 font-semibold">
                    <ColumnFilter label="Customer" active={!!filters.customer.trim()} onClear={() => patch({ customer: "" })}>
                      <TextFilter value={filters.customer} onChange={(v) => patch({ customer: v })} placeholder="Customer name…" />
                    </ColumnFilter>
                  </th>
                  <th className="px-3 py-2.5 font-semibold">
                    <ColumnFilter label="Phone" active={!!filters.phone.trim()} onClear={() => patch({ phone: "" })}>
                      <TextFilter value={filters.phone} onChange={(v) => patch({ phone: v })} placeholder="Phone number…" />
                    </ColumnFilter>
                  </th>
                  <th className="px-3 py-2.5 font-semibold">
                    <ColumnFilter label="Product" active={!!filters.product.trim()} onClear={() => patch({ product: "" })}>
                      <TextFilter value={filters.product} onChange={(v) => patch({ product: v })} placeholder="Product name…" />
                    </ColumnFilter>
                  </th>
                  <th className="px-3 py-2.5 font-semibold">
                    <ColumnFilter label="Retailer" active={!!filters.retailer.trim()} onClear={() => patch({ retailer: "" })}>
                      <TextFilter value={filters.retailer} onChange={(v) => patch({ retailer: v })} placeholder="Retailer name…" />
                    </ColumnFilter>
                  </th>
                  <th className="px-3 py-2.5 font-semibold">
                    <ColumnFilter label="Reason" active={filters.reasons.length > 0} onClear={() => patch({ reasons: [] })}>
                      <MultiSelectFilter
                        searchable={false}
                        options={REASON_OPTIONS}
                        selected={filters.reasons}
                        onChange={(next) => patch({ reasons: next as EnquiryReason[] })}
                      />
                    </ColumnFilter>
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    <ColumnFilter label="Amount" align="right" active={amountActive} onClear={() => patch({ amount: { op: "range", min: "", max: "" } })}>
                      <AmountFilter amount={filters.amount} onChange={(amount) => patch({ amount })} />
                    </ColumnFilter>
                  </th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => {
                  const who = e.buyerName || "Customer";
                  const phone = e.buyerPhone?.trim();
                  const tel = phone ? dialable(phone) : "";
                  const retailer = e.sellerName?.trim() || e.sellerPhone?.trim() || "Unknown retailer";
                  const product = e.itemSummary || e.items.map((i) => i.name).join(", ") || "—";
                  const reason = REASON_BADGE[e.reason];
                  const sbadge = STATUS_BADGE[e.status];
                  const waText = encodeURIComponent(
                    `Namaste ${who}, you were ordering ${e.itemSummary || "a product"} but the payment didn't go through. Can I help you complete it?`,
                  );
                  const busy = busyId === e.id;
                  return (
                    <tr key={e.id} className="border-b border-outline/10 align-top transition hover:bg-surface-container/30">
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-on-surface-variant">
                        {e.createdAt ? e.createdAt.toLocaleString("en-IN") : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="block max-w-[10rem] truncate font-semibold text-on-surface" title={who}>{who}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {phone ? (
                          <a href={`tel:+${tel}`} className="flex items-center gap-1 font-mono text-xs text-primary hover:underline">
                            <Phone className="h-3 w-3" />
                            {phone}
                          </a>
                        ) : (
                          <span className="text-outline">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="block max-w-[14rem] truncate text-on-surface-variant" title={product}>{product}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="block max-w-[12rem] truncate text-on-surface" title={retailer}>{retailer}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${reason.cls}`}>
                          {reason.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-on-surface">{inr(e.value)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${sbadge.cls}`}>
                          {sbadge.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {tel && (
                            <>
                              <a
                                href={`tel:+${tel}`}
                                title={`Call ${who}`}
                                className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-white transition hover:opacity-90"
                              >
                                <Phone className="h-3.5 w-3.5" /> Call
                              </a>
                              <a
                                href={`https://wa.me/${tel}?text=${waText}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="WhatsApp"
                                className="inline-flex items-center rounded-lg border border-outline/30 p-1.5 text-on-surface-variant transition hover:bg-surface-container"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </a>
                            </>
                          )}
                          {e.status !== "contacted" && e.status !== "closed" && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleStatus(e.id, "contacted")}
                              className="whitespace-nowrap rounded-lg border border-outline/30 px-2.5 py-1.5 text-xs font-semibold text-on-surface-variant transition hover:bg-surface-container disabled:opacity-50"
                            >
                              Mark contacted
                            </button>
                          )}
                          {e.status !== "closed" && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleStatus(e.id, "closed")}
                              className="whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold text-on-surface-variant transition hover:text-on-surface disabled:opacity-50"
                            >
                              Close
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-12 text-center">
                      <CheckCircle2 className="mx-auto h-8 w-8 text-on-surface-variant/40" />
                      <p className="mt-2 text-sm font-semibold text-on-surface">No enquiries match these filters.</p>
                      <p className="mt-0.5 text-xs text-on-surface-variant">Try a different status tab, clear a column filter, or load older enquiries.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {paged.hasMore && (
            <div className="flex justify-center py-1">
              <button
                type="button"
                onClick={() => void paged.loadMore()}
                disabled={paged.loadingMore}
                className="rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-container disabled:opacity-60"
              >
                {paged.loadingMore ? "Loading…" : "Load older enquiries"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
