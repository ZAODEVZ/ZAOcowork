// agent-intake.ts - the write gate for tasks created by an agent with no
// human in the loop. Doc 2193.
//
// WHY THIS IS DIFFERENT FROM task-quality.ts
// ------------------------------------------
// task-quality.ts deliberately makes everything a WARNING, never a block:
// "A thin task still beats a lost one." That is correct for a human at the
// QuickAdd box - they are looking at the screen, they can judge the warning,
// and the work is real work that would otherwise be lost.
//
// None of those hold for an agent write. Measured on the live board
// 2026-08-04, across the 93 open rows carrying legacy_source='escalated':
//
//   with a body (notes)      0 of 93     (100% empty)
//   with an owner            0 of 93     (100% unowned)
//   ever completed           1 of 94 lifetime  (1.06%)
//   near-duplicate of another 35 of 93   (Jaccard >= 0.5)
//
// A warning attached to those rows would be read by nobody, because nobody
// is at the screen when they are written. So for agent sources the same
// checks become refusals.
//
// THE THRESHOLD ASYMMETRY
// -----------------------
// task-quality's DUPLICATE_THRESHOLD is 0.7. Against the real escalator
// output that catches 8 of 93. At 0.5 it catches 35. We use 0.5 here and
// leave 0.7 for the human path, because the cost of being wrong is not
// symmetric:
//
//   false positive, human path : friction on real work someone is doing now
//   false positive, agent path : the agent re-posts with a distinct title
//   false negative, agent path : a permanent board row nobody will ever close
//
// The pair that motivated this, both live on the board right now, share only
// three words and are the same piece of work:
//
//   "Process PR #244: artist rider tracker"
//   "Process PR #244 for volunteer coordination"
//
// Note they are NOT exact duplicates - measured, there are 0 exact-duplicate
// titles among all 94. Equality-based dedup reports a clean board.

import { findSimilar, titleSimilarity, type QualityWarning } from "./task-quality";
import { isAgentSource } from "./types";
import type { TaskSource } from "./types";

/**
 * Duplicate threshold for agent writes. Lower than task-quality's 0.7 - see
 * the asymmetry note above.
 */
export const AGENT_DUPLICATE_THRESHOLD = 0.5;

/**
 * Strong identifiers in a title: PR/issue refs and doc numbers.
 *
 * Word-overlap alone does NOT catch the motivating pair. Measured:
 *
 *   "Process PR #244: artist rider tracker"      -> {process,pr,244,artist,rider,tracker}
 *   "Process PR #244 for volunteer coordination" -> {process,pr,244,volunteer,coordination}
 *   shared 3, union 8, Jaccard = 0.375
 *
 * That is below 0.5, and lowering the threshold far enough to catch it (0.35)
 * would sit only 0.06 above the genuinely-distinct Zoostr pair at 0.286 - too
 * tight a window to trust.
 *
 * But the two titles name the SAME PULL REQUEST. That is not weak evidence
 * that they overlap, it is strong evidence they are the same work. An
 * identifier match is worth more than any amount of word overlap, so it is
 * checked separately rather than folded into the score.
 */
export function extractIdentifiers(title: string): string[] {
  const out = new Set<string>();
  const s = String(title ?? "");
  // "#244", "PR #244", "PR 244", "issue 244", "doc 2193"
  for (const m of s.matchAll(/(?:^|\s)#(\d{1,6})\b/g)) out.add(`ref:${m[1]}`);
  for (const m of s.matchAll(/\b(?:pr|issue|doc|ticket)\s*#?\s*(\d{1,6})\b/gi)) out.add(`ref:${m[1]}`);
  return [...out];
}

/** Identifiers appearing in both titles. */
export function sharedIdentifiers(a: string, b: string): string[] {
  const A = new Set(extractIdentifiers(a));
  return extractIdentifiers(b).filter((id) => A.has(id));
}

/**
 * An agent-written task must carry enough context that a triage pass can
 * later decide whether it is real. This is the minimum body length that
 * counts as "defined" - roughly one sentence.
 *
 * Chosen from what the 100%-completion sources already do: research-dispatch
 * and pr-test-task rows both carry a source link plus a done-condition, and
 * both close at 100%. `ai-proposal`, which carries a title and little else,
 * closes at 56%.
 */
export const MIN_AGENT_NOTE_CHARS = 40;

export interface IntakeRejection {
  /** Machine-readable so the caller can pick an HTTP status. */
  code: "undefined-task" | "duplicate";
  message: string;
  /** For duplicates: ids of the tasks it collides with. */
  relatedIds?: string[];
}

export interface AgentIntakeInput {
  title: string;
  notes?: string | null;
  source?: TaskSource | null;
}

/**
 * Gate an incoming task write.
 *
 * Returns null when the write should proceed. Returns a rejection when an
 * agent source wrote something undefined or duplicated. Human sources are
 * always allowed through - they keep the warning-only behaviour of
 * task-quality.ts.
 *
 * `existing` should be the open tasks to check against. The caller scopes
 * it; passing the whole board is fine but wasteful.
 */
export function checkAgentIntake(
  input: AgentIntakeInput,
  existing: Array<{ id: string; title: string }>,
): IntakeRejection | null {
  // Humans keep the old behaviour. This gate is only about writers that have
  // nobody reading a warning.
  if (!isAgentSource(input.source)) return null;

  const notes = String(input.notes ?? "").trim();
  if (notes.length < MIN_AGENT_NOTE_CHARS) {
    return {
      code: "undefined-task",
      message:
        `An agent-written task needs a body of at least ${MIN_AGENT_NOTE_CHARS} characters ` +
        `giving (a) the source link that triggered it and (b) one sentence saying what is ` +
        `true when it is done. Got ${notes.length}. A title alone cannot be triaged later.`,
    };
  }

  // Strong signal first: same PR / issue / doc number means same work,
  // regardless of how differently the two titles are phrased.
  const idHits = existing.filter((e) => sharedIdentifiers(input.title, e.title).length > 0);
  if (idHits.length > 0) {
    const ids = idHits.slice(0, 3).map((h) => h.id);
    const ref = sharedIdentifiers(input.title, idHits[0].title).join(", ").replace(/ref:/g, "#");
    return {
      code: "duplicate",
      message:
        `Already tracked under ${ref}: ${ids.map((i) => `#${i}`).join(", ")}. ` +
        `Add to that task rather than opening a second one for the same reference.`,
      relatedIds: ids,
    };
  }

  // Weak signal: word overlap, for titles that carry no identifier.
  const dup: QualityWarning | null = findSimilar(
    input.title,
    existing,
    AGENT_DUPLICATE_THRESHOLD,
  );
  if (dup) {
    return {
      code: "duplicate",
      message: dup.message,
      relatedIds: dup.relatedIds,
    };
  }

  return null;
}

/**
 * Best-match score against existing titles. Exposed for logging so a rejected
 * write can record how close the collision was, which is what tells you
 * whether AGENT_DUPLICATE_THRESHOLD is set right.
 */
export function bestMatchScore(
  title: string,
  existing: Array<{ id: string; title: string }>,
): number {
  return existing.reduce((max, e) => Math.max(max, titleSimilarity(title, e.title)), 0);
}
