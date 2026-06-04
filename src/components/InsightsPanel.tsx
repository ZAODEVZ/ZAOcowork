"use client";

import { useMemo } from "react";
import type { ActionItem } from "@/lib/types";
import { ageDays } from "@/lib/types";

// InsightsPanel (research roadmap C): a lightweight, dependency-free ops
// dashboard. Pure SVG/CSS — no charting library — so it adds no bundle weight
// and can't break the board. Renders the highest-value flow visualizations
// from the research:
//   1. Aging-WIP bars — mirrors the board columns, shows how old in-progress
//      work is (the one *leading* flow metric).
//   2. Throughput (last 14 days) — items completed per day.
//   3. Status mix + headline counts.
// All derived from the visible items, so it matches the current filter scope.

const BOARD_COLS = ["TODO", "WIP", "BLOCKED"] as const;
const COL_LABEL: Record<string, string> = { TODO: "To Do", WIP: "In Progress", BLOCKED: "Blocked" };

function ageBand(d: number): { label: string; cls: string } {
  if (d > 21) return { label: ">21d", cls: "bg-red-500/70" };
  if (d > 14) return { label: "15–21d", cls: "bg-orange-500/70" };
  if (d > 7) return { label: "8–14d", cls: "bg-amber-500/70" };
  return { label: "0–7d", cls: "bg-emerald-500/60" };
}

export function InsightsPanel({ items }: { items: ActionItem[] }) {
  const active = useMemo(
    () => items.filter((it) => !it.archivedAt && it.status !== "TRIAGE"),
    [items],
  );

  // 1. Aging WIP: per active column, count items in each age band.
  const aging = useMemo(() => {
    return BOARD_COLS.map((col) => {
      const colItems = active.filter((it) => it.status === col);
      const bands = { "0–7d": 0, "8–14d": 0, "15–21d": 0, ">21d": 0 } as Record<string, number>;
      let oldest = 0;
      for (const it of colItems) {
        const d = ageDays(it.createdAt);
        bands[ageBand(d).label] += 1;
        if (d > oldest) oldest = d;
      }
      return { col, count: colItems.length, bands, oldest };
    });
  }, [active]);

  // 2. Throughput: items completed per day over the last 14 days.
  const throughput = useMemo(() => {
    const days: { label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(now.getDate() - i);
      const key = day.toISOString().slice(0, 10);
      const count = items.filter((it) => {
        if (it.status !== "DONE") return false;
        const done = (it.completedAt || it.updatedAt || "").slice(0, 10);
        return done === key;
      }).length;
      days.push({ label: key.slice(5), count });
    }
    return days;
  }, [items]);

  const maxThroughput = Math.max(1, ...throughput.map((d) => d.count));
  const done7d = throughput.slice(7).reduce((n, d) => n + d.count, 0);
  const openCount = active.filter((it) => it.status !== "DONE").length;
  const blocked = active.filter((it) => it.status === "BLOCKED").length;
  const agingTotal = active.filter((it) => it.status !== "DONE" && ageDays(it.createdAt) > 14).length;
  const bands = ["0–7d", "8–14d", "15–21d", ">21d"] as const;
  const bandCls: Record<string, string> = {
    "0–7d": "bg-emerald-500/60",
    "8–14d": "bg-amber-500/70",
    "15–21d": "bg-orange-500/70",
    ">21d": "bg-red-500/70",
  };

  if (active.length === 0) return null;

  return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 md:p-5 space-y-5">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-violet-400" />
        <span className="text-sm font-semibold text-white/80">Insights</span>
        <span className="text-xs text-white/40">flow snapshot · current view</span>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Open" value={openCount} />
        <Stat label="Done · 7d" value={done7d} tone="ok" />
        <Stat label="Blocked" value={blocked} tone={blocked > 0 ? "red" : "ok"} />
        <Stat label="Aging > 14d" value={agingTotal} tone={agingTotal > 0 ? "red" : "ok"} />
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Aging WIP */}
        <section>
          <h4 className="text-[11px] uppercase tracking-wider text-white/45 mb-2 font-semibold">
            Work item age by column
          </h4>
          <div className="space-y-2">
            {aging.map((a) => (
              <div key={a.col}>
                <div className="flex items-center justify-between text-[11px] text-white/55 mb-1">
                  <span>{COL_LABEL[a.col]} · {a.count}</span>
                  {a.oldest > 0 && (
                    <span className={a.oldest > 14 ? "text-red-300" : "text-white/40"}>
                      oldest {a.oldest}d
                    </span>
                  )}
                </div>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.05]">
                  {bands.map((b) =>
                    a.bands[b] > 0 ? (
                      <div
                        key={b}
                        className={bandCls[b]}
                        style={{ width: `${(a.bands[b] / Math.max(1, a.count)) * 100}%` }}
                        title={`${b}: ${a.bands[b]}`}
                      />
                    ) : null,
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[9px] text-white/40">
            {bands.map((b) => (
              <span key={b} className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-sm ${bandCls[b]}`} /> {b}
              </span>
            ))}
          </div>
        </section>

        {/* Throughput */}
        <section>
          <h4 className="text-[11px] uppercase tracking-wider text-white/45 mb-2 font-semibold">
            Throughput · completed / day (14d)
          </h4>
          <div className="flex items-end gap-1 h-24">
            {throughput.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.label}: ${d.count} done`}>
                <div
                  className="w-full rounded-t bg-sky-500/60 min-h-[2px] transition-all"
                  style={{ height: `${(d.count / maxThroughput) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-white/35">
            <span>{throughput[0]?.label}</span>
            <span>today</span>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "ok" | "red" }) {
  const cls =
    tone === "red" ? "text-red-200 border-red-500/25" : tone === "ok" ? "text-emerald-200 border-emerald-500/25" : "text-white border-white/10";
  return (
    <div className={`rounded-xl bg-white/[0.04] border ${cls} px-3 py-2.5`}>
      <div className="text-[10px] uppercase tracking-wider text-white/45">{label}</div>
      <div className="mt-0.5 text-xl font-bold leading-none">{value}</div>
    </div>
  );
}
