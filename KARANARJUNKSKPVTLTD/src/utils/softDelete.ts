/**
 * Soft Delete utility — marks records as deleted without removing them from Firestore.
 *
 * Every soft-delete stamps the document with:
 *   deleted, deletedAt, deletedBy, deleteReason, restoreDeadline (30 days),
 *   deletedModule, deletedEntityName, deletedFromCollection
 *
 * The record disappears from all normal queries (caller filters !r.deleted)
 * but remains recoverable from the Recently Deleted admin section for 30 days.
 *
 * restoreRecord()         — clears all deleted flags, logs Restore
 * permanentDeleteRecord() — physically removes the doc, logs Delete
 */
import { updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { getTenantDoc } from './tenantPath';
import { logAudit, type AuditModule } from './auditLog';

export interface SoftDeleteParams {
    db: Firestore;
    tenantId: string;
    /** Top-level collection name (e.g. 'salesOrders', 'retailers') */
    collectionName: string;
    docId: string;
    userId: string;
    userName: string;
    userRole: string;
    module: AuditModule;
    entityName: string;
    reason?: string;
}

export async function softDelete(params: SoftDeleteParams): Promise<void> {
    const { db, tenantId, collectionName, docId, userId, userName, userRole, module, entityName, reason } = params;

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 30);

    await updateDoc(getTenantDoc(db, tenantId, collectionName, docId), {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: { id: userId, name: userName, role: userRole },
        deleteReason: reason || '',
        restoreDeadline: deadline.toISOString(),
        deletedModule: module,
        deletedEntityName: entityName,
        deletedFromCollection: collectionName,
    });

    logAudit({
        db, tenantId, userId, userName, userRole,
        module, action: 'Delete',
        entityName, entityId: docId,
        description: `${entityName} moved to trash${reason ? ` — ${reason}` : ''}`,
    });
}

export async function restoreRecord(params: Omit<SoftDeleteParams, 'reason'>): Promise<void> {
    const { db, tenantId, collectionName, docId, userId, userName, userRole, module, entityName } = params;

    await updateDoc(getTenantDoc(db, tenantId, collectionName, docId), {
        deleted: false,
        deletedAt: null,
        deletedBy: null,
        deleteReason: null,
        restoreDeadline: null,
        deletedModule: null,
        deletedEntityName: null,
        deletedFromCollection: null,
        restoredAt: serverTimestamp(),
        restoredBy: { id: userId, name: userName, role: userRole },
    });

    logAudit({
        db, tenantId, userId, userName, userRole,
        module, action: 'Restore',
        entityName, entityId: docId,
        description: `${entityName} restored from trash`,
    });
}

export async function permanentDeleteRecord(params: Omit<SoftDeleteParams, 'reason'>): Promise<void> {
    const { db, tenantId, collectionName, docId, userId, userName, userRole, module, entityName } = params;

    await deleteDoc(getTenantDoc(db, tenantId, collectionName, docId));

    logAudit({
        db, tenantId, userId, userName, userRole,
        module, action: 'Delete',
        entityName, entityId: docId,
        description: `${entityName} permanently deleted`,
    });
}
