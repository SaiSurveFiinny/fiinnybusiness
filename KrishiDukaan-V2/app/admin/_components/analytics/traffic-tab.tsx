"use client";

import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, limit } from "firebase/firestore";
import { BarChart3 } from "lucide-react";
import { db } from "../../../firebase";
import { RefreshButton } from "../refresh-button";
import { Panel, LoadingState, ErrorBanner, StatCard, SectionTitle, TimeSeriesLineChart } from "./ui";

type DayVisit = { date: string; total: number };

/**
 * Anonymous site traffic — the one existing time-series (`siteVisits/{day}`),
 * a daily counter with no per-user identity. Kept as its own tab and clearly
 * labelled "traffic, not users" so it is never mistaken for DAU/MAU (Phase 2).
 */
export function TrafficTab() {
  const [visits, setVisits] = useState<DayVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const snap = await getDocs(query(collection(db, "siteVisits"), orderBy("date", "desc"), limit(30)));
      setVisits(
        snap.docs
          .map((d) => ({ date: d.data().date as string, total: Number(d.data().total || 0) }))
          .reverse(),
      );
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const last7 = visits.slice(-7).reduce((s, v) => s + v.total, 0);
  const total = visits.reduce((s, v) => s + v.total, 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-end">
        <RefreshButton savedAt={savedAt} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />
      </div>
      <ErrorBanner error={error} />
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
            <StatCard label="Visits (last 30 tracked days)" value={total.toLocaleString("en-IN")} />
            <StatCard label="Visits (last 7 days)" value={last7.toLocaleString("en-IN")} />
          </div>
          <div>
            <SectionTitle>Daily site visits</SectionTitle>
            <Panel title="Traffic — anonymous, not unique users">
              <TimeSeriesLineChart
                data={visits}
                series={[{ key: "total", label: "Visits", color: "#6366f1" }]}
              />
            </Panel>
          </div>
          <p className="flex items-center gap-1.5 text-[10px] text-outline">
            <BarChart3 className="h-3 w-3" />
            Visit tracking started when this feature was deployed. For deeper traffic analytics see Google Analytics (G-7MEFGCD4EX).
          </p>
        </>
      )}
    </div>
  );
}
