/**
 * Audit Log Service — single call site to instrument any ERP action.
 *
 * Usage (fire-and-forget):
 *   logAudit({ db, tenantId, userId, userName, userRole,
 *               module: 'POS Billing', action: 'Generate Invoice',
 *               entityName: 'KA-0042', entityId: docId });
 *
 * Adding a new module: extend AuditModule. Nothing else changes.
 * Adding a new action: extend AuditAction. Nothing else changes.
 */
import { addDoc, serverTimestamp, type Firestore } from 'firebase/firestore';
import { getTenantCollection } from './tenantPath';

// ─── Canonical module list ────────────────────────────────────────────────────
export type AuditModule =
    | 'POS Billing'
    | 'Worklist'
    | 'Supplier Ledger'
    | 'Inventory'
    | 'Manage Retailers'
    | 'Manage Users'
    | 'Role Matrix'
    | 'B2B Invoice'
    | 'Digital Khata'
    | 'Purchase Orders'
    | 'Expenses'
    | 'Online Orders'
    | 'Settings'
    | 'Dispatch Board'
    | 'Delivery Challans';

// ─── Canonical action list ────────────────────────────────────────────────────
export type AuditAction =
    | 'Create'
    | 'Update'
    | 'Delete'
    | 'Record Payment'
    | 'Link Payment'
    | 'Generate Invoice'
    | 'Cancel Invoice'
    | 'Status Change'
    | 'Login'
    | 'Logout';

export interface AuditParams {
    db: Firestore;
    tenantId: string;
    userId: string;
    userName: string;
    userRole: string;
    module: AuditModule;
    action: AuditAction;
    entityName: string;
    entityId?: string;
    remarks?: string;
}

/**
 * Write an audit log entry to Firestore. Fire-and-forget — never throws,
 * never blocks the caller. The write is best-effort; a network failure is
 * logged to the console but does not surface to the user.
 */
export function logAudit(params: AuditParams): void {
    const {
        db, tenantId, userId, userName, userRole,
        module, action, entityName, entityId, remarks,
    } = params;

    const entry: Record<string, unknown> = {
        timestamp: serverTimestamp(),
        userId,
        userName,
        userRole,
        module,
        action,
        entityName,
    };
    if (entityId)  entry.entityId  = entityId;
    if (remarks)   entry.remarks   = remarks;

    addDoc(getTenantCollection(db, tenantId, 'auditLogs'), entry).catch(err => {
        console.warn('[auditLog] write failed (non-fatal):', err);
    });
}
