"use client";

import { useEffect, useState } from "react";
import { Card, SectionHeader, StatTile, StackedBar, CardSkeleton } from "./ui";

interface TaskStatusData {
  totalOpen: number;
  byStatus: {
    todo: number;
    in_progress: number;
    blocked: number;
  };
  doneThisWeek: number;
  doneThisMonth: number;
  topOwners: Array<{ owner: string; count: number }>;
  blockedItems: Array<{ id: string; title: string; owner: string }>;
  dueSoon: Array<{ id: string; title: string; due: string; owner: string }>;
  recentlyAdded: Array<{ id: string; title: string; createdAt: string; owner: string }>;
}

export function TaskStatusWidget() {
  const [data, setData] = useState<TaskStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/overview");
        if (!response.ok) throw new Error("Failed to fetch");
        const json = await response.json();
        setData(json.data);
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

  const total = data.byStatus.todo + data.byStatus.in_progress + data.byStatus.blocked;

  return (
    <Card className="p-6">
      <SectionHeader label="Task Status" accent="blue" />

      {/* Summary stats grid */}
      <div className="grid grid-cols-2 gap-2 mb-6 md:grid-cols-6">
        <StatTile label="Total Open" value={data.totalOpen} accent="blue" />
        <StatTile label="To Do" value={data.byStatus.todo} accent="indigo" />
        <StatTile label="In Progress" value={data.byStatus.in_progress} accent="purple" />
        <StatTile label="Blocked" value={data.byStatus.blocked} accent="orange" />
        <StatTile label="Done (7d)" value={data.doneThisWeek} accent="green" />
        <StatTile label="Done (30d)" value={data.doneThisMonth} accent="emerald" />
      </div>

      {/* Status Distribution */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-200">
            Status Distribution
          </p>
          <p className="text-xs text-white/40">{total} open items</p>
        </div>
        <StackedBar
          segments={[
            {
              label: "To Do",
              value: data.byStatus.todo,
              color: "bg-indigo-500/70",
            },
            {
              label: "In Progress",
              value: data.byStatus.in_progress,
              color: "bg-purple-500/70",
            },
            {
              label: "Blocked",
              value: data.byStatus.blocked,
              color: "bg-orange-500/70",
            },
          ]}
          total={total}
        />
      </div>

      {/* Momentum (done this week vs this month) */}
      <div className="mb-6 pb-6 border-b border-slate-700/50">
        <p className="text-xs font-semibold uppercase tracking-wider text-green-200 mb-3">
          Momentum
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
            <div className="text-xs text-green-200/70">This Week</div>
            <div className="text-2xl font-bold text-green-300 mt-1">{data.doneThisWeek}</div>
            <div className="text-xs text-white/40 mt-1">tasks completed</div>
          </div>
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
            <div className="text-xs text-emerald-200/70">This Month</div>
            <div className="text-2xl font-bold text-emerald-300 mt-1">{data.doneThisMonth}</div>
            <div className="text-xs text-white/40 mt-1">tasks completed</div>
          </div>
        </div>
      </div>

      {/* Top owners */}
      <div className="mb-6">
        <SectionHeader label="Top Owners" accent="blue" />
        <div className="space-y-2">
          {data.topOwners.map((item) => (
            <div key={item.owner} className="flex items-center justify-between">
              <span className="text-sm text-white/80">{item.owner}</span>
              <span className="rounded-full bg-blue-500/20 border border-blue-500/30 px-3 py-0.5 text-xs font-semibold text-blue-300">
                {item.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Blocked items */}
      {data.blockedItems.length > 0 && (
        <div>
          <SectionHeader label={`Blocked (${data.blockedItems.length})`} accent="red" />
          <ul className="space-y-1.5">
            {data.blockedItems.slice(0, 3).map((item) => (
              <li key={item.id} className="text-xs text-white/70">
                <span className="text-orange-300 font-semibold">{item.owner}:</span> {item.title}
              </li>
            ))}
            {data.blockedItems.length > 3 && (
              <li className="text-xs text-white/40 mt-2">
                +{data.blockedItems.length - 3} more blocked items
              </li>
            )}
          </ul>
        </div>
      )}
    </Card>
  );
}
