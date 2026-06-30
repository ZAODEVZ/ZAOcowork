"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ActionItem, Priority } from "@/lib/types";

const PRIORITY_COLOR: Record<Priority, string> = {
  P1: "bg-red-500",
  P2: "bg-amber-400",
  P3: "bg-emerald-400",
};

const STATUS_CHIP: Record<string, string> = {
  TODO: "border-slate-500/50 text-slate-300",
  WIP: "border-amber-500/50 text-amber-300",
  BLOCKED: "border-red-500/50 text-red-300",
  DONE: "border-emerald-500/50 text-emerald-300 opacity-60",
};

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function parseLocalDate(s: string | undefined): string | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type MeetingMark = { id: string; title: string; date: string };

export function CalendarView({
  items,
  currentUser,
  meetings = [],
}: {
  items: ActionItem[];
  currentUser: string;
  meetings?: MeetingMark[];
}) {
  const router = useRouter();

  // Meetings grouped by their date key (YYYY-MM-DD).
  const meetingsByDate = useMemo(() => {
    const map = new Map<string, MeetingMark[]>();
    for (const m of meetings) {
      if (!map.has(m.date)) map.set(m.date, []);
      map.get(m.date)!.push(m);
    }
    return map;
  }, [meetings]);
  const today = new Date();
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

  const visibleItems = useMemo(
    () => mineOnly ? items.filter(it => (it.assignees ?? []).includes(currentUser)) : items,
    [items, currentUser, mineOnly],
  );

  // Map date-key → tasks due that day
  const byDate = useMemo(() => {
    const map = new Map<string, ActionItem[]>();
    for (const it of visibleItems) {
      const key = parseLocalDate(it.due);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return map;
  }, [visibleItems]);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelected(null);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelected(null);
  }
  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelected(todayKey);
  }

  // Build grid: leading empty cells + days of month
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ key: string; day: number } | null> = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => ({
      key: toDateKey(year, month, i + 1),
      day: i + 1,
    })),
  ];
  // Pad to complete last week row
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedItems = selected ? (byDate.get(selected) ?? []) : [];

  // Count tasks with due dates in this month for the header
  const thisMonthCount = Array.from(byDate.entries()).filter(([k]) =>
    k.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)
  ).reduce((n, [, arr]) => n + arr.length, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={prevMonth}
            className="w-8 h-8 rounded-lg border border-white/10 text-white/60 hover:bg-white/5 hover:text-white flex items-center justify-center transition text-sm"
          >
            ‹
          </button>
          <h2 className="text-lg font-semibold text-white min-w-[180px] text-center">
            {MONTH_NAMES[month]} {year}
          </h2>
          <button
            onClick={nextMonth}
            className="w-8 h-8 rounded-lg border border-white/10 text-white/60 hover:bg-white/5 hover:text-white flex items-center justify-center transition text-sm"
          >
            ›
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1 text-xs rounded-lg border border-white/10 text-white/50 hover:text-white hover:bg-white/5 transition"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-3">
          {thisMonthCount > 0 && (
            <span className="text-xs text-white/35">
              {thisMonthCount} task{thisMonthCount !== 1 ? "s" : ""} due this month
            </span>
          )}
          <button
            onClick={() => setMineOnly(v => !v)}
            className={`px-3 py-1 text-xs rounded-lg border transition ${
              mineOnly
                ? "border-zao-accent/50 bg-zao-accent/15 text-zao-accent"
                : "border-white/10 text-white/50 hover:text-white hover:bg-white/5"
            }`}
          >
            {mineOnly ? "My tasks" : "All tasks"}
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02]">
        {/* Day name headers */}
        <div className="grid grid-cols-7 border-b border-white/10">
          {DAY_NAMES.map(d => (
            <div key={d} className="py-2 text-center text-[11px] font-medium text-white/35 uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="grid grid-cols-7 divide-x divide-white/[0.06]">
          {cells.map((cell, i) => {
            if (!cell) {
              return (
                <div
                  key={`empty-${i}`}
                  className={`min-h-[90px] p-1.5 bg-black/20 ${i % 7 !== 6 ? "" : "border-r-0"} ${Math.floor(i/7) > 0 ? "border-t border-white/[0.06]" : ""}`}
                />
              );
            }
            const { key, day } = cell;
            const dayItems = byDate.get(key) ?? [];
            const dayMeetings = meetingsByDate.get(key) ?? [];
            const isToday = key === todayKey;
            const isSelected = key === selected;
            const isOverdue = key < todayKey;

            return (
              <div
                key={key}
                onClick={() => setSelected(isSelected ? null : key)}
                className={`min-h-[90px] p-1.5 cursor-pointer transition-colors ${
                  Math.floor(i / 7) > 0 ? "border-t border-white/[0.06]" : ""
                } ${
                  isSelected
                    ? "bg-zao-accent/10"
                    : "hover:bg-white/[0.03]"
                }`}
              >
                {/* Day number */}
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday
                        ? "bg-zao-accent text-white"
                        : dayItems.length > 0 && isOverdue
                        ? "text-red-400/80"
                        : "text-white/50"
                    }`}
                  >
                    {day}
                  </span>
                  {dayItems.length > 3 && (
                    <span className="text-[10px] text-white/30">+{dayItems.length - 3}</span>
                  )}
                </div>

                {/* Meeting chips — cyan, link to /meetings */}
                <div className="space-y-0.5 mb-0.5">
                  {dayMeetings.slice(0, 2).map(mt => (
                    <div
                      key={mt.id}
                      onClick={e => { e.stopPropagation(); router.push("/meetings"); }}
                      title={mt.title}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border border-cyan-400/40 bg-cyan-500/10 text-cyan-200 truncate leading-tight cursor-pointer hover:brightness-125 transition"
                    >
                      <span className="flex-shrink-0">🗓️</span>
                      <span className="truncate">{mt.title}</span>
                    </div>
                  ))}
                </div>

                {/* Task chips — show up to 3 */}
                <div className="space-y-0.5">
                  {dayItems.slice(0, 3).map(it => (
                    <div
                      key={it.id}
                      onClick={e => { e.stopPropagation(); router.push(`/board?task=${it.id}`); }}
                      title={it.title}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border truncate leading-tight cursor-pointer hover:brightness-125 transition ${
                        STATUS_CHIP[it.status] ?? "border-white/20 text-white/50"
                      }`}
                    >
                      {it.priority && (
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_COLOR[it.priority as Priority]}`} />
                      )}
                      <span className="truncate">{it.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day detail panel */}
      {selected && selectedItems.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
            {new Date(`${selected}T12:00:00`).toLocaleDateString("en-US", {
              weekday: "long", month: "long", day: "numeric",
            })}
            <span className="ml-2 font-normal normal-case">
              — {selectedItems.length} task{selectedItems.length !== 1 ? "s" : ""}
            </span>
          </h3>
          <div className="space-y-1.5">
            {selectedItems.map(it => (
              <button
                key={it.id}
                onClick={() => router.push(`/board?task=${it.id}`)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition hover:brightness-125 ${
                  STATUS_CHIP[it.status] ?? "border-white/10 text-white/60"
                } bg-black/20`}
              >
                {it.priority && (
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_COLOR[it.priority as Priority]}`} />
                )}
                <span className="flex-1 text-sm truncate">{it.title}</span>
                <span className="text-[10px] text-white/35 flex-shrink-0">{it.status}</span>
                {it.assignees && it.assignees.length > 0 && (
                  <span className="text-[10px] text-white/30 flex-shrink-0">
                    {it.assignees.join(", ")}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && selectedItems.length === 0 && (
        <p className="text-center text-sm text-white/25 py-4">No tasks due on this day.</p>
      )}
    </div>
  );
}
