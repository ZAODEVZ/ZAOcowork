"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ActionItem, Priority } from "@/lib/types";

/* ---------------------------------------------------------------------------
 * Theming
 *
 * Everything here reads the theme tokens (ink, surface, border, bg) or pairs a
 * light value with a `dark:` variant. The previous version was written entirely
 * in hardcoded `text-white/*` + `bg-white/[0.02]` + `bg-black/20`, which is
 * legible on the navy dark palette and invisible on the light palette
 * (--bg-primary #f5f3f0). That is the "can't read the calendar" report: white
 * chips on a near-white page. See the bootstrap comment in app/layout.tsx.
 *
 * `data-theme` is set by a blocking script in <head> before first paint, so the
 * `dark:` selector variant is always resolved - there is no unstyled flash.
 * ------------------------------------------------------------------------- */

const PRIORITY_DOT: Record<Priority, string> = {
  P1: "bg-red-500",
  P2: "bg-amber-500",
  P3: "bg-emerald-500",
};

const PRIORITY_TITLE: Record<Priority, string> = {
  P1: "P1, highest priority",
  P2: "P2, normal priority",
  P3: "P3, lowest priority",
};

// Status drives the chip colour. Light-mode text sits at 700 for contrast on the
// tinted background; dark mode lifts it to 200 against the navy.
const STATUS_CHIP: Record<string, string> = {
  TRIAGE:
    "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-200",
  TODO: "border-slate-500/35 bg-slate-500/10 text-slate-700 dark:text-slate-200",
  WIP: "border-amber-500/45 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  BLOCKED: "border-red-500/45 bg-red-500/10 text-red-700 dark:text-red-200",
  DONE: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
};
const STATUS_FALLBACK = "border-border bg-surface text-ink-secondary";

const MEETING_CHIP =
  "border-cyan-600/40 bg-cyan-500/10 text-cyan-800 dark:border-cyan-400/40 dark:text-cyan-200";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_FULL = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

const VIEW_KEY = "zao-calendar-view";
const SCOPE_KEY = "zao-calendar-scope";
const DONE_KEY = "zao-calendar-done";

type ViewMode = "month" | "week" | "agenda";
type MeetingMark = { id: string; title: string; date: string };
type Cell = { key: string; day: number; inMonth: boolean; dow: number };

/* --------------------------------- dates --------------------------------- */

function parseLocalDate(s: string | undefined | null): string | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shiftKey(key: string, days: number): string {
  const d = keyToDate(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

// "Thursday, 16 August" - used for panel and agenda headings.
function longDate(key: string): string {
  const d = keyToDate(key);
  return `${DAY_NAMES_FULL[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

function relativeDay(key: string, todayKey: string): string | null {
  if (key === todayKey) return "Today";
  if (key === shiftKey(todayKey, 1)) return "Tomorrow";
  if (key === shiftKey(todayKey, -1)) return "Yesterday";
  return null;
}

function eventTime(iso: string | null | undefined): string | null {
  if (!iso || !iso.includes("T")) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .toLowerCase()
    .replace(" ", "");
}

/* --------------------------------- chips ---------------------------------- */

function TaskChip({
  item,
  onOpen,
  compact = true,
}: {
  item: ActionItem;
  onOpen: () => void;
  compact?: boolean;
}) {
  const time = item.isEvent ? eventTime(item.eventAt) : null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={`${item.title} (${item.status}${item.priority ? `, ${item.priority}` : ""})`}
      className={`w-full flex gap-1.5 rounded border text-left transition hover:brightness-110 hover:saturate-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
        compact
          ? "items-center px-1.5 py-[3px] text-[11px] leading-tight"
          : "items-start px-2 py-1.5 text-xs"
      } ${STATUS_CHIP[item.status] ?? STATUS_FALLBACK} ${
        item.status === "DONE" ? "opacity-65" : ""
      }`}
    >
      {item.priority && (
        <span
          title={PRIORITY_TITLE[item.priority as Priority]}
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            compact ? "" : "mt-1"
          } ${PRIORITY_DOT[item.priority as Priority]}`}
        />
      )}
      {time && <span className="flex-shrink-0 tabular-nums opacity-80">{time}</span>}
      {/* Compact cells have one line to spend, so they truncate. Everywhere with
          room lets the title wrap instead, which is the whole point of the week
          and agenda views. */}
      <span
        className={`${compact ? "truncate" : "line-clamp-3 break-words"} ${
          item.status === "DONE" ? "line-through" : ""
        }`}
      >
        {item.title}
      </span>
    </button>
  );
}

function MeetingChip({
  meeting,
  onOpen,
  compact = true,
}: {
  meeting: MeetingMark;
  onOpen: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={`Meeting: ${meeting.title}`}
      className={`w-full flex gap-1.5 rounded border text-left transition hover:brightness-110 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
        compact
          ? "items-center px-1.5 py-[3px] text-[11px] leading-tight"
          : "items-start px-2 py-1.5 text-xs"
      } ${MEETING_CHIP}`}
    >
      <span className="flex-shrink-0" aria-hidden>
        &#9679;
      </span>
      <span className={compact ? "truncate" : "line-clamp-3 break-words"}>{meeting.title}</span>
    </button>
  );
}

/* --------------------------------- legend --------------------------------- */

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-tertiary">
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-red-500" /> P1
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-amber-500" /> P2
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-emerald-500" /> P3
      </span>
      <span className="text-border">|</span>
      <span className={`px-1.5 py-px rounded border ${STATUS_CHIP.WIP}`}>In progress</span>
      <span className={`px-1.5 py-px rounded border ${STATUS_CHIP.BLOCKED}`}>Blocked</span>
      <span className={`px-1.5 py-px rounded border ${MEETING_CHIP}`}>Meeting</span>
      <span className="text-border">|</span>
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full ring-2 ring-accent" /> Today
      </span>
    </div>
  );
}

/* ================================= view ================================== */

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

  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [view, setView] = useState<ViewMode>("month");
  const [weekAnchor, setWeekAnchor] = useState<string>(todayKey);

  // Preferences are restored after mount so the server and client first render
  // agree. Same pattern the board uses for its own view/density prefs.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(VIEW_KEY);
      if (v === "month" || v === "week" || v === "agenda") setView(v);
      setMineOnly(window.localStorage.getItem(SCOPE_KEY) === "mine");
      setShowDone(window.localStorage.getItem(DONE_KEY) === "1");
    } catch {
      /* storage disabled, defaults are fine */
    }
  }, []);

  const persist = useCallback((key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage full or disabled, the preference just will not survive a reload */
    }
  }, []);

  /* ------------------------------- filtering ------------------------------ */

  const doneHiddenCount = useMemo(() => {
    const scoped = mineOnly
      ? items.filter((it) => (it.assignees ?? []).includes(currentUser))
      : items;
    return scoped.filter((it) => it.status === "DONE" && parseLocalDate(it.due)).length;
  }, [items, currentUser, mineOnly]);

  const visibleItems = useMemo(() => {
    let out = items;
    if (mineOnly) out = out.filter((it) => (it.assignees ?? []).includes(currentUser));
    if (!showDone) out = out.filter((it) => it.status !== "DONE");
    return out;
  }, [items, currentUser, mineOnly, showDone]);

  const byDate = useMemo(() => {
    const map = new Map<string, ActionItem[]>();
    for (const it of visibleItems) {
      const key = parseLocalDate(it.due);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    // Highest priority first inside a day, then blocked/in-progress ahead of todo.
    const rank: Record<string, number> = { BLOCKED: 0, WIP: 1, TRIAGE: 2, TODO: 3, DONE: 4 };
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
          (a.priority ?? "P3").localeCompare(b.priority ?? "P3") ||
          a.title.localeCompare(b.title),
      );
    }
    return map;
  }, [visibleItems]);

  const meetingsByDate = useMemo(() => {
    const map = new Map<string, MeetingMark[]>();
    for (const m of meetings) {
      if (!map.has(m.date)) map.set(m.date, []);
      map.get(m.date)!.push(m);
    }
    return map;
  }, [meetings]);

  const openTask = useCallback(
    (id: string) => router.push(`/board?task=${id}`),
    [router],
  );
  const openMeetings = useCallback(() => router.push("/meetings"), [router]);

  /* -------------------------------- counts -------------------------------- */

  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;

  const stats = useMemo(() => {
    let dueThisMonth = 0;
    let overdue = 0;
    for (const [key, list] of byDate) {
      if (key.startsWith(monthPrefix)) dueThisMonth += list.length;
      if (key < todayKey) overdue += list.filter((it) => it.status !== "DONE").length;
    }
    const dueToday = (byDate.get(todayKey) ?? []).length;
    const meetingsThisMonth = meetings.filter((m) => m.date.startsWith(monthPrefix)).length;
    return { dueThisMonth, overdue, dueToday, meetingsThisMonth };
  }, [byDate, monthPrefix, todayKey, meetings]);

  /* ------------------------------ navigation ------------------------------ */

  function step(delta: number) {
    if (view === "week") {
      const next = shiftKey(weekAnchor, delta * 7);
      setWeekAnchor(next);
      const d = keyToDate(next);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
      return;
    }
    const m = month + delta;
    if (m < 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else if (m > 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth(m);
    }
    setSelected(null);
  }

  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setWeekAnchor(todayKey);
    setSelected(todayKey);
  }

  function selectKey(key: string) {
    setSelected(key);
    const d = keyToDate(key);
    if (d.getFullYear() !== year || d.getMonth() !== month) {
      setYear(d.getFullYear());
      setMonth(d.getMonth());
    }
    setWeekAnchor(key);
  }

  // Arrow keys walk the grid, Escape clears. Only active once a day is picked,
  // so the shortcuts never fight with typing elsewhere on the page.
  function onGridKeyDown(e: React.KeyboardEvent) {
    if (!selected) return;
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (e.key in moves) {
      e.preventDefault();
      selectKey(shiftKey(selected, moves[e.key]));
    } else if (e.key === "Escape") {
      setSelected(null);
    }
  }

  /* --------------------------------- grid --------------------------------- */

  const monthCells: Cell[] = useMemo(() => {
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
    const start = new Date(year, month, 1 - firstDow);
    return Array.from({ length: totalCells }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return {
        key: toDateKey(d.getFullYear(), d.getMonth(), d.getDate()),
        day: d.getDate(),
        inMonth: d.getMonth() === month && d.getFullYear() === year,
        dow: d.getDay(),
      };
    });
  }, [year, month]);

  const weekCells: Cell[] = useMemo(() => {
    const anchor = keyToDate(weekAnchor);
    const start = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate() - anchor.getDay(),
    );
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return {
        key: toDateKey(d.getFullYear(), d.getMonth(), d.getDate()),
        day: d.getDate(),
        inMonth: true,
        dow: d.getDay(),
      };
    });
  }, [weekAnchor]);

  /* -------------------------------- agenda -------------------------------- */

  const agenda = useMemo(() => {
    const keys = new Set<string>([...byDate.keys(), ...meetingsByDate.keys()]);
    const overdue: string[] = [];
    const upcoming: string[] = [];
    for (const key of Array.from(keys).sort()) {
      if (key < todayKey) overdue.push(key);
      else upcoming.push(key);
    }
    // Most recently missed first, so the freshest overdue work reads at the top.
    return { overdue: overdue.reverse(), upcoming };
  }, [byDate, meetingsByDate, todayKey]);

  /* -------------------------------- render -------------------------------- */

  const headingLabel =
    view === "week"
      ? (() => {
          const start = weekCells[0];
          const end = weekCells[6];
          const sd = keyToDate(start.key);
          const ed = keyToDate(end.key);
          const sameMonth = sd.getMonth() === ed.getMonth();
          return sameMonth
            ? `${sd.getDate()} to ${ed.getDate()} ${MONTH_NAMES[sd.getMonth()]} ${sd.getFullYear()}`
            : `${sd.getDate()} ${MONTH_NAMES[sd.getMonth()]} to ${ed.getDate()} ${
                MONTH_NAMES[ed.getMonth()]
              } ${ed.getFullYear()}`;
        })()
      : `${MONTH_NAMES[month]} ${year}`;

  // A render function rather than a nested component: a component declared in
  // the render body gets a new identity every render, which remounts all 42
  // cells (and drops grid focus) on every toggle or arrow key.
  function renderDayCell(cell: Cell, tall: boolean) {
    const dayItems = byDate.get(cell.key) ?? [];
    const dayMeetings = meetingsByDate.get(cell.key) ?? [];
    const isToday = cell.key === todayKey;
    const isSelected = cell.key === selected;
    const isWeekend = cell.dow === 0 || cell.dow === 6;
    const openOverdue =
      cell.key < todayKey && dayItems.some((it) => it.status !== "DONE");
    const total = dayItems.length + dayMeetings.length;
    // Meetings claim slots first, tasks fill what is left, the remainder rolls
    // into a "+N more" button that opens the day in the side panel.
    const limit = tall ? 12 : 3;
    const shownMeetings = dayMeetings.slice(0, limit);
    const shownItems = dayItems.slice(0, Math.max(0, limit - shownMeetings.length));
    const hidden = total - shownMeetings.length - shownItems.length;

    return (
      <div
        key={cell.key}
        role="gridcell"
        tabIndex={isSelected ? 0 : -1}
        aria-selected={isSelected}
        aria-label={`${longDate(cell.key)}, ${total} item${total === 1 ? "" : "s"}`}
        onClick={() => (isSelected ? setSelected(null) : selectKey(cell.key))}
        className={`${tall ? "min-h-[240px]" : "min-h-[116px]"} p-1.5 cursor-pointer transition-colors focus:outline-none ${
          isSelected
            ? "bg-accent/15 ring-1 ring-inset ring-accent/50"
            : cell.inMonth
              ? isWeekend
                ? "bg-surface hover:bg-surface-hover"
                : "hover:bg-surface"
              : "bg-bg-tertiary/40"
        }`}
      >
        <div className="flex items-center justify-between gap-1 mb-1">
          <span
            className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full tabular-nums ${
              isToday
                ? "bg-accent text-bg-primary"
                : !cell.inMonth
                  ? "text-ink-tertiary/50"
                  : openOverdue
                    ? "text-red-600 dark:text-red-400"
                    : "text-ink-secondary"
            }`}
          >
            {cell.day}
          </span>
          {total > 0 && (
            <span className="text-[10px] text-ink-tertiary tabular-nums" title={`${total} items`}>
              {total}
            </span>
          )}
        </div>

        <div className="space-y-1">
          {shownMeetings.map((mt) => (
            <MeetingChip key={mt.id} meeting={mt} onOpen={openMeetings} compact={!tall} />
          ))}
          {shownItems.map((it) => (
            <TaskChip key={it.id} item={it} onOpen={() => openTask(it.id)} compact={!tall} />
          ))}
          {hidden > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                selectKey(cell.key);
              }}
              className="w-full text-left text-[10px] text-ink-tertiary hover:text-ink-primary px-1.5 transition"
            >
              +{hidden} more
            </button>
          )}
        </div>
      </div>
    );
  }

  const panelKey = selected ?? todayKey;
  const panelItems = byDate.get(panelKey) ?? [];
  const panelMeetings = meetingsByDate.get(panelKey) ?? [];

  // What is coming after the day already shown in the panel above, so the two
  // cards never list the same tasks twice.
  const nextUp = useMemo(() => {
    const out: Array<{ key: string; item: ActionItem }> = [];
    for (const key of agenda.upcoming) {
      if (key <= panelKey) continue;
      for (const item of byDate.get(key) ?? []) {
        if (out.length < 6) out.push({ key, item });
      }
      if (out.length >= 6) break;
    }
    return out;
  }, [agenda.upcoming, byDate, panelKey]);

  return (
    <div className="space-y-3">
      {/* ------------------------------ toolbar ------------------------------ */}
      <div className="rounded-2xl border border-border bg-surface p-3 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {view !== "agenda" && (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label={view === "week" ? "Previous week" : "Previous month"}
                  className="w-8 h-8 rounded-lg border border-border text-ink-secondary hover:bg-surface-hover hover:text-ink-primary flex items-center justify-center transition"
                >
                  &#8249;
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label={view === "week" ? "Next week" : "Next month"}
                  className="w-8 h-8 rounded-lg border border-border text-ink-secondary hover:bg-surface-hover hover:text-ink-primary flex items-center justify-center transition"
                >
                  &#8250;
                </button>
              </>
            )}
            <h2 className="text-base sm:text-lg font-semibold text-ink-primary">
              {view === "agenda" ? "Everything scheduled" : headingLabel}
            </h2>
            <button
              type="button"
              onClick={goToday}
              className="px-2.5 py-1 text-xs rounded-lg border border-border text-ink-secondary hover:text-ink-primary hover:bg-surface-hover transition"
            >
              Today
            </button>
          </div>

          {/* View switcher */}
          <div
            role="tablist"
            aria-label="Calendar view"
            className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border bg-bg-secondary"
          >
            {(["month", "week", "agenda"] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => {
                  setView(v);
                  persist(VIEW_KEY, v);
                  if (v === "week") setWeekAnchor(selected ?? todayKey);
                }}
                className={`px-3 py-1 text-xs rounded-md capitalize transition ${
                  view === v
                    ? "bg-accent text-bg-primary font-semibold"
                    : "text-ink-secondary hover:text-ink-primary hover:bg-surface-hover"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Counts + scope toggles */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-xs text-ink-tertiary flex-wrap">
            {stats.overdue > 0 && (
              <span className="px-2 py-0.5 rounded-md border border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 font-medium">
                {stats.overdue} overdue
              </span>
            )}
            <span>
              {stats.dueToday} due today
            </span>
            <span className="text-border">|</span>
            <span>
              {stats.dueThisMonth} due in {MONTH_NAMES[month]}
            </span>
            {stats.meetingsThisMonth > 0 && (
              <>
                <span className="text-border">|</span>
                <span>{stats.meetingsThisMonth} meetings</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={mineOnly}
              onClick={() => {
                const next = !mineOnly;
                setMineOnly(next);
                persist(SCOPE_KEY, next ? "mine" : "all");
              }}
              className={`px-3 py-1 text-xs rounded-lg border transition ${
                mineOnly
                  ? "border-accent/50 bg-accent/15 text-accent font-medium"
                  : "border-border text-ink-secondary hover:text-ink-primary hover:bg-surface-hover"
              }`}
            >
              {mineOnly ? "My tasks" : "All tasks"}
            </button>
            <button
              type="button"
              aria-pressed={showDone}
              onClick={() => {
                const next = !showDone;
                setShowDone(next);
                persist(DONE_KEY, next ? "1" : "0");
              }}
              title={
                showDone
                  ? "Hide completed tasks"
                  : `${doneHiddenCount} completed task${doneHiddenCount === 1 ? "" : "s"} are hidden`
              }
              className={`px-3 py-1 text-xs rounded-lg border transition ${
                showDone
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium"
                  : "border-border text-ink-secondary hover:text-ink-primary hover:bg-surface-hover"
              }`}
            >
              {showDone ? "Done shown" : `Done hidden${doneHiddenCount ? ` (${doneHiddenCount})` : ""}`}
            </button>
          </div>
        </div>

        <Legend />
      </div>

      {/* ------------------------- grid + side panel ------------------------- */}
      {/* Week view drops the side panel and takes the full width: seven columns
          at ~185px each is what makes a whole task title readable in place. */}
      <div
        className={
          view === "week"
            ? "space-y-3"
            : "lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-3 space-y-3 lg:space-y-0"
        }
      >
        <div className="min-w-0">
          {view === "agenda" ? (
            <AgendaList
              agenda={agenda}
              byDate={byDate}
              meetingsByDate={meetingsByDate}
              todayKey={todayKey}
              onOpenTask={openTask}
              onOpenMeetings={openMeetings}
            />
          ) : (
            <div
              role="grid"
              aria-label={headingLabel}
              tabIndex={0}
              onKeyDown={onGridKeyDown}
              className="rounded-2xl border border-border overflow-hidden bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <div role="row" className="grid grid-cols-7 border-b border-border bg-surface">
                {DAY_NAMES.map((d, i) => (
                  <div
                    key={d}
                    role="columnheader"
                    className={`py-2 text-center text-[11px] font-semibold uppercase tracking-wider ${
                      i === 0 || i === 6 ? "text-ink-tertiary" : "text-ink-secondary"
                    }`}
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 divide-x divide-border [&>*:nth-child(n+8)]:border-t [&>*:nth-child(n+8)]:border-border">
                {(view === "week" ? weekCells : monthCells).map((cell) =>
                  renderDayCell(cell, view === "week"),
                )}
              </div>
            </div>
          )}
        </div>

        {/* Day panel. Always populated: falls back to today when nothing is
            picked, so the sidebar is never an empty box. */}
        <aside
          className={`lg:sticky lg:top-4 lg:self-start space-y-3 ${
            view === "week" ? "hidden" : ""
          }`}
        >
          <div className="rounded-2xl border border-border bg-surface p-3 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink-primary">
                {relativeDay(panelKey, todayKey) ?? longDate(panelKey)}
              </h3>
              <span className="text-[11px] text-ink-tertiary">
                {panelItems.length + panelMeetings.length} item
                {panelItems.length + panelMeetings.length === 1 ? "" : "s"}
              </span>
            </div>
            {relativeDay(panelKey, todayKey) && (
              <p className="text-[11px] text-ink-tertiary -mt-1">{longDate(panelKey)}</p>
            )}

            {panelMeetings.length === 0 && panelItems.length === 0 ? (
              <p className="text-xs text-ink-tertiary py-2">Nothing scheduled.</p>
            ) : (
              <div className="space-y-1.5">
                {panelMeetings.map((mt) => (
                  <MeetingChip key={mt.id} meeting={mt} onOpen={openMeetings} compact={false} />
                ))}
                {panelItems.map((it) => (
                  <div key={it.id} className="space-y-0.5">
                    <TaskChip item={it} onOpen={() => openTask(it.id)} compact={false} />
                    {it.assignees && it.assignees.length > 0 && (
                      <p className="text-[10px] text-ink-tertiary px-2">
                        {it.assignees.join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {nextUp.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-3 space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
                Next up
              </h3>
              <div className="space-y-1.5">
                {nextUp.map(({ key, item }, i) => (
                  <div key={`${key}-${item.id}`} className="space-y-0.5">
                    {/* Date label only on the first task of each day. */}
                    {(i === 0 || nextUp[i - 1].key !== key) && (
                      <p className="text-[10px] text-ink-tertiary px-0.5 pt-1">
                        {relativeDay(key, todayKey) ?? longDate(key)}
                      </p>
                    )}
                    <TaskChip item={item} onOpen={() => openTask(item.id)} compact={false} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {view !== "agenda" && (
        <p className="text-[11px] text-ink-tertiary px-1">
          Click a day to open it. With a day selected, the arrow keys move around the grid and Escape
          clears the selection.
        </p>
      )}
    </div>
  );
}

/* ------------------------------ agenda view ------------------------------- */

function AgendaList({
  agenda,
  byDate,
  meetingsByDate,
  todayKey,
  onOpenTask,
  onOpenMeetings,
}: {
  agenda: { overdue: string[]; upcoming: string[] };
  byDate: Map<string, ActionItem[]>;
  meetingsByDate: Map<string, MeetingMark[]>;
  todayKey: string;
  onOpenTask: (id: string) => void;
  onOpenMeetings: () => void;
}) {
  const [showOverdue, setShowOverdue] = useState(true);

  function renderDayBlock(dateKey: string, muted = false) {
    const dayItems = byDate.get(dateKey) ?? [];
    const dayMeetings = meetingsByDate.get(dateKey) ?? [];
    if (dayItems.length === 0 && dayMeetings.length === 0) return null;
    const rel = relativeDay(dateKey, todayKey);
    return (
      <div key={dateKey} className={`space-y-1.5 ${muted ? "opacity-90" : ""}`}>
        <div className="flex items-baseline gap-2">
          <h4
            className={`text-xs font-semibold ${
              rel === "Today" ? "text-accent" : "text-ink-primary"
            }`}
          >
            {rel ?? longDate(dateKey)}
          </h4>
          {rel && <span className="text-[11px] text-ink-tertiary">{longDate(dateKey)}</span>}
          <span className="text-[11px] text-ink-tertiary ml-auto tabular-nums">
            {dayItems.length + dayMeetings.length}
          </span>
        </div>
        <div className="space-y-1">
          {dayMeetings.map((mt) => (
            <MeetingChip key={mt.id} meeting={mt} onOpen={onOpenMeetings} compact={false} />
          ))}
          {dayItems.map((it) => (
            <TaskChip key={it.id} item={it} onOpen={() => onOpenTask(it.id)} compact={false} />
          ))}
        </div>
      </div>
    );
  }

  const overdueCount = agenda.overdue.reduce(
    (n, k) => n + (byDate.get(k)?.length ?? 0) + (meetingsByDate.get(k)?.length ?? 0),
    0,
  );

  return (
    <div className="space-y-4">
      {agenda.overdue.length > 0 && (
        <div className="rounded-2xl border border-red-500/35 bg-red-500/[0.06] p-3 space-y-3">
          <button
            type="button"
            onClick={() => setShowOverdue((v) => !v)}
            aria-expanded={showOverdue}
            className="w-full flex items-center justify-between gap-2 text-left"
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">
              Overdue, {overdueCount} item{overdueCount === 1 ? "" : "s"}
            </span>
            <span className="text-[11px] text-ink-tertiary">
              {showOverdue ? "Hide" : "Show"}
            </span>
          </button>
          {showOverdue && (
            <div className="space-y-3">{agenda.overdue.map((k) => renderDayBlock(k, true))}</div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-bg-secondary p-3 space-y-4">
        {agenda.upcoming.length === 0 ? (
          <p className="text-sm text-ink-tertiary text-center py-6">
            Nothing scheduled from today onward.
          </p>
        ) : (
          agenda.upcoming.map((k) => renderDayBlock(k))
        )}
      </div>
    </div>
  );
}
