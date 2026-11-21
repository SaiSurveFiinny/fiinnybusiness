"use client";

/**
 * Sales Team → single executive activity (read-only overview + dealer edit/delete).
 *
 * Four hash-based tabs:
 *   #monthly-performance (default)
 *   #daily-sessions
 *   #dealers-added
 *   #status
 *
 * Sessions + visits are fetched upfront (needed by the default tab).
 * Dealers are fetched lazily when #dealers-added or #status is first activated.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Contact } from "lucide-react";
import { doc, getDoc, getDocs, collection, query, where, limit } from "firebase/firestore";
import { db } from "../../../firebase";
import { fetchAllSessions, type DaySession } from "../../../sales/day-session-service";
import { fetchAllVisitsForExec, type DealerVisit } from "../../../sales/dealers/dealer-visit-service";
import { fetchDealersByExec, type Dealer } from "../../../sales/dealers/dealers-service";
import { ExecDetailTabs, useHashTab } from "./_components/ExecDetailTabs";
import { MonthlyPerformanceTab, type MonthRow } from "./_components/MonthlyPerformanceTab";
import { DailySessionsTab } from "./_components/DailySessionsTab";
import { DealersTab } from "./_components/DealersTab";
import { StatusTab } from "./_components/StatusTab";

type PageState = "loading" | "ready" | "error";

async function fetchExecUser(execId: string): Promise<Record<string, any> | null> {
  const direct = await getDoc(doc(db, "users", execId));
  if (direct.exists()) return direct.data();
  const byUid = await getDocs(query(collection(db, "users"), where("uid", "==", execId), limit(1)));
  return byUid.empty ? null : byUid.docs[0].data();
}

function buildVisitCountByDate(visits: DealerVisit[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const v of visits) {
    if (!v.visitedAt || typeof (v.visitedAt as any).toDate !== "function") continue;
    const ist = new Date((v.visitedAt as any).toDate().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const key = [
      ist.getFullYear(),
      String(ist.getMonth() + 1).padStart(2, "0"),
      String(ist.getDate()).padStart(2, "0"),
    ].join("-");
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

export default function AdminSalesExecActivityPage() {
  const params = useParams();
  const execId = String(params.execId ?? "");

  const [execName, setExecName] = useState("");
  const [execEmail, setExecEmail] = useState("");
  const [sessions, setSessions] = useState<DaySession[]>([]);
  const [visitCountByDate, setVisitCountByDate] = useState<Map<string, number>>(new Map());
  const [pageState, setPageState] = useState<PageState>("loading");
  const [loadError, setLoadError] = useState("");

  // Dealers: fetched lazily on first tab activation.
  // dealersFetchStarted is a ref so it doesn't appear in effect dependencies —
  // putting dealersLoading in deps caused the effect to re-run on the
  // setDealersLoading(true) render, running cleanup and cancelling the fetch
  // before the Promise resolved.
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [dealersLoaded, setDealersLoaded] = useState(false);
  const [dealersLoading, setDealersLoading] = useState(false);
  const dealersFetchStarted = useRef(false);

  const [activeTab, setActiveTab] = useHashTab();

  // Load sessions + visits upfront (needed for default Monthly Performance tab)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPageState("loading");
      setLoadError("");
      try {
        const [exec, allSessions, allVisits] = await Promise.all([
          fetchExecUser(execId).catch(() => null),
          fetchAllSessions(execId),
          fetchAllVisitsForExec(execId),
        ]);
        if (cancelled) return;
        setExecName(String(exec?.name ?? "").trim());
        setExecEmail(String(exec?.email ?? "").trim());
        setSessions(allSessions);
        setVisitCountByDate(buildVisitCountByDate(allVisits));
        setPageState("ready");
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load activity.");
        setPageState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [execId]);

  // Lazy-load dealers when Dealers Added or Status tab is first opened
  useEffect(() => {
    if ((activeTab !== "dealers-added" && activeTab !== "status") || dealersFetchStarted.current) return;
    dealersFetchStarted.current = true;
    setDealersLoading(true);
    fetchDealersByExec(execId)
      .then((data) => {
        setDealers(data);
        setDealersLoaded(true);
      })
      .catch(() => {
        setDealersLoaded(true);
      })
      .finally(() => { setDealersLoading(false); });
  }, [activeTab, execId]);

  const monthly = useMemo<MonthRow[]>(() => {
    const rows = new Map<string, MonthRow>();
    for (const s of sessions) {
      const key = s.date.slice(0, 7);
      if (!key || key.length !== 7) continue;
      let row = rows.get(key);
      if (!row) {
        const [y, m] = key.split("-").map(Number);
        row = {
          key,
          label: new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
          sessions: 0, distanceKm: 0, visits: 0, workingMinutes: 0,
        };
        rows.set(key, row);
      }
      row.sessions += 1;
      row.distanceKm += typeof s.totalDistanceKm === "number" ? s.totalDistanceKm : 0;
      row.workingMinutes += typeof s.totalWorkingMinutes === "number" ? s.totalWorkingMinutes : 0;
      row.visits += visitCountByDate.get(s.date) ?? 0;
    }
    return Array.from(rows.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [sessions, visitCountByDate]);

  const title = execName || execEmail || "Sales Executive";

  const handleDealerUpdated = (dealerId: string, updated: Dealer | null) => {
    setDealers((prev) =>
      updated == null
        ? prev.filter((d) => d.id !== dealerId)
        : prev.map((d) => d.id === dealerId ? updated : d),
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          href="/admin/sales-team"
          aria-label="Back to Sales Team"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-outline-variant/40 text-on-surface hover:bg-surface-container transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Contact className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
            <h1 className="text-lg sm:text-2xl font-black text-on-surface truncate">{title}</h1>
          </div>
          {execEmail && execName && (
            <p className="text-xs sm:text-sm text-on-surface-variant ml-7 sm:ml-9 truncate">{execEmail}</p>
          )}
        </div>
      </div>


      {pageState === "loading" && (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {pageState === "error" && (
        <div className="rounded-2xl bg-red-50 px-5 py-4 text-center">
          <p className="text-sm font-semibold text-red-600">{loadError}</p>
        </div>
      )}

      {pageState === "ready" && (
        <>
          <ExecDetailTabs
            sessionCount={sessions.length}
            dealerCount={dealersLoaded ? dealers.length : null}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />

          <div>
            {activeTab === "monthly-performance" && (
              <MonthlyPerformanceTab monthly={monthly} />
            )}

            {activeTab === "daily-sessions" && (
              <DailySessionsTab
                sessions={sessions}
                visitCountByDate={visitCountByDate}
                execId={execId}
                execName={title}
              />
            )}

            {(activeTab === "dealers-added" || activeTab === "status") && dealersLoading && (
              <div className="flex h-40 items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {activeTab === "dealers-added" && !dealersLoading && (
              <DealersTab
                dealers={dealers}
                execId={execId}
                execName={title}
                onDealerUpdated={handleDealerUpdated}
              />
            )}

            {activeTab === "status" && !dealersLoading && (
              <StatusTab
                dealers={dealers}
                execName={title}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
