"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Search, MapPin, Pencil, Trash2, Download, Loader2, Store,
  ChevronUp, ChevronDown, ChevronsUpDown, Image as ImageIcon,
} from "lucide-react";
import type { Dealer } from "../../../../sales/dealers/dealers-service";
import { useAdminAuth, hasSection } from "../../../_context/admin-auth-context";
import { DealerEditModal } from "./DealerEditModal";
import { DealerDeleteDialog } from "./DealerDeleteDialog";
import { DealerDetailDrawer } from "./DealerDetailDrawer";
import { auth } from "../../../../firebase";
import { statusLabel, statusColor } from "../../_lib/dealer-status";

const PAGE_SIZE = 25;

type SortKey = "shopName" | "ownerName" | "phone" | "type" | "createdAt";
type SortDir = "asc" | "desc";

const TYPE_LABEL: Record<string, string> = {
  retailer: "Retailer",
  distributor: "Distributor",
  manufacturer: "Manufacturer",
};

const INTEREST_LABEL: Record<string, string> = {
  low: "Low",
  considering: "Considering",
  veryInterested: "Very Interested",
};

function normalizePhone(p: string): string {
  return p.replace(/[\s\+\-]/g, "").replace(/^91/, "");
}

/** Case-insensitive match across shop name, owner, phone, address, status. */
export function matchesSearch(dealer: Dealer, raw: string): boolean {
  if (!raw.trim()) return true;
  const q = raw.toLowerCase();
  if (dealer.shopName.toLowerCase().includes(q)) return true;
  if (dealer.ownerName.toLowerCase().includes(q)) return true;
  if (dealer.address.toLowerCase().includes(q)) return true;
  if (dealer.status && dealer.status.toLowerCase().includes(q)) return true;
  if (dealer.status && statusLabel(dealer.status).toLowerCase().includes(q)) return true;
  const normQ = normalizePhone(q);
  if (normQ && normalizePhone(dealer.phone).includes(normQ)) return true;
  return false;
}

function formatDate(ts: unknown): string {
  if (!ts) return "—";
  try {
    const d = (ts as any).toDate ? (ts as any).toDate() : new Date(ts as string);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  } catch { return "—"; }
}

function SortIcon({ col, sortKey, dir }: { col: SortKey; sortKey: SortKey; dir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="h-3.5 w-3.5 opacity-30" />;
  return dir === "asc"
    ? <ChevronUp className="h-3.5 w-3.5 text-primary" />
    : <ChevronDown className="h-3.5 w-3.5 text-primary" />;
}

/** Sync ?dealer= query param without touching the hash tab. */
function setDealerParam(dealerId: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (dealerId) url.searchParams.set("dealer", dealerId);
  else url.searchParams.delete("dealer");
  window.history.pushState(null, "", url.toString());
}

function readDealerParam(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("dealer");
}

type Props = {
  dealers: Dealer[];
  execId: string;
  execName: string;
  onDealerUpdated: (dealerId: string, updated: Dealer | null) => void;
};

export function DealersTab({ dealers, execId, execName, onDealerUpdated }: Props) {
  const identity = useAdminAuth();
  const canEdit = hasSection(identity, "salesDealerEdit");
  const canDelete = hasSection(identity, "salesDealerDelete");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Dealer | null>(null);
  const [deleting, setDeleting] = useState<Dealer | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Drawer state — synced to ?dealer= URL param
  const [selectedId, setSelectedId] = useState<string | null>(() => readDealerParam());

  // Sync drawer open state from browser back/forward navigation
  useEffect(() => {
    const onPop = () => setSelectedId(readDealerParam());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openDrawer = useCallback((dealerId: string) => {
    setSelectedId(dealerId);
    setDealerParam(dealerId);
  }, []);

  const closeDrawer = useCallback(() => {
    setSelectedId(null);
    setDealerParam(null);
  }, []);

  const selectedDealer = useMemo(
    () => dealers.find((d) => d.id === selectedId) ?? null,
    [dealers, selectedId],
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const filtered = useMemo(() => {
    let list = dealers;
    if (fromDate || toDate) {
      list = list.filter((d) => {
        if (!d.createdAt) return true;
        try {
          const ts = (d.createdAt as any).toDate ? (d.createdAt as any).toDate() : new Date(d.createdAt as string);
          const dateStr = ts.toISOString().slice(0, 10);
          if (fromDate && dateStr < fromDate) return false;
          if (toDate && dateStr > toDate) return false;
        } catch { return true; }
        return true;
      });
    }
    if (debouncedSearch) list = list.filter((d) => matchesSearch(d, debouncedSearch));
    return [...list].sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortKey === "createdAt") {
        va = (a.createdAt as any)?.toMillis?.() ?? 0;
        vb = (b.createdAt as any)?.toMillis?.() ?? 0;
      } else {
        va = String((a as any)[sortKey] ?? "").toLowerCase();
        vb = String((b as any)[sortKey] ?? "").toLowerCase();
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [dealers, debouncedSearch, fromDate, toDate, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
      else setSortDir("asc");
      return key;
    });
    setPage(1);
  }, []);

  const downloadCsv = async () => {
    setDownloading(true);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const resp = await fetch(
        `/api/admin/sales-team/${execId}/dealers/csv?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!resp.ok) throw new Error(await resp.text());
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = resp.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? "dealers.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("CSV download failed:", e);
      alert("Download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const openMaps = (dealer: Dealer) => {
    if (dealer.geo) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${dealer.geo.latitude},${dealer.geo.longitude}`, "_blank");
    } else if (dealer.address) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dealer.address)}`, "_blank");
    }
  };

  const hasMapLink = (d: Dealer) => Boolean(d.geo || d.address);

  const thCls = "px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant whitespace-nowrap select-none";
  const tdCls = "px-3 py-2 text-sm text-on-surface align-middle";

  // Icon-only action button — always stops event propagation so the row click (drawer) is not triggered
  const ActionBtn = ({
    onClick, disabled, title, label, children, danger,
  }: {
    onClick: (e: React.MouseEvent) => void;
    disabled?: boolean;
    title: string;
    label: string;
    children: React.ReactNode;
    danger?: boolean;
  }) => (
    <button
      type="button"
      title={title}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "border-red-200 text-red-500 hover:bg-red-50"
          : "border-outline-variant/40 text-on-surface-variant hover:bg-surface-container"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dealers…"
            className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">From</span>
          <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-1.5 text-sm outline-none focus:border-primary" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">To</span>
          <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-1.5 text-sm outline-none focus:border-primary" />
        </label>
        <button
          type="button"
          onClick={() => void downloadCsv()}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-2 text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-60 ml-auto"
        >
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download Dealers CSV
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
        {dealers.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Store className="mx-auto mb-2 h-6 w-6 text-outline" />
            <p className="text-sm font-semibold text-on-surface">No dealers added yet</p>
            <p className="mt-1 text-xs text-on-surface-variant">This executive hasn't added any dealers in the field app.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Search className="mx-auto mb-2 h-6 w-6 text-outline" />
            <p className="text-sm font-semibold text-on-surface">No results for "{debouncedSearch}"</p>
            <p className="mt-1 text-xs text-on-surface-variant">Try a different search term or clear the filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/20 bg-surface-container-low">
                  {(["shopName", "ownerName", "phone", "type"] as SortKey[]).map((col) => {
                    const labels: Record<SortKey, string> = {
                      shopName: "Shop / Dealer", ownerName: "Owner", phone: "Phone",
                      type: "Type", createdAt: "Added On",
                    };
                    return (
                      <th key={col} className={thCls}>
                        <button type="button" onClick={() => toggleSort(col)} className="flex items-center gap-1 hover:text-on-surface transition-colors">
                          {labels[col]}
                          <SortIcon col={col} sortKey={sortKey} dir={sortDir} />
                        </button>
                      </th>
                    );
                  })}
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Interest</th>
                  <th className={`${thCls} w-32`}>Location</th>
                  <th className={thCls}>
                    <button type="button" onClick={() => toggleSort("createdAt")} className="flex items-center gap-1 hover:text-on-surface transition-colors">
                      Added On <SortIcon col="createdAt" sortKey={sortKey} dir={sortDir} />
                    </button>
                  </th>
                  <th className={`${thCls} w-24`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((d, i) => (
                  <tr
                    key={d.id}
                    onClick={() => openDrawer(d.id)}
                    className={`border-b border-outline-variant/10 cursor-pointer ${
                      d.id === selectedId
                        ? "bg-primary/5"
                        : i % 2 === 0 ? "" : "bg-surface-container/30"
                    } hover:bg-primary/5 transition-colors`}
                  >
                    {/* Shop name + thumbnail hint */}
                    <td className={tdCls}>
                      <div className="flex items-center gap-2 min-w-0">
                        {d.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={d.imageUrl}
                            alt=""
                            aria-hidden
                            className="h-6 w-6 shrink-0 rounded-md object-cover ring-1 ring-outline/10"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div className="h-6 w-6 shrink-0 rounded-md bg-primary/10 flex items-center justify-center">
                            <Store className="h-3 w-3 text-primary" />
                          </div>
                        )}
                        <p className="font-semibold text-on-surface truncate max-w-[140px]">{d.shopName}</p>
                      </div>
                    </td>
                    <td className={`${tdCls} max-w-[100px]`}>
                      <p className="truncate">{d.ownerName}</p>
                    </td>
                    <td className={tdCls}>{d.phone}</td>
                    <td className={tdCls}>
                      <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary whitespace-nowrap">
                        {TYPE_LABEL[d.type] ?? d.type}
                      </span>
                    </td>
                    <td className={tdCls}>
                      {d.status ? (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${statusColor(d.status)}`}>
                          {statusLabel(d.status)}
                        </span>
                      ) : <span className="text-xs text-outline">—</span>}
                    </td>
                    <td className={tdCls}>
                      {d.interest ? (
                        <span className="text-xs text-on-surface-variant whitespace-nowrap">{INTEREST_LABEL[d.interest] ?? d.interest}</span>
                      ) : <span className="text-xs text-outline">—</span>}
                    </td>
                    <td className={`${tdCls} w-32`}>
                      <p className="text-xs text-on-surface-variant truncate max-w-[120px]" title={d.address}>{d.address || "—"}</p>
                    </td>
                    <td className={tdCls}>
                      <span className="text-xs whitespace-nowrap">{formatDate(d.createdAt)}</span>
                    </td>
                    {/* Icon-only actions — stopPropagation so row click (drawer) is NOT triggered */}
                    <td className={`${tdCls} w-24`} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <ActionBtn
                          title="View on Google Maps"
                          label="View on map"
                          disabled={!hasMapLink(d)}
                          onClick={() => openMaps(d)}
                        >
                          <MapPin className="h-3.5 w-3.5" />
                        </ActionBtn>
                        {canEdit && (
                          <ActionBtn
                            title="Edit dealer"
                            label="Edit dealer"
                            onClick={() => setEditing(d)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </ActionBtn>
                        )}
                        {canDelete && (
                          <ActionBtn
                            title="Delete dealer"
                            label="Delete dealer"
                            danger
                            onClick={() => setDeleting(d)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </ActionBtn>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-on-surface-variant">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} dealers
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-outline-variant/40 px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-40 transition-colors"
            >Prev</button>
            <span className="px-3 text-xs text-on-surface-variant">{page} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-outline-variant/40 px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-40 transition-colors"
            >Next</button>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {selectedDealer && (
        <DealerDetailDrawer
          dealer={selectedDealer}
          execId={execId}
          canEdit={canEdit}
          canDelete={canDelete}
          onEdit={() => { closeDrawer(); setEditing(selectedDealer); }}
          onDelete={() => { closeDrawer(); setDeleting(selectedDealer); }}
          onClose={closeDrawer}
        />
      )}

      {editing && (
        <DealerEditModal
          dealer={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            onDealerUpdated(updated.id, updated);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <DealerDeleteDialog
          dealer={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(id) => {
            onDealerUpdated(id, null);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
