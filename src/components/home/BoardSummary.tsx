"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, SectionHeader, StatTile } from "../overview/ui";

interface OverviewData {
  totalOpen: number;
  byStatus: { todo: number; in_progress: number; blocked: number };
  doneThisWeek: number;
  blockedItems: Array<{ id: string; title: string; owner: string }>;
  dueSoon: Array<{ id: string; title: string; due: string; owner: string }>;
}

export function BoardSummary() {
  const [data, setData] = useState<OverviewData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/overview")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json?.data) setData(json.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Top 5: blocked first (unblock unblocks everything behind it), then
  // nearest-due. Mirrors the "Do Now" ordering on /board without pulling
  // in that page's full filter/view machinery.
  const doNow = data
    ? [...data.blockedItems.map((t) => ({ ...t, why: "blocked" as const })), ...data.dueSoon.map((t) => ({ ...t, why: "due" as const }))].slice(0, 5)
    : [];

  return (
    <Card className="p-6">
      <SectionHeader label="Board" accent="slate">
        <Link href="/board" className="hover:text-white transition-colors">
          full board &rarr;
        </Link>
      </SectionHeader>

      {!data && <div className="h-24 animate-pulse rounded-lg bg-slate-700/30" />}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <StatTile label="Open" value={data.totalOpen} accent="blue" size="sm" />
            <StatTile label="In progress" value={data.byStatus.in_progress} accent="indigo" size="sm" />
            <StatTile label="Blocked" value={data.byStatus.blocked} accent="red" size="sm" />
            <StatTile label="Done this week" value={data.doneThisWeek} accent="green" size="sm" />
          </div>

          {doNow.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Do now
              </div>
              <ul className="space-y-1.5">
                {doNow.map((item) => (
                  <li key={item.id} className="text-sm text-slate-300 flex items-start gap-2">
                    <span
                      className={
                        item.why === "blocked"
                          ? "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase bg-red-500/20 text-red-300"
                          : "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase bg-amber-500/20 text-amber-300"
                      }
                    >
                      {item.why}
                    </span>
                    <span>{item.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {doNow.length === 0 && (
            <p className="text-sm text-slate-500">Nothing blocked or due soon.</p>
          )}
        </>
      )}
    </Card>
  );
}
