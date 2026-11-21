"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, ChevronLeft, ChevronRight, Loader2, ClipboardList } from "lucide-react";
import { auth } from "../../../firebase";
import { AuditDiffDrawer } from "./AuditDiffDrawer";

type AuditEntry = {
  id: string;
  timestamp: string | null;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string | null;
  module: string | null;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  changedFields: string[] | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-amber-100 text-amber-700",
  DELETE: "bg-red-100 text-red-700",
  EXPORT: "bg-blue-100 text-blue-700",
};

function formatTime(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "EXPORT"];
const MODULES = ["sales_team"];
const ENTITY_TYPES = ["dealer", "sales_executive", "dealer_visit", "day_session"];

export function AuditLogTable() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterModule, setFilterModule] = useState("");
  const [filterEntity, setFilterEntity] = useState("");

  // Pagination
  const [cursors, setCursors] = useState<string[]>([]); // stack of previous-page cursors
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const fetchPage = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not signed in.");
      const token = await user.getIdToken();
      const params = new URLSearchParams({ limit: "50" });
      if (cursor) params.set("cursor", cursor);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (filterAction) params.set("action", filterAction);
      if (filterModule) params.set("module", filterModule);
      if (filterEntity) params.set("entity", filterEntity);
      const resp = await fetch(`/api/admin/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error ?? "Failed to load.");
      const data = await resp.json();
      setEntries(data.logs ?? []);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, filterAction, filterModule, filterEntity]);

  useEffect(() => {
    setCursors([]);
    void fetchPage();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, filterAction, filterModule, filterEntity]);

  const goNext = () => {
    if (!nextCursor) return;
    setCursors((prev) => [...prev, entries[0]?.id ?? ""]); // push first id of current page
    void fetchPage(nextCursor);
  };

  const goPrev = () => {
    const prev = [...cursors];
    const c = prev.pop();
    setCursors(prev);
    void fetchPage(c === "" ? undefined : c);
  };

  // Client-side search over loaded page
  const visible = search.trim()
    ? entries.filter((e) => {
        const q = search.toLowerCase();
        return (
          e.entityName?.toLowerCase().includes(q) ||
          e.actorName?.toLowerCase().includes(q) ||
          e.action?.toLowerCase().includes(q) ||
          e.entityType?.toLowerCase().includes(q)
        );
      })
    : entries;

  const selectCls = "rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-1.5 text-sm text-on-surface outline-none focus:border-primary";

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entries…"
            className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">From</span>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={selectCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">To</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={selectCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">Action</span>
          <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className={selectCls}>
            <option value="">All</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">Module</span>
          <select value={filterModule} onChange={(e) => setFilterModule(e.target.value)} className={selectCls}>
            <option value="">All</option>
            {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">Entity</span>
          <select value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)} className={selectCls}>
            <option value="">All</option>
            {ENTITY_TYPES.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
        {loading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-on-surface-variant">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : error ? (
          <div className="px-5 py-8 text-center text-sm text-red-600">{error}</div>
        ) : visible.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <ClipboardList className="mx-auto mb-2 h-6 w-6 text-outline" />
            <p className="text-sm font-semibold text-on-surface">No audit log entries</p>
            <p className="mt-1 text-xs text-on-surface-variant">Edits, deletes and exports from Sales Team will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/20 bg-surface-container-low">
                  {["Time", "Actor", "Action", "Module", "Entity", "Summary"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((e, i) => (
                  <tr
                    key={e.id}
                    onClick={() => setSelected(e)}
                    className={`border-b border-outline-variant/10 cursor-pointer ${i % 2 === 0 ? "" : "bg-surface-container/30"} hover:bg-primary/5 transition-colors`}
                  >
                    <td className="px-3 py-3 text-xs text-on-surface-variant whitespace-nowrap">{formatTime(e.timestamp)}</td>
                    <td className="px-3 py-3 text-sm font-medium text-on-surface">{e.actorName ?? e.actorId ?? "—"}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${ACTION_COLORS[e.action ?? ""] ?? "bg-surface-container text-on-surface-variant"}`}>
                        {e.action ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-on-surface-variant">{e.module ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-on-surface-variant">{e.entityType ?? "—"}</td>
                    <td className="px-3 py-3 text-sm text-on-surface max-w-[240px]">
                      <p className="truncate">{e.entityName ?? e.entityId ?? "—"}</p>
                      {e.changedFields && e.changedFields.length > 0 && (
                        <p className="text-[11px] text-on-surface-variant mt-0.5 truncate">
                          {e.changedFields.join(", ")}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={cursors.length === 0 || loading}
          className="inline-flex items-center gap-1 rounded-xl border border-outline-variant/40 px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-40 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={!nextCursor || loading}
          className="inline-flex items-center gap-1 rounded-xl border border-outline-variant/40 px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-40 transition-colors"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {selected && (
        <AuditDiffDrawer entry={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
