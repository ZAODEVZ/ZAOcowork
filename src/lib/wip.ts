// wip.ts - work-in-progress limits.
//
// Audit finding: 34 tasks sat in in_progress, 15 of them Zaal's. Everything in
// progress at once means nothing is actually being finished, which is what
// drove the 19.8-day median cycle time.
//
// Deliberately a SOFT limit. A hard cap was considered and rejected: with 15
// items already open, a blocking rule would have locked the board on day one.
// This surfaces the number and flags who is over it; it never refuses a move.
// If the warning gets ignored for a few weeks, that is the signal to make it
// enforcing - not before.

import type { ActionItem } from "@/lib/types";
import { effectiveAssignees } from "@/lib/types";

/**
 * Default per-person WIP limit. Five is a starting point, not a measured
 * optimum - revise once there is a few weeks of data on whether people sit
 * under it. Override with NEXT_PUBLIC_WIP_LIMIT.
 */
export const DEFAULT_WIP_LIMIT = 5;

export function wipLimit(): number {
  const raw = process.env.NEXT_PUBLIC_WIP_LIMIT;
  if (!raw) return DEFAULT_WIP_LIMIT;
  const n = Number.parseInt(raw, 10);
  // A limit of 0 or a negative would mark everyone permanently over; treat any
  // nonsense value as "not configured" rather than bricking the indicator.
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_WIP_LIMIT;
}

export interface WipEntry {
  slug: string;
  count: number;
  over: boolean;
}

/**
 * Count in-progress work per person.
 *
 * Counts through effectiveAssignees(), so a task with several assignees counts
 * against each of them - if three people are on it, it is occupying three
 * people's attention. Unassigned in-progress work belongs to nobody and is
 * excluded here; the auto-close cron adopts those separately.
 */
export function computeWip(items: ActionItem[], limit: number = wipLimit()): WipEntry[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    if (it.status !== "WIP") continue;
    if (it.archivedAt) continue;
    for (const slug of effectiveAssignees(it)) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([slug, count]) => ({ slug, count, over: count > limit }))
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}

/** WIP count for one person. */
export function wipFor(items: ActionItem[], userSlug: string, limit: number = wipLimit()): WipEntry {
  const slug = String(userSlug ?? "").trim().toLowerCase();
  const found = computeWip(items, limit).find((e) => e.slug === slug);
  return found ?? { slug, count: 0, over: false };
}

/**
 * One-line nudge for someone over their limit, or null when they are within it.
 * Phrased as what to do next, not as a scolding - the point is to get something
 * finished, not to report a violation.
 */
export function wipWarning(
  items: ActionItem[],
  userSlug: string,
  limit: number = wipLimit(),
): string | null {
  const { count, over } = wipFor(items, userSlug, limit);
  if (!over) return null;
  return `${count} in progress (limit ${limit}) - finish one before starting another`;
}
