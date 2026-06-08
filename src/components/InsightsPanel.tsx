"use client";

import { useEffect, useMemo, useState } from "react";
import type { ActionItem } from "@/lib/types";
import { ageDays, cycleDays } from "@/lib/types";

const COLLAPSE_KEY = "zao-insights-collapsed";

// Nearest-rank percentile (matches forecast.ts). p in 0..100.
function percentileOf(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

// Cycle-time histogram bands (days, created -> completed).
const CYCLE_BANDS: { label: string; max: number }[] = [
  { label: "0–2d", max: 2 },
  { label: "3–5d", max: 5 },
  { label: "6–10d", max: 10 },
  { label: "11–20d", max: 20 },
  { label: "20d+", max: Infinity },
];

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

  // 3. Cycle time: created -> completed for items finished in the last 60 days.
  //    Median + p90 are the headline flow metrics; the histogram shows spread.
  const cycle = useMemo(() => {
    const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const samples: number[] = [];
    for (const it of items) {
      if (it.status !== "DONE") continue;
      const done = new Date(it.completedAt || it.updatedAt || "").getTime();
      if (!Number.isFinite(done) || done < cutoff) continue;
      const d = cycleDays(it.createdAt, it.completedAt ?? "", it.status, it.updatedAt);
      if (d !== null) samples.push(d);
    }
    samples.sort((a, b) => a - b);
    const hist = CYCLE_BANDS.map((b) => ({ label: b.label, count: 0 }));
    for (const d of samples) {
      const i = CYCLE_BANDS.findIndex((b) => d <= b.max);
      hist[i === -1 ? hist.length - 1 : i].count += 1;
    }
    return {
      n: samples.length,
      median: percentileOf(samples, 50),
      p90: percentileOf(samples, 90),
      hist,
    };
  }, [items]);
  const maxCycleBand = Math.max(1, ...cycle.hist.map((b) => b.count));

  // 4. WIP per owner: active (non-DONE) load per teammate. Surfaces who's
  //    overloaded vs idle, and how much work has no owner at all.
  const wip = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of active) {
      if (it.status === "DONE") continue;
      const o = String(it.owner ?? "").trim();
      const key = !o || o === "Open" ? "Unowned" : o;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([owner, count]) => ({ owner, count }))
      .sort((a, b) => b.count - a.count);
  }, [active]);
  const maxWip = Math.max(1, ...wip.map((w) => w.count));

  // Weekly throughput over the last 8 weeks (oldest first) for the header
  // sparkline — the direction of travel, not just this week's number.
  const weekly = useMemo(() => {
    const WEEK = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const weeks = new Array(8).fill(0);
    for (const it of items) {
      if (it.status !== "DONE") continue;
      const t = new Date(it.completedAt || it.updatedAt || "").getTime();
      if (!Number.isFinite(t)) continue;
      const idx = Math.floor((now - t) / WEEK);
      if (idx >= 0 && idx < 8) weeks[idx]++;
    }
    return weeks.reverse();
  }, [items]);

  const maxThroughput = Math.max(1, ...throughput.map((d) => d.count));
  const done7d = throughput.slice(7).reduce((n, d) => n + d.count, 0);
  const openCount = active.filter((it) => it.status !== "DONE").length;
  const blocked = active.filter((it) => it.status === "BLOCKED").length;
  const agingTotal = active.filter((it) => it.status !== "DONE" && ageDays(it.createdAt) > 14).length;

  // One-line health summary, always shown (even when collapsed) so the board
  // gives a read at a glance without expanding the panel.
  const health =
    blocked > 0
      ? { label: "Needs attention", dot: "bg-red-400" }
      : agingTotal > 0
        ? { label: "Watch", dot: "bg-amber-400" }
        : { label: "On track", dot: "bg-emerald-400" };
  const summaryParts = [
    `${done7d} shipped this week`,
    ...(cycle.n > 0 ? [`median cycle ${cycle.median}d`] : []),
    ...(agingTotal > 0 ? [`${agingTotal} aging`] : []),
    ...(blocked > 0 ? [`${blocked} blocked`] : []),
  ];

  // Collapse state, remembered per device. Default expanded; read after mount
  // to avoid an SSR/client hydration mismatch.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }
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
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        className="w-full flex items-center gap-3 text-left group"
      >
        <span className="h-2 w-2 rounded-full bg-violet-400 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white/80">Insights</span>
            <span className="flex items-center gap-1 text-[10px] text-white/55">
              <span className={`h-1.5 w-1.5 rounded-full ${health.dot}`} /> {health.label}
            </span>
          </div>
          <div className="text-xs text-white/45 truncate">{summaryParts.join(" · ")}</div>
        </div>
        <Sparkline data={weekly} />
        <span className="text-[11px] text-white/40 group-hover:text-white/70 flex-shrink-0 transition">
          {collapsed ? "▾ show" : "▴ hide"}
        </span>
      </button>

      {!collapsed && (
      <>
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
            {throughput.map((d) => (
              <div key={d.label} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.label}: ${d.count} done`}>
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

      <div className="grid md:grid-cols-2 gap-5">
        {/* Cycle time */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[11px] uppercase tracking-wider text-white/45 font-semibold">
              Cycle time · created → done (60d)
            </h4>
            {cycle.n > 0 && (
              <span className="text-[10px] text-white/50">
                median <span className="text-white/80 font-semibold">{cycle.median}d</span>
                <span className="mx-1 text-white/25">·</span>
                p90 <span className="text-white/80 font-semibold">{cycle.p90}d</span>
              </span>
            )}
          </div>
          {cycle.n === 0 ? (
            <div className="text-[11px] text-white/35 py-6 text-center">
              No items completed in the last 60 days.
            </div>
          ) : (
            <div className="flex items-end gap-2 h-24">
              {cycle.hist.map((b) => (
                <div key={b.label} className="flex-1 flex flex-col items-center justify-end h-full" title={`${b.label}: ${b.count}`}>
                  <span className="text-[9px] text-white/50 mb-0.5">{b.count || ""}</span>
                  <div
                    className="w-full rounded-t bg-violet-500/55 min-h-[2px] transition-all"
                    style={{ height: `${(b.count / maxCycleBand) * 100}%` }}
                  />
                  <span className="mt-1 text-[9px] text-white/35">{b.label}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* WIP per owner */}
        <section>
          <h4 className="text-[11px] uppercase tracking-wider text-white/45 mb-2 font-semibold">
            Open work by owner
          </h4>
          {wip.length === 0 ? (
            <div className="text-[11px] text-white/35 py-6 text-center">No open work.</div>
          ) : (
            <div className="space-y-1.5">
              {wip.map((w) => (
                <div key={w.owner} className="flex items-center gap-2">
                  <span className={`w-20 shrink-0 text-[11px] truncate ${w.owner === "Unowned" ? "text-amber-300/80" : "text-white/60"}`}>
                    {w.owner}
                  </span>
                  <div className="flex-1 h-3 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${w.owner === "Unowned" ? "bg-amber-500/60" : "bg-sky-500/55"}`}
                      style={{ width: `${(w.count / maxWip) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right text-[11px] text-white/55">{w.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      </>
      )}
    </div>
  );
}

// Tiny 8-week throughput sparkline for the header. Pure SVG, ~88px wide.
function Sparkline({ data }: { data: number[] }) {
  if (data.length === 0 || data.every((n) => n === 0)) return null;
  const w = 88;
  const h = 24;
  const max = Math.max(1, ...data);
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="hidden sm:block flex-shrink-0 text-sky-400/70"
      aria-hidden="true"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
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
