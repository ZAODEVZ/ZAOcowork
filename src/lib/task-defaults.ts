// task-defaults.ts - the "basics are required" layer.
//
// Audit finding (2026-07-26): of 303 open tasks, 155 had no due date, 143 no
// brand, 22 no priority, and 58 no owner - 17 of which were sitting in
// in_progress with nobody on them. A board where the basics are optional turns
// into a capture bucket: rows land, nothing is answerable, and "overdue" stops
// meaning anything.
//
// The fix is deliberately NOT a bigger form. Nothing new is asked of whoever
// creates the task. These are server-side fallbacks applied at write time, so
// every row is guaranteed to answer three questions - who, when, how urgent -
// without adding a single required field to the UI.
//
// Only three basics are enforced. Brand and project stay optional on purpose:
// they are useful for slicing, but a task with no brand is still workable, and
// forcing them would add friction for no throughput gain.

import type { ActionItem, Priority, ServiceClass, Effort } from "@/lib/types";

/**
 * Where unowned work goes. Zaal is the operational backstop for the ZAO board:
 * per the audit decision, an unowned task is not "nobody's", it is Zaal's until
 * he routes it elsewhere. Better a wrong owner that shows up in someone's
 * my-work than a right-but-empty one that shows up in nobody's.
 */
export const FALLBACK_OWNER = "Zaal";

/** Applied when the creator did not pick one. P2 = normal. */
export const FALLBACK_PRIORITY: Priority = "P2";

/** Applied when effort is absent. focus = moderate effort. */
export const FALLBACK_EFFORT: Effort = "focus";

/**
 * Days-until-due per service class. The `service_class` column has existed
 * since migration 004 but nothing ever read it to set a date, so it was
 * decoration. This is what turns it into an actual SLA.
 *
 *   Expedite   - pull-the-cord work, 2 days
 *   Standard   - default lane, 1 week
 *   FixedDate  - the date IS the point; if one wasn't supplied, 2 weeks so it
 *                still surfaces rather than floating forever
 *   Intangible - refactors, cleanup, research. Real but not time-pressured.
 */
export const SLA_DAYS: Record<ServiceClass, number> = {
  Expedite: 2,
  Standard: 7,
  FixedDate: 14,
  Intangible: 30,
};

/** Owner values that mean "nobody is actually on this". */
const EMPTY_OWNERS = new Set(["", "open", "unassigned", "none", "null", "undefined"]);

export function isUnowned(owner: unknown): boolean {
  if (typeof owner !== "string") return true;
  return EMPTY_OWNERS.has(owner.trim().toLowerCase());
}

/**
 * Add `days` to a date and return it as a YYYY-MM-DD string.
 * Uses UTC arithmetic so the result does not shift under the runner's timezone
 * (Vercel is UTC, a dev laptop is not, and a due date that moves by a day
 * depending on where the code ran is its own bug).
 */
export function addDaysIso(from: Date, days: number): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A due value that is present and actually parseable as a date. */
function hasRealDue(due: unknown): boolean {
  if (typeof due !== "string") return false;
  const trimmed = due.trim();
  if (!trimmed) return false;
  return !Number.isNaN(new Date(trimmed).getTime());
}

export interface AppliedDefaults {
  owner: boolean;
  priority: boolean;
  due: boolean;
  effort: boolean;
}

export interface DefaultsResult<T> {
  item: T;
  applied: AppliedDefaults;
}

/**
 * Fill in the three required basics on a task that is missing them.
 *
 * Pure and non-mutating: returns a new object plus a record of what was filled,
 * so callers can log/audit the fact that a default was applied rather than
 * silently pretending the user supplied it.
 *
 * DONE tasks are left alone - back-filling a due date onto finished work would
 * manufacture fake overdue history.
 */
export function applyTaskDefaults<T extends Partial<ActionItem>>(
  item: T,
  now: Date = new Date(),
): DefaultsResult<T> {
  const applied: AppliedDefaults = { owner: false, priority: false, due: false, effort: false };
  const next = { ...item } as T;

  if (item.status === "DONE") {
    return { item: next, applied };
  }

  // Multi-assignee takes precedence: if anyone is on the assignees list the
  // task is owned, even when the derived `owner` string is still "Open".
  const hasAssignees = Array.isArray(item.assignees) && item.assignees.length > 0;
  if (!hasAssignees && isUnowned(item.owner)) {
    (next as Partial<ActionItem>).owner = FALLBACK_OWNER;
    applied.owner = true;
  }

  if (!item.priority) {
    (next as Partial<ActionItem>).priority = FALLBACK_PRIORITY;
    applied.priority = true;
  }

  if (!hasRealDue(item.due)) {
    const cls: ServiceClass = item.serviceClass ?? "Standard";
    const days = SLA_DAYS[cls] ?? SLA_DAYS.Standard;
    (next as Partial<ActionItem>).due = addDaysIso(now, days);
    applied.due = true;
  }

  if (!item.effort) {
    (next as Partial<ActionItem>).effort = FALLBACK_EFFORT;
    applied.effort = true;
  }

  return { item: next, applied };
}

/** Human-readable summary of what was auto-filled, for audit log lines. */
export function describeDefaults(applied: AppliedDefaults): string {
  const parts: string[] = [];
  if (applied.owner) parts.push(`owner=${FALLBACK_OWNER}`);
  if (applied.priority) parts.push(`priority=${FALLBACK_PRIORITY}`);
  if (applied.due) parts.push("due=SLA");
  if (applied.effort) parts.push(`effort=${FALLBACK_EFFORT}`);
  return parts.join(", ");
}
