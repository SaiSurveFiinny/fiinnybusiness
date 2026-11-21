import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../../../../lib/firebase-admin";
import { requireSection } from "../../../../../../lib/admin-auth";
import { writeAuditLog, auditMeta } from "../../../../../../lib/audit-log-service";
import { csvCell } from "../../../../../../admin/_lib/csv";

type Params = { params: { execId: string } };

const HEADERS = [
  "Dealer/Shop Name", "Owner Name", "Phone", "Address",
  "City/District/State", "Latitude", "Longitude",
  "Dealer Type", "Current Status", "Dealer Interest", "Notes",
  "Added By (Executive)", "Added On",
];

const STATUS_LABELS: Record<string, string> = {
  pitching: "Pitching", interested: "Interested", ongoing: "Ongoing",
  pending: "Pending", completed: "Completed", closed: "Closed",
  notInterested: "Not Interested",
};
function statusLabel(s: string | undefined): string {
  if (!s) return "";
  return STATUS_LABELS[s] ?? s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

function formatTimestamp(ts: FirebaseFirestore.Timestamp | undefined | null): string {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

export const dynamic = "force-dynamic";

// GET /api/admin/sales-team/[execId]/dealers/csv
// Server-side dealers CSV. Query params: from=YYYY-MM-DD, to=YYYY-MM-DD
export async function GET(req: NextRequest, { params }: Params) {
  const caller = await requireSection(req, "salesTeam");
  if (caller instanceof NextResponse) return caller;

  const { execId } = params;
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const db = getAdminDb();

  // Fetch exec name for the filename and audit log
  const execDoc = await db.collection("users").doc(execId).get().catch(() => null);
  const execName = String(execDoc?.data()?.name ?? execDoc?.data()?.email ?? execId);

  // Fetch active dealers for this exec.
  // No composite index exists for createdBy + active + orderBy(createdAt), so
  // we fetch without orderBy and date-filter/sort in memory.
  const snap = await db
    .collection("dealers")
    .where("createdBy", "==", execId)
    .where("active", "==", true)
    .get();

  // Apply date range filter in memory
  const fromMs = from ? new Date(from).getTime() : null;
  const toMs = to ? new Date(to + "T23:59:59.999Z").getTime() : null;
  const docs = snap.docs.filter((d) => {
    const ts = d.data().createdAt as FirebaseFirestore.Timestamp | undefined;
    if (!ts?.toDate) return true;
    const ms = ts.toDate().getTime();
    if (fromMs !== null && ms < fromMs) return false;
    if (toMs !== null && ms > toMs) return false;
    return true;
  }).sort((a, b) => {
    const ta = (a.data().createdAt as FirebaseFirestore.Timestamp | undefined)?.toDate().getTime() ?? 0;
    const tb = (b.data().createdAt as FirebaseFirestore.Timestamp | undefined)?.toDate().getTime() ?? 0;
    return ta - tb;
  });

  // Fetch the latest note per dealer from dealerNotes
  const dealerIds = docs.map((d) => d.id);
  const notesByDealer = new Map<string, string>();
  if (dealerIds.length > 0) {
    // Firestore 'in' queries limited to 30 items
    for (let i = 0; i < dealerIds.length; i += 30) {
      const chunk = dealerIds.slice(i, i + 30);
      const notesSnap = await db
        .collection("dealerNotes")
        .where("dealerId", "in", chunk)
        .orderBy("createdAt", "desc")
        .get()
        .catch(() => null);
      if (notesSnap) {
        for (const nd of notesSnap.docs) {
          const data = nd.data();
          const did = String(data.dealerId ?? "");
          if (did && !notesByDealer.has(did)) {
            notesByDealer.set(did, String(data.note ?? ""));
          }
        }
      }
    }
  }

  const rows: string[] = [HEADERS.map(csvCell).join(",")];

  for (const d of docs) {
    const data = d.data();
    const geo = data.geo as { latitude?: number; longitude?: number } | null;
    const ts = data.createdAt as FirebaseFirestore.Timestamp | undefined;

    const interestMap: Record<string, string> = {
      low: "Low",
      considering: "Considering",
      veryInterested: "Very Interested",
    };

    rows.push([
      csvCell(data.shopName),
      csvCell(data.ownerName),
      csvCell(data.phone),
      csvCell(data.address),
      csvCell(""),                               // city/district/state not stored separately
      csvCell(geo?.latitude ?? ""),
      csvCell(geo?.longitude ?? ""),
      csvCell(String(data.type ?? "retailer")),
      csvCell(statusLabel(data.status ? String(data.status) : undefined)),
      csvCell(interestMap[String(data.interest ?? "")] ?? String(data.interest ?? "")),
      csvCell(notesByDealer.get(d.id) ?? ""),
      csvCell(execName),
      csvCell(formatTimestamp(ts as any)),
    ].join(","));
  }

  const csv = rows.join("\r\n");
  const bom = "﻿";
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeName = execName.replace(/[\s/\\:*?"<>|]+/g, "_").slice(0, 40);
  const filename = `${safeName}_dealers_${dateStr}.csv`;

  // Audit log — EXPORT action
  const actorDoc = await db.collection("users").doc(caller.uid).get().catch(() => null);
  const actorName = String(actorDoc?.data()?.name ?? actorDoc?.data()?.email ?? caller.uid);
  await writeAuditLog({
    actorId: caller.uid,
    actorName,
    actorRole: actorDoc?.data()?.role ?? "admin",
    action: "EXPORT",
    module: "sales_team",
    entityType: "dealer",
    entityId: execId,
    entityName: `${execName} — dealers CSV`,
    before: null,
    after: { rowCount: docs.length, from: from ?? null, to: to ?? null },
    ...auditMeta(req),
  });

  return new NextResponse(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
