"use client";

import { useEffect, useState } from "react";

interface TaskStatusData {
  totalOpen: number;
  byStatus: {
    todo: number;
    in_progress: number;
    blocked: number;
  };
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
    return (
      <div className="rounded-2xl bg-slate-800/50 border border-slate-700 p-6">
        <div className="text-sm text-slate-400">Loading task status...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl bg-red-900/20 border border-red-500/30 p-6">
        <div className="text-sm text-red-200">{error || "Failed to load data"}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-blue-900/20 to-indigo-900/20 border border-blue-500/30 p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-blue-200 mb-4">
        Task Status
      </h2>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
          <div className="text-xs text-blue-200/70">Total Open</div>
          <div className="text-2xl font-bold text-blue-300">{data.totalOpen}</div>
        </div>
        <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 p-3">
          <div className="text-xs text-indigo-200/70">To Do</div>
          <div className="text-2xl font-bold text-indigo-300">{data.byStatus.todo}</div>
        </div>
        <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3">
          <div className="text-xs text-purple-200/70">In Progress</div>
          <div className="text-2xl font-bold text-purple-300">{data.byStatus.in_progress}</div>
        </div>
        <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-3">
          <div className="text-xs text-orange-200/70">Blocked</div>
          <div className="text-2xl font-bold text-orange-300">{data.byStatus.blocked}</div>
        </div>
      </div>

      {/* Top owners */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-200 mb-2">
          Top Owners
        </h3>
        <div className="space-y-1">
          {data.topOwners.map((item) => (
            <div key={item.owner} className="flex items-center justify-between text-sm">
              <span className="text-white/80">{item.owner}</span>
              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-semibold text-blue-300">
                {item.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Blocked items */}
      {data.blockedItems.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-orange-200 mb-2">
            Blocked ({data.blockedItems.length})
          </h3>
          <ul className="space-y-1">
            {data.blockedItems.slice(0, 3).map((item) => (
              <li key={item.id} className="text-xs text-white/70 truncate">
                <span className="text-orange-300 font-semibold">{item.owner}</span> - {item.title}
              </li>
            ))}
            {data.blockedItems.length > 3 && (
              <li className="text-xs text-white/40">
                +{data.blockedItems.length - 3} more...
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
