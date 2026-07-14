"use client";

import { useEffect, useState } from "react";
import { Card, SectionHeader, StatTile, CardSkeleton } from "./ui";

interface CycleTimeData {
  avgLeadTimeDays: number | null;
  avgCycleTimeDays: number | null;
  throughputPerWeek: number | null;
  completedLast30Days: number;
  note: string;
}

export function CycleTimeWidget() {
  const [data, setData] = useState<CycleTimeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/overview");
        if (!response.ok) throw new Error("Failed to fetch");
        const json = await response.json();
        setData(json.data.cycleTime);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <CardSkeleton />;
  }

  if (error || !data) {
    return (
      <Card className="p-6 border-red-500/40 bg-red-900/20">
        <div className="text-sm text-red-200">{error || "Failed to load data"}</div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <SectionHeader label="Cycle Time Metrics" accent="green" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 mb-6">
        <StatTile
          label="Avg Lead Time"
          value={data.avgLeadTimeDays !== null ? `${data.avgLeadTimeDays}d` : "N/A"}
          accent="green"
        />
        <StatTile
          label="Avg Cycle Time"
          value={data.avgCycleTimeDays !== null ? `${data.avgCycleTimeDays}d` : "N/A"}
          accent="emerald"
        />
        <StatTile
          label="Throughput"
          value={data.throughputPerWeek !== null ? `${data.throughputPerWeek}/wk` : "N/A"}
          accent="blue"
        />
      </div>

      <div className="mb-6 pb-6 border-b border-slate-700/50">
        <p className="text-xs font-semibold uppercase tracking-wider text-green-200 mb-3">
          30-Day Summary
        </p>
        <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
          <div className="text-xs text-green-200/70">Completed Tasks</div>
          <div className="text-2xl font-bold text-green-300 mt-1">{data.completedLast30Days}</div>
          <div className="text-xs text-white/40 mt-1">in the last 30 days</div>
        </div>
      </div>

      <div className="text-xs text-white/50 italic">
        {data.note}
      </div>
    </Card>
  );
}
