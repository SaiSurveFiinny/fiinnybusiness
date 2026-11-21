"use client";

import { ClipboardList } from "lucide-react";
import { AuditLogTable } from "./_components/AuditLogTable";

export default function AuditLogPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
          <h1 className="text-lg sm:text-2xl font-black text-on-surface">Audit Log</h1>
        </div>
        <p className="text-sm text-on-surface-variant ml-7 sm:ml-9">
          Append-only trail of edits, deletes and exports from the Sales Team module.
          Click a row to see the before / after diff.
        </p>
      </div>

      <AuditLogTable />
    </div>
  );
}
