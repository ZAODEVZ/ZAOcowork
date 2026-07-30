import type { ActionItem, Priority } from "./types";

/**
 * The single priority axis.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * The board carried six overlapping "how important is this" signals -
 * priority, important, urgent, serviceClass, phase, nextOwner - and three
 * surfaces each ranked by a different subset, with the ladder hand-rolled
 * inline in every one:
 *
 *   focus.ts    ranked by serviceClass="Expedite" (+1000) and P1-in-WIP
 *   cockpit.ts  gated on `urgent`, then an inline {P1:0,P2:1,P3:2}
 *   digest.ts   ranked by priority alone, via its own ternary ladder
 *
 * So the same task could top the cockpit and be absent from focus. There
 * was no shared definition of "hot" to disagree with, because there was no
 * shared definition at all.
 *
 * WHAT THE DATA SAID (309 open tasks, measured 2026-07-28)
 * -------------------------------------------------------
 *   serviceClass  Standard 309, everything else 0.  No variance whatsoever.
 *                 The Expedite branch in focus.ts carried the HIGHEST weight
 *                 in the whole ranking and was unreachable.
 *   phase         283 null, 26 "Define" (the default). Nothing reads it.
 *   priority      P2 223, P1 40, P3 24, null 22.
 *   important     41 true / 268 false
 *   urgent        19 true / 290 false
 *
 * And the axes CONTRADICT each other rather than merely overlapping: 35 of
 * the 40 P1 tasks are flagged important=false AND urgent=false, while the
 * flags are used more often on P2 than on P1. Whoever sets priority does not
 * touch the flags, and whoever sets the flags does not touch priority.
 *
 * THE CHOICE
 * ----------
 * `priority` is the one real axis: it is the only signal with meaningful
 * spread that every surface already agreed to read, and it is what the board
 * UI exposes. Everything here ranks on it.
 *
 * `urgent` is kept as a boost rather than an axis, because it is the only
 * other signal a human actually sets (19 rows) and it is what cockpit's "Do
 * First" already gated on. Dropping it would silently change that surface.
 *
 * `important` IS read, as of Zaal's ruling 2026-07-29: wire it, do not drop
 * it. It ranks in focus.ts at a deliberately low weight - see isHot below and
 * the comment on the focus branch for why the Eisenhower "schedule" quadrant
 * does not get a high score.
 *
 * `serviceClass` and `phase` are NOT read here. See DEPRECATED_AXES.
 */

/** Lower is hotter. Unset priority sorts as P2, which is the create default. */
export const PRIORITY_ORDER: Record<Priority, number> = { P1: 0, P2: 1, P3: 2 };

export function priorityRank(p: Priority | null | undefined): number {
  return p ? (PRIORITY_ORDER[p] ?? 1) : 1;
}

/**
 * Comparator for "most important first". Stable tiebreak on due date so two
 * P1s do not shuffle between renders.
 */
export function byPriority(a: ActionItem, b: ActionItem): number {
  const d = priorityRank(a.priority) - priorityRank(b.priority);
  if (d !== 0) return d;
  if (a.due && !b.due) return -1;
  if (!a.due && b.due) return 1;
  if (a.due && b.due) return a.due.localeCompare(b.due);
  return 0;
}

/**
 * Is this the kind of task that should jump the queue?
 *
 * Deliberately NOT `serviceClass === "Expedite"`: that is what focus.ts used,
 * it is set on zero of 309 open tasks, and it made the top-weighted branch of
 * the ranker dead code. `urgent` is the signal humans actually set.
 */
export function isHot(it: ActionItem): boolean {
  return Boolean(it.urgent) || it.priority === "P1" || Boolean(it.important);
}

/**
 * Axes that exist in the schema and the UI but that nothing ranks on.
 *
 * Listed rather than deleted on purpose. Removing a column, or stripping a
 * field from the task form, changes what Zaal sees on his own board and
 * discards flags 41 tasks are carrying - that is a product call, not a
 * refactor. This constant exists so the decision has one place to live and
 * so the next person does not have to re-derive the measurements above.
 *
 *   serviceClass - 0/309 non-default. Retiring it costs nothing.
 *   phase        - DMAIC leftover, 283/309 null, no reader.
 *
 * `important` was on this list until 2026-07-29. Zaal ruled: wire it. It now
 * ranks in focus.ts, so it is no longer a flag that does nothing.
 */
export const DEPRECATED_AXES = ["serviceClass", "phase"] as const;
