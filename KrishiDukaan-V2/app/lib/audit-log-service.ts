/**
 * Shared audit log writer — server-side only (uses Firebase Admin SDK).
 * Import this from API routes, not from "use client" components.
 *
 * Append-only: there is no update or delete for audit log entries.
 * Never pass passwords, tokens, or other secrets in before/after payloads.
 */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "EXPORT";

export type AuditEntry = {
  /** Who performed the action. */
  actorId: string;
  actorName: string;
  actorRole: string;
  /** What was done. */
  action: AuditAction;
  /** Which product area (e.g. "sales_team"). */
  module: string;
  /** e.g. "dealer", "sales_executive" */
  entityType: string;
  entityId: string;
  entityName: string;
  /** Snapshots — redact secrets before passing. */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Top-level field names that changed (for UPDATE). */
  changedFields?: string[];
  /** Request metadata — set by the API route from req.headers. */
  ipAddress?: string;
  userAgent?: string;
};

/**
 * Append one audit log entry to the `auditLogs` Firestore collection.
 * Never throws — a failed audit write is logged to console but does not
 * roll back the primary operation.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const db = getAdminDb();
    await db.collection("auditLogs").add({
      ...entry,
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error("[writeAuditLog] failed:", e);
  }
}

/** Extract request metadata safely (no throws). */
export function auditMeta(req: Request): { ipAddress: string; userAgent: string } {
  return {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown",
    userAgent: req.headers.get("user-agent") ?? "unknown",
  };
}
