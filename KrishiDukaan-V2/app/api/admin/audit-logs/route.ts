import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { requireSection } from "../../../lib/admin-auth";

export const dynamic = "force-dynamic";

// GET /api/admin/audit-logs
// Paginated, filtered read of the auditLogs collection.
// Query params:
//   limit   — rows per page (default 50, max 200)
//   cursor  — doc ID to start after (for next-page)
//   from    — ISO date string lower bound on timestamp
//   to      — ISO date string upper bound on timestamp (inclusive day)
//   actor   — filter by actorId
//   action  — filter by action (CREATE|UPDATE|DELETE|EXPORT)
//   module  — filter by module
//   entity  — filter by entityType
//   search  — freetext match against entityName and actorName (client-side, returned with full page)

export async function GET(req: NextRequest) {
  const caller = await requireSection(req, "auditLog");
  if (caller instanceof NextResponse) return caller;

  const url = new URL(req.url);
  const pageSize = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const cursor = url.searchParams.get("cursor");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const actor = url.searchParams.get("actor");
  const action = url.searchParams.get("action");
  const module = url.searchParams.get("module");
  const entity = url.searchParams.get("entity");

  const db = getAdminDb();
  let q = db
    .collection("auditLogs")
    .orderBy("timestamp", "desc") as FirebaseFirestore.Query;

  if (from) q = q.where("timestamp", ">=", new Date(from));
  if (to) {
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1);
    q = q.where("timestamp", "<", toDate);
  }
  if (actor) q = q.where("actorId", "==", actor);
  if (action) q = q.where("action", "==", action);
  if (module) q = q.where("module", "==", module);
  if (entity) q = q.where("entityType", "==", entity);

  if (cursor) {
    const cursorDoc = await db.collection("auditLogs").doc(cursor).get();
    if (cursorDoc.exists) q = q.startAfter(cursorDoc);
  }

  q = q.limit(pageSize + 1); // fetch one extra to know if there's a next page

  const snap = await q.get();
  const hasMore = snap.size > pageSize;
  const docs = snap.docs.slice(0, pageSize);

  const logs = docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      timestamp: data.timestamp?.toDate?.()?.toISOString() ?? null,
      actorId: data.actorId ?? null,
      actorName: data.actorName ?? null,
      actorRole: data.actorRole ?? null,
      action: data.action ?? null,
      module: data.module ?? null,
      entityType: data.entityType ?? null,
      entityId: data.entityId ?? null,
      entityName: data.entityName ?? null,
      changedFields: data.changedFields ?? null,
      before: data.before ?? null,
      after: data.after ?? null,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
    };
  });

  const nextCursor = hasMore ? docs[docs.length - 1]?.id ?? null : null;

  return NextResponse.json({ logs, nextCursor, hasMore });
}
