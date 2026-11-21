"use client";

import { X } from "lucide-react";

type AuditEntry = {
  id: string;
  timestamp: string | null;
  actorName: string | null;
  action: string | null;
  module: string | null;
  entityType: string | null;
  entityName: string | null;
  changedFields: string[] | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

type Props = {
  entry: AuditEntry;
  onClose: () => void;
};

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}

function DiffRow({ field, before, after }: { field: string; before: unknown; after: unknown }) {
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  return (
    <tr className={`border-b border-outline-variant/10 ${changed ? "bg-amber-50/40" : ""}`}>
      <td className="px-3 py-2 text-xs font-semibold text-on-surface-variant align-top w-32 whitespace-nowrap">
        {field}
        {changed && <span className="ml-1.5 text-[10px] text-amber-600 font-bold">changed</span>}
      </td>
      <td className="px-3 py-2 text-xs text-red-700 align-top max-w-[200px]">
        <pre className="whitespace-pre-wrap break-all font-sans">{formatValue(before)}</pre>
      </td>
      <td className="px-3 py-2 text-xs text-green-700 align-top max-w-[200px]">
        <pre className="whitespace-pre-wrap break-all font-sans">{formatValue(after)}</pre>
      </td>
    </tr>
  );
}

const SKIP_FIELDS = new Set(["updatedAt", "createdAt", "deletedAt"]);

export function AuditDiffDrawer({ entry, onClose }: Props) {
  const allFields = Array.from(new Set<string>([
    ...Object.keys(entry.before ?? {}),
    ...Object.keys(entry.after ?? {}),
  ]));
  const fields = allFields.filter((f) => !SKIP_FIELDS.has(f)).sort();

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-on-surface/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-surface-container-lowest shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant/20 px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                entry.action === "DELETE" ? "bg-red-100 text-red-700" :
                entry.action === "CREATE" ? "bg-green-100 text-green-700" :
                entry.action === "EXPORT" ? "bg-blue-100 text-blue-700" :
                "bg-amber-100 text-amber-700"
              }`}>
                {entry.action}
              </span>
              <span className="text-xs text-on-surface-variant">{entry.module} · {entry.entityType}</span>
            </div>
            <p className="mt-1 text-sm font-bold text-on-surface">{entry.entityName}</p>
            <p className="text-xs text-on-surface-variant">
              {entry.actorName} · {entry.timestamp ? new Date(entry.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close diff"
            className="shrink-0 rounded-xl p-1.5 text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Changed fields summary */}
          {entry.changedFields && entry.changedFields.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Changed fields</p>
              <div className="flex flex-wrap gap-1.5">
                {entry.changedFields.map((f) => (
                  <span key={f} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{f}</span>
                ))}
              </div>
            </div>
          )}

          {/* Diff table */}
          {fields.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
              <table className="w-full min-w-[500px] border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant/20">
                    <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant w-32">Field</th>
                    <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-red-600">Before</th>
                    <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-green-600">After</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f) => (
                    <DiffRow
                      key={f}
                      field={f}
                      before={entry.before?.[f]}
                      after={entry.after?.[f]}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-outline-variant/30 px-5 py-8 text-center text-sm text-on-surface-variant">
              {entry.action === "EXPORT"
                ? "Export actions don't have a before/after diff — see the 'after' metadata above."
                : "No before/after data recorded for this entry."}
            </div>
          )}

          {/* Raw after (for EXPORT) */}
          {entry.action === "EXPORT" && entry.after && (
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Export metadata</p>
              <pre className="rounded-xl bg-surface-container px-4 py-3 text-xs text-on-surface-variant overflow-x-auto">
                {JSON.stringify(entry.after, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
