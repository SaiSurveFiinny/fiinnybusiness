"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, MapPin, Download, Loader2 } from "lucide-react";
import { auth } from "../../../../firebase";
import type { DaySession } from "../../../../sales/day-session-service";
import type { DealerVisit } from "../../../../sales/dealers/dealer-visit-service";
import { fetchVisitsForDate } from "../../../../sales/dealers/dealer-visit-service";
import DaySessionCard from "../../../../../components/sales/DaySessionCard";
import SessionSummary from "../../../../../components/sales/SessionSummary";
import VisitTimeline from "../../../../../components/sales/VisitTimeline";

const RouteMap = dynamic(() => import("../../../../../components/sales/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 items-center justify-center rounded-2xl bg-surface-container ring-1 ring-outline/10">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  ),
});

type Props = {
  sessions: DaySession[];
  visitCountByDate: Map<string, number>;
  execId: string;
  execName: string;
};

export function DailySessionsTab({ sessions, visitCountByDate, execId, execName }: Props) {
  const [selected, setSelected] = useState<DaySession | null>(null);
  const [selectedVisits, setSelectedVisits] = useState<DealerVisit[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [downloading, setDownloading] = useState<"sessions" | "dealer-wise" | null>(null);

  const filtered = sessions.filter((s) => {
    if (fromDate && s.date < fromDate) return false;
    if (toDate && s.date > toDate) return false;
    return true;
  });

  const openSession = async (session: DaySession) => {
    setSelected(session);
    setDetailLoading(true);
    setSelectedVisits([]);
    try {
      const v = await fetchVisitsForDate(execId, session.date);
      setSelectedVisits(v);
    } catch {
      // Non-fatal — map/timeline render without visit points
    } finally {
      setDetailLoading(false);
    }
  };

  const downloadCsv = async (type: "sessions" | "dealer-wise") => {
    setDownloading(type);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const params = new URLSearchParams({ type });
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const resp = await fetch(
        `/api/admin/sales-team/${execId}/sessions/csv?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!resp.ok) throw new Error(await resp.text());
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = resp.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `sessions_${type}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("CSV download failed:", e);
      alert("Download failed. Please try again.");
    } finally {
      setDownloading(null);
    }
  };

  if (selected) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => { setSelected(null); setSelectedVisits([]); }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sessions
        </button>

        <SessionSummary session={selected} visitCount={selectedVisits.length} />

        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-outline">Route Map</p>
          {detailLoading ? (
            <div className="flex h-80 items-center justify-center rounded-2xl bg-surface-container ring-1 ring-outline/10">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <RouteMap session={selected} visits={selectedVisits} />
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-outline">Visit Timeline</p>
            {selectedVisits.length > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {selectedVisits.length}
              </span>
            )}
          </div>
          {!detailLoading && <VisitTimeline session={selected} visits={selectedVisits} />}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-1.5 text-sm text-on-surface outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-1.5 text-sm text-on-surface outline-none focus:border-primary"
            />
          </label>
        </div>
        <div className="flex gap-2 ml-auto flex-wrap">
          <button
            type="button"
            onClick={() => void downloadCsv("sessions")}
            disabled={downloading != null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-2 text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-60"
          >
            {downloading === "sessions" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download Daily Sessions CSV
          </button>
          <button
            type="button"
            onClick={() => void downloadCsv("dealer-wise")}
            disabled={downloading != null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-2 text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-60"
          >
            {downloading === "dealer-wise" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download Dealer-wise Sessions CSV
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-5 py-10 text-center">
          <MapPin className="mx-auto mb-2 h-6 w-6 text-outline" />
          <p className="text-sm font-semibold text-on-surface">
            {sessions.length === 0 ? "No daily sessions yet" : "No sessions in this date range"}
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            {sessions.length === 0
              ? "This executive hasn't started any day sessions in the field app."
              : "Try a different date range."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((session) => (
            <DaySessionCard
              key={session.id}
              session={session}
              visitCount={visitCountByDate.get(session.date) ?? 0}
              onClick={() => void openSession(session)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
