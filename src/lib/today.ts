/**
 * Bucketing for /today.
 *
 * WHY THIS IS A SEPARATE FILE. The rules below are the page - which item counts
 * as late, which counts as today, and which is invisible - and rules that decide
 * what a person sees first need a test. Inside a server component they cannot
 * have one.
 *
 * THE UNDATED BUCKET IS THE REASON THIS EXISTS. On 2026-09-24 the vault measured
 * 44 open cards with NO due date. Every date-ordered sweep in the estate skipped
 * them, so they could not be late and were therefore never surfaced - two of them
 * were ZAOstock items no report had ever shown. An item with no date is not an
 * item with no urgency.
 */
import type { ActionItem } from "./types";

const PRIORITY_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2 };

/**
 * Today in America/New_York, not in the server's zone.
 *
 * Vercel runs in UTC. After 20:00 Eastern a UTC "today" is already tomorrow, so
 * a UTC-based cutoff would sweep a whole day of items into OVERDUE every evening
 * and show an empty "due today" - wrong in the hours Zaal is most likely to look.
 */
export function todayInFestivalTz(nowMs?: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(nowMs === undefined ? new Date() : new Date(nowMs));
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The due date as the table holds it - "2026-10-03" or "". Never a Date. */
export function dueOf(it: Pick<ActionItem, "due">): string {
  return (it.due || "").slice(0, 10);
}

export function daysLate(due: string, now: string): number {
  return Math.round((Date.parse(`${now}T12:00:00Z`) - Date.parse(`${due}T12:00:00Z`)) / 86400000);
}

function byPriorityThenTitle(a: ActionItem, b: ActionItem): number {
  const p = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  if (p !== 0) return p;
  return String(a.title).localeCompare(String(b.title));
}

export type Buckets = {
  overdue: ActionItem[];
  dueToday: ActionItem[];
  inFlight: ActionItem[];
  thisWeek: ActionItem[];
  undated: ActionItem[];
};

/**
 * Every open item lands in at most one bucket, and a DONE item lands in none.
 *
 * The buckets are deliberately disjoint: an overdue WIP item belongs under
 * Overdue, not under both. A page that counts the same card twice is a page
 * that overstates the day, which is the failure the todo note kept having.
 */
export function bucket(items: ActionItem[], now: string, weekDays = 7): Buckets {
  const weekEnd = addDays(now, weekDays);
  // listItems({ openOnly: true }) drops "done" in SQL, but normalisation
  // uppercases status, so the guard is repeated rather than assumed. A DONE row
  // in any bucket would be this page telling someone to do finished work.
  const open = items.filter((it) => it.status !== "DONE");

  const overdue = open
    .filter((it) => dueOf(it) !== "" && dueOf(it) < now)
    .sort((a, b) => dueOf(a).localeCompare(dueOf(b)) || byPriorityThenTitle(a, b));
  const dueToday = open.filter((it) => dueOf(it) === now).sort(byPriorityThenTitle);
  const inFlight = open
    .filter((it) => it.status === "WIP" && dueOf(it) !== now && !(dueOf(it) !== "" && dueOf(it) < now))
    .sort(byPriorityThenTitle);
  const thisWeek = open
    .filter((it) => {
      const d = dueOf(it);
      return d > now && d <= weekEnd;
    })
    .sort((a, b) => dueOf(a).localeCompare(dueOf(b)) || byPriorityThenTitle(a, b));
  const undated = open
    .filter((it) => dueOf(it) === "" && it.status !== "WIP")
    .sort(byPriorityThenTitle);

  return { overdue, dueToday, inFlight, thisWeek, undated };
}
