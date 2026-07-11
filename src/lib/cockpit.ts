import type { ActionItem } from "./types";
import { ageDays, isStale, isAssignedTo } from "./types";

/**
 * Cockpit brief computation functions - pure data transformations
 * Computing 5 operational sections from the task list to surface at-a-glance context.
 */

/**
 * Do First: urgent active items (not DONE/TRIAGE), sorted by due date then priority.
 * Surfaces the next 3 things to pull when free.
 */
export function computeDoFirst(
  items: ActionItem[],
  options: { limit?: number } = {},
): ActionItem[] {
  const limit = options.limit ?? 3;
  const active = items.filter((x) => !x.archivedAt && x.status !== "DONE" && x.status !== "TRIAGE");

  return active
    .sort((a, b) => {
      // Sort by due date first (soonest first; no due at end)
      if (a.due && !b.due) return -1;
      if (!a.due && b.due) return 1;
      if (a.due && b.due) {
        const cmp = a.due.localeCompare(b.due);
        if (cmp !== 0) return cmp;
      }
      // Then by priority (P1 > P2 > P3)
      const priorityOrder = { P1: 0, P2: 1, P3: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, limit);
}

/**
 * Needs You: items awaiting the current user's input or decision.
 * Includes: nextOwner="me", unowned tasks, items requiring review.
 */
export function computeNeedsYou(
  items: ActionItem[],
  currentUser: string,
  options: { limit?: number } = {},
): ActionItem[] {
  const limit = options.limit ?? 5;
  const active = items.filter((x) => !x.archivedAt && x.status !== "DONE");

  return active
    .filter((x) => {
      // Explicitly routed to current user
      if (x.nextOwner === "me") return true;
      // Unowned items (no owner or "Open")
      const o = String(x.owner ?? "").trim();
      if (!o || o === "Open") return true;
      // Items awaiting review (has pending updates and is assigned to user)
      const hasPendingReview = (x.updates ?? []).some((u) => u.reviewStatus === "pending");
      if (hasPendingReview && isAssignedTo(x, currentUser)) return true;
      return false;
    })
    .slice(0, limit);
}

/**
 * Open PRs: tasks with linked pull requests that are still open.
 * Surfaces work that has PR in flight.
 */
export function computeOpenPRs(
  items: ActionItem[],
  options: { limit?: number } = {},
): ActionItem[] {
  const limit = options.limit ?? 5;

  return items
    .filter((x) => !x.archivedAt && x.prState === "open" && x.prUrl)
    .sort((a, b) => {
      // Newest first (by creation date)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .slice(0, limit);
}

/**
 * Idea Inbox: TRIAGE status items (external captures awaiting routing).
 * Sorted by age (oldest first - first-in-first-out for the inbox).
 */
export function computeIdeaInbox(
  items: ActionItem[],
  options: { limit?: number; staleThresholdDays?: number } = {},
): ActionItem[] {
  const limit = options.limit ?? 10;
  const staleThreshold = options.staleThresholdDays ?? 7;

  return items
    .filter((x) => x.status === "TRIAGE")
    .sort((a, b) => {
      // Oldest first (FIFO inbox)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })
    .map((x) => ({
      ...x,
      // Augment with a stale flag for display (items aged 7+ days)
      isCollectorsFallacy: ageDays(x.createdAt) >= staleThreshold,
    }))
    .slice(0, limit);
}

/**
 * Stale: items that are WIP or BLOCKED with no activity 5+ days.
 * Surfaces forgotten work that aging alone misses.
 */
export function computeStale(
  items: ActionItem[],
  options: { limit?: number } = {},
): ActionItem[] {
  const limit = options.limit ?? 5;
  const active = items.filter((x) => !x.archivedAt && x.status !== "DONE" && x.status !== "TRIAGE");

  return active
    .filter((x) => isStale(x))
    .sort((a, b) => {
      // Oldest first (most neglected first)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })
    .slice(0, limit);
}
