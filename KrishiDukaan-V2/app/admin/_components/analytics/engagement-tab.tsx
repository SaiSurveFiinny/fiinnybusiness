"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, CalendarClock, TrendingUp, Percent } from "lucide-react";
import {
  getEngagementMetrics,
  type EngagementMetrics,
} from "../../_lib/analytics-queries";
import { RefreshButton } from "../refresh-button";
import {
  StatCard,
  SectionTitle,
  Panel,
  DateRangePicker,
  useDateRange,
  LoadingState,
  ErrorBanner,
  EmptyState,
  TimeSeriesLineChart,
  ChartLegend,
} from "./ui";

const DAU_SERIES = [{ key: "dau", label: "Active users", color: "#22c55e" }];
const MAU_SERIES = [{ key: "mau", label: "Monthly active", color: "#3b82f6" }];
const ROLE_SERIES = [
  { key: "manufacturer", label: "Manufacturers", color: "#3b82f6" },
  { key: "retailer", label: "Retailers", color: "#22c55e" },
  { key: "customer", label: "Customers", color: "#f59e0b" },
];

function prettyDate(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function EngagementTab() {
  const dr = useDateRange("30d");
  const [data, setData] = useState<EngagementMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await getEngagementMetrics(dr.range);
      setData(d);
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dr.range]);

  useEffect(() => {
    void load();
  }, [load]);

  const noTracking = !loading && data && !data.reliableFrom;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangePicker {...dr} />
        <RefreshButton savedAt={savedAt} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />
      </div>

      <ErrorBanner error={error} />

      {data?.reliableFrom && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          Activity tracking data is reliable from <strong>{prettyDate(data.reliableFrom)}</strong>.
          DAU/MAU before this date is not shown — registration data (Users &amp; Growth tab) remains complete.
        </p>
      )}

      {loading ? (
        <LoadingState />
      ) : noTracking ? (
        <EmptyState message="No activity data collected yet. DAU/MAU will appear once logged-in users start opening the app with activity tracking live." />
      ) : (
        <>
          {/* ── DAU ─────────────────────────────────────────────────────────── */}
          <div>
            <SectionTitle>Daily active users (DAU)</SectionTitle>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 sm:gap-4">
              <StatCard icon={Activity} label="Latest DAU" value={data?.latestDau ?? 0} color="bg-green-500/10 text-green-600" />
              <StatCard icon={TrendingUp} label="Average DAU" value={Math.round(data?.avgDau ?? 0)} sub="Over selected range" />
              <StatCard label="Peak DAU" value={data?.peakDau ?? 0} />
              <StatCard
                icon={Percent}
                label="DAU / MAU (stickiness)"
                value={data?.stickiness != null ? `${data.stickiness.toFixed(1)}%` : "—"}
                sub={data?.stickiness != null ? "Current month" : "Not enough data yet"}
                color="bg-purple-500/10 text-purple-600"
              />
            </div>
            <Panel title="DAU over time">
              <TimeSeriesLineChart data={(data?.dauPerDay ?? []) as any} series={DAU_SERIES} />
              <ChartLegend series={DAU_SERIES} />
            </Panel>
          </div>

          {/* ── DAU by role ─────────────────────────────────────────────────── */}
          <div>
            <SectionTitle>Active users by role</SectionTitle>
            <Panel title="DAU by role over time">
              <TimeSeriesLineChart data={(data?.dauPerDay ?? []) as any} series={ROLE_SERIES} />
              <ChartLegend series={ROLE_SERIES} />
            </Panel>
          </div>

          {/* ── MAU ─────────────────────────────────────────────────────────── */}
          <div>
            <SectionTitle>Monthly active users (MAU)</SectionTitle>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 sm:gap-4">
              <StatCard
                icon={CalendarClock}
                label="Current MAU"
                value={data?.currentMau ?? 0}
                sub={data?.currentMauMonth ? `Month of ${data.currentMauMonth}` : undefined}
                color="bg-blue-500/10 text-blue-600"
              />
              <StatCard label="Active user-days" value={data?.activeUserDays ?? 0} sub="Sum of DAU in range" />
              <StatCard label="New active" value={data?.newActiveDays ?? 0} sub="Active on signup day" />
              <StatCard label="Returning active" value={data?.returningDays ?? 0} sub="Active after signup day" />
            </div>
            <Panel title="MAU over time (unique users per month)">
              <TimeSeriesLineChart data={(data?.mauPerMonth ?? []) as any} series={MAU_SERIES} />
              <ChartLegend series={MAU_SERIES} />
            </Panel>
            <p className="mt-2 text-[11px] text-outline">
              MAU counts each user once per calendar month (not the sum of DAU, which double-counts).
              &ldquo;New/returning active&rdquo; and &ldquo;active user-days&rdquo; are per-day counts across the range.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
