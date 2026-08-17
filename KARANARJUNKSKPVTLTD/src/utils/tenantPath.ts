import { collection, doc, Firestore } from 'firebase/firestore';

// A user provisioned from KrishiDukan can reach a screen in the moment before
// AuthContext has resolved their tenant. Without this guard the path builds as
// tenants/null/<collection> and Firestore throws somewhere deep inside a render,
// which is very hard to trace back to the missing tenantId.
const requireTenantId = (tenantId: string, collName: string): string => {
    if (!tenantId) {
        throw new Error(
            `[tenantPath] No tenantId while resolving "${collName}". The signed-in user ` +
            `has no tenant assigned yet — check tenantId before querying.`
        );
    }
    return tenantId;
};

export const getTenantCollection = (db: Firestore, tenantId: string, collName: string, ...rest: string[]) => {
    const tid = requireTenantId(tenantId, collName);
    if (tid === 'master') {
        return collection(db, collName, ...rest);
    }
    return collection(db, 'tenants', tid, collName, ...rest);
};

export const getTenantDoc = (db: Firestore, tenantId: string, collName: string, docId: string, ...rest: string[]) => {
    const tid = requireTenantId(tenantId, collName);
    if (tid === 'master') {
        return doc(db, collName, docId, ...rest);
    }
    return doc(db, 'tenants', tid, collName, docId, ...rest);
};
