import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../../../../lib/firebase-admin";
import { requireSection } from "../../../../../../lib/admin-auth";
import { writeAuditLog, auditMeta } from "../../../../../../lib/audit-log-service";
import { csvCell } from "../../../../../../admin/_lib/csv";

type Params = { params: { execId: string } };

export const dynamic = "force-dynamic";

function formatTs(ts: FirebaseFirestore.Timestamp | undefined | null): string {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function fmtDuration(mins: number | undefined): string {
  if (!mins) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

// GET /api/admin/sales-team/[execId]/sessions/csv?type=sessions|dealer-wise&from=&to=
export async function GET(req: NextRequest, { params }: Params) {
  const caller = await requireSection(req, "salesTeam");
  if (caller instanceof NextResponse) return caller;

  const { execId } = params;
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "sessions";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const db = getAdminDb();

  const execDoc = await db.collection("users").doc(execId).get().catch(() => null);
  const execName = String(execDoc?.data()?.name ?? execDoc?.data()?.email ?? execId);

  // Use the existing composite index: salesExecutiveId ASC + date ASC
  // Date strings are YYYY-MM-DD so lexicographic ordering == chronological.
  let sessionsQ = db
    .collection("daySessions")
    .where("salesExecutiveId", "==", execId)
    .orderBy("date", "asc") as FirebaseFirestore.Query;

  if (from) sessionsQ = sessionsQ.where("date", ">=", from);
  if (to) sessionsQ = sessionsQ.where("date", "<=", to);

  const sessionsSnap = await sessionsQ.get();

  const actorDoc = await db.collection("users").doc(caller.uid).get().catch(() => null);
  const actorName = String(actorDoc?.data()?.name ?? actorDoc?.data()?.email ?? caller.uid);
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeName = execName.replace(/[\s/\\:*?"<>|]+/g, "_").slice(0, 40);

  if (type === "dealer-wise") {
    // Dealer-wise sessions CSV: one row per dealer visit per session
    // Joins: dealerVisits + dealers collections
    const sessionIds = sessionsSnap.docs.map((d) => d.id);
    const sessionDateMap = new Map<string, string>();
    for (const s of sessionsSnap.docs) sessionDateMap.set(s.id, String(s.data().date ?? ""));

    // Fetch all visits for this exec within the date range
    let visitsQ = db
      .collection("dealerVisits")
      .where("salesExecutiveId", "==", execId)
      .orderBy("visitedAt", "asc") as FirebaseFirestore.Query;
    if (from) visitsQ = visitsQ.where("visitedAt", ">=", new Date(from));
    if (to) {
      const toDate = new Date(to);
      toDate.setDate(toDate.getDate() + 1);
      visitsQ = visitsQ.where("visitedAt", "<", toDate);
    }
    const visitsSnap = await visitsQ.get();

    // Collect all dealer IDs from visits
    const dealerIds = Array.from(new Set(visitsSnap.docs.map((v) => String(v.data().dealerId ?? "")))).filter(Boolean);

    // Fetch dealer details for type, interest, ownerName, phone
    const dealerMap = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < dealerIds.length; i += 30) {
      const chunk = dealerIds.slice(i, i + 30);
      const dSnap = await db.collection("dealers").where("__name__", "in", chunk).get().catch(() => null);
      if (dSnap) {
        for (const dd of dSnap.docs) dealerMap.set(dd.id, dd.data());
      }
    }

    const headers = [
      "Date", "Session ID", "Dealer Name", "Owner Name", "Phone",
      "Visit Time", "Dealer Type", "Current Status", "Interest", "Purpose", "Notes",
    ];
    const rows: string[] = [headers.map(csvCell).join(",")];

    const interestMap: Record<string, string> = {
      low: "Low", considering: "Considering", veryInterested: "Very Interested",
    };
    const statusMap: Record<string, string> = {
      pitching: "Pitching", interested: "Interested", ongoing: "Ongoing",
      pending: "Pending", completed: "Completed", closed: "Closed",
      notInterested: "Not Interested",
    };
    function fmtStatus(s: string | undefined): string {
      if (!s) return "";
      return statusMap[s] ?? s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
    }

    for (const v of visitsSnap.docs) {
      const vd = v.data();
      const sessionId = String(vd.daySessionId ?? "");
      const date = sessionDateMap.get(sessionId) ?? String(vd.visitedAt?.toDate?.().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) ?? "");
      const dealer = dealerMap.get(String(vd.dealerId ?? "")) ?? {};
      rows.push([
        csvCell(date),
        csvCell(sessionId),
        csvCell(vd.dealerName),
        csvCell(String(dealer.ownerName ?? "")),
        csvCell(String(dealer.phone ?? "")),
        csvCell(formatTs(vd.visitedAt as any)),
        csvCell(String(dealer.type ?? "retailer")),
        csvCell(fmtStatus(dealer.status ? String(dealer.status) : undefined)),
        csvCell(interestMap[String(dealer.interest ?? "")] ?? String(dealer.interest ?? "")),
        csvCell(vd.purpose === "Other" ? String(vd.purposeOther ?? "Other") : String(vd.purpose ?? "")),
        csvCell(vd.notes),
      ].join(","));
    }

    const csv = rows.join("\r\n");
    const filename = `${safeName}_dealer_wise_sessions_${dateStr}.csv`;
    const rowCount = visitsSnap.size;

    await writeAuditLog({
      actorId: caller.uid,
      actorName,
      actorRole: actorDoc?.data()?.role ?? "admin",
      action: "EXPORT",
      module: "sales_team",
      entityType: "dealer_visit",
      entityId: execId,
      entityName: `${execName} — dealer-wise sessions CSV`,
      before: null,
      after: { rowCount, from: from ?? null, to: to ?? null },
      ...auditMeta(req),
    });

    return new NextResponse("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // Default: one row per day session
  const headers = [
    "Date", "Start Time", "End Time", "Duration",
    "Visits Count", "Distance (km)", "Notes",
  ];
  const rows: string[] = [headers.map(csvCell).join(",")];

  // Fetch visit counts per session
  let allVisitsQ = db
    .collection("dealerVisits")
    .where("salesExecutiveId", "==", execId) as FirebaseFirestore.Query;
  if (from) allVisitsQ = allVisitsQ.where("visitedAt", ">=", new Date(from));
  if (to) {
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1);
    allVisitsQ = allVisitsQ.where("visitedAt", "<", toDate);
  }
  const allVisitsSnap = await allVisitsQ.get();
  const visitCountBySession = new Map<string, number>();
  for (const v of allVisitsSnap.docs) {
    const sid = String(v.data().daySessionId ?? "");
    if (sid) visitCountBySession.set(sid, (visitCountBySession.get(sid) ?? 0) + 1);
  }

  for (const s of sessionsSnap.docs) {
    const sd = s.data();
    rows.push([
      csvCell(sd.date),
      csvCell(formatTs(sd.startedAt as any)),
      csvCell(formatTs(sd.endedAt as any)),
      csvCell(fmtDuration(sd.totalWorkingMinutes as number | undefined)),
      csvCell(visitCountBySession.get(s.id) ?? 0),
      csvCell(typeof sd.totalDistanceKm === "number" ? sd.totalDistanceKm.toFixed(2) : ""),
      csvCell(""),
    ].join(","));
  }

  const csv = rows.join("\r\n");
  const filename = `${safeName}_sessions_${dateStr}.csv`;

  await writeAuditLog({
    actorId: caller.uid,
    actorName,
    actorRole: actorDoc?.data()?.role ?? "admin",
    action: "EXPORT",
    module: "sales_team",
    entityType: "day_session",
    entityId: execId,
    entityName: `${execName} — sessions CSV`,
    before: null,
    after: { rowCount: sessionsSnap.size, from: from ?? null, to: to ?? null },
    ...auditMeta(req),
  });

  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
