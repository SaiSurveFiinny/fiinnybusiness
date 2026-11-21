"use client";

import { useState, useMemo } from "react";
import { Download, Activity } from "lucide-react";
import type { Dealer } from "../../../../sales/dealers/dealers-service";
import {
  PREDEFINED_STATUSES,
  statusLabel,
  statusColor,
} from "../../_lib/dealer-status";
import { buildCsv, downloadCsv, safeFilename, todayISO } from "../../../../admin/_lib/csv";

type Props = {
  dealers: Dealer[];
  execName: string;
};

const TYPE_LABEL: Record<string, string> = {
  retailer: "Retailer",
  distributor: "Distributor",
  manufacturer: "Manufacturer",
};

function formatDate(ts: unknown): string {
  if (!ts) return "—";
  try {
    const d = (ts as any).toDate ? (ts as any).toDate() : new Date(ts as string);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
    });
  } catch {
    return "—";
  }
}

/** Collect every status value present in this exec's dealers (predefined + custom). */
function allStatuses(dealers: Dealer[]): string[] {
  const seen = new Set<string>();
  for (const d of dealers) {
    if (d.status) seen.add(d.status);
  }
  // Predefined ones first (in order), then custom ones alphabetically
  const predefined = PREDEFINED_STATUSES.filter((s) => seen.has(s));
  const custom = Array.from(seen)
    .filter((s) => !(PREDEFINED_STATUSES as readonly string[]).includes(s))
    .sort();
  return [...predefined, ...custom];
}

export function StatusTab({ dealers, execName }: Props) {
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const statusesInUse = useMemo(() => allStatuses(dealers), [dealers]);

  const filtered = useMemo(
    () => activeFilter === "all"
      ? dealers
      : activeFilter === "none"
        ? dealers.filter((d) => !d.status)
        : dealers.filter((d) => d.status === activeFilter),
    [dealers, activeFilter],
  );

  // Count per status for filter chips
  const countByStatus = useMemo(() => {
    const map = new Map<string, number>();
    map.set("none", 0);
    for (const d of dealers) {
      if (d.status) map.set(d.status, (map.get(d.status) ?? 0) + 1);
      else map.set("none", (map.get("none") ?? 0) + 1);
    }
    return map;
  }, [dealers]);

  const handleExport = () => {
    type Row = { shopName: string; ownerName: string; phone: string; type: string; status: string; address: string; addedOn: string };
    const headers: Array<{ key: keyof Row; label: string }> = [
      { key: "shopName",  label: "Dealer/Shop Name" },
      { key: "ownerName", label: "Owner Name" },
      { key: "phone",     label: "Phone" },
      { key: "type",      label: "Dealer Type" },
      { key: "status",    label: "Current Status" },
      { key: "address",   label: "Address" },
      { key: "addedOn",   label: "Added On" },
    ];
    const rows: Row[] = filtered.map((d) => ({
      shopName:  d.shopName,
      ownerName: d.ownerName,
      phone:     d.phone,
      type:      TYPE_LABEL[d.type] ?? d.type,
      status:    statusLabel(d.status),
      address:   d.address,
      addedOn:   formatDate(d.createdAt),
    }));
    const csv = buildCsv(headers, rows);
    const suffix = activeFilter === "all" ? "all" : activeFilter === "none" ? "no_status" : activeFilter;
    downloadCsv(csv, `${safeFilename(execName)}_status_${suffix}_${todayISO()}.csv`);
  };

  const chipCls = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
      active
        ? "border-primary bg-primary text-white"
        : "border-outline-variant/40 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container"
    }`;

  const thCls = "px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant whitespace-nowrap";
  const tdCls = "px-3 py-3 text-sm text-on-surface align-top";

  return (
    <div className="space-y-4">
      {/* Filter chips + export */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveFilter("all")}
          className={chipCls(activeFilter === "all")}
        >
          All
          <span className={`rounded-full px-1.5 text-[10px] font-bold ${activeFilter === "all" ? "bg-white/20 text-white" : "bg-surface-container text-on-surface-variant"}`}>
            {dealers.length}
          </span>
        </button>

        {statusesInUse.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setActiveFilter(s)}
            className={chipCls(activeFilter === s)}
          >
            {statusLabel(s)}
            <span className={`rounded-full px-1.5 text-[10px] font-bold ${activeFilter === s ? "bg-white/20 text-white" : "bg-surface-container text-on-surface-variant"}`}>
              {countByStatus.get(s) ?? 0}
            </span>
          </button>
        ))}

        {(countByStatus.get("none") ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => setActiveFilter("none")}
            className={chipCls(activeFilter === "none")}
          >
            No status
            <span className={`rounded-full px-1.5 text-[10px] font-bold ${activeFilter === "none" ? "bg-white/20 text-white" : "bg-surface-container text-on-surface-variant"}`}>
              {countByStatus.get("none") ?? 0}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={handleExport}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-2 text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
        {dealers.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Activity className="mx-auto mb-2 h-6 w-6 text-outline" />
            <p className="text-sm font-semibold text-on-surface">No dealers yet</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              Status will appear here once the executive adds dealers and sets their status in the app.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Activity className="mx-auto mb-2 h-6 w-6 text-outline" />
            <p className="text-sm font-semibold text-on-surface">No dealers with this status</p>
            <p className="mt-1 text-xs text-on-surface-variant">Try a different filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/20 bg-surface-container-low">
                  <th className={thCls}>Shop / Dealer</th>
                  <th className={thCls}>Owner</th>
                  <th className={thCls}>Phone</th>
                  <th className={thCls}>Type</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Added On</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => (
                  <tr
                    key={d.id}
                    className={`border-b border-outline-variant/10 ${i % 2 === 0 ? "" : "bg-surface-container/30"} hover:bg-primary/5 transition-colors`}
                  >
                    <td className={tdCls}>
                      <p className="font-semibold text-on-surface">{d.shopName}</p>
                      {d.address && (
                        <p className="text-[11px] text-on-surface-variant mt-0.5 line-clamp-1">{d.address}</p>
                      )}
                    </td>
                    <td className={tdCls}>{d.ownerName}</td>
                    <td className={tdCls}>{d.phone}</td>
                    <td className={tdCls}>
                      <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                        {TYPE_LABEL[d.type] ?? d.type}
                      </span>
                    </td>
                    <td className={tdCls}>
                      {d.status ? (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${statusColor(d.status)}`}>
                          {statusLabel(d.status)}
                        </span>
                      ) : (
                        <span className="text-xs text-outline">—</span>
                      )}
                    </td>
                    <td className={tdCls}>
                      <span className="text-xs">{formatDate(d.createdAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-on-surface-variant text-right">
          {filtered.length} dealer{filtered.length !== 1 ? "s" : ""}
          {activeFilter !== "all" && ` · filtered by "${statusLabel(activeFilter === "none" ? undefined : activeFilter) || "No status"}"`}
        </p>
      )}
    </div>
  );
}
