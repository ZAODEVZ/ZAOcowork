// task-quality.ts - create-time nudges (Phase 5).
//
// Two failure modes the board audit found, both cheap to catch at write time
// and expensive to fix later:
//
// 1. VAGUE TITLES. Real examples currently on the board: "ZAOstock",
//    "Monday 20/07/2026", "Tue 21/07/2026", "micky july 27th 2026 week todos",
//    "Iman The ZAO Todos". Seven such rows exist. None can be worked as
//    written, and nobody can tell what "done" means. A title that is only a
//    date or only a brand name is a placeholder, not a task.
//
// 2. DUPLICATES. Eight duplicate clusters were found in one pass (the money
//    items, three copies of "Iman reviews open PRs", JubJub twice, and so on).
//    They accumulate because nothing surfaces a near-match at creation time.
//
// Both are WARNINGS, never blocks. A thin task still beats a lost one - the
// point is to make the problem visible at the only moment it is cheap to fix.

/** Titles shorter than this (in words) are almost never actionable. */
export const MIN_TITLE_WORDS = 5;

/** Jaccard similarity above this counts as a probable duplicate. */
export const DUPLICATE_THRESHOLD = 0.7;

const DATE_ONLY =
  /^\s*(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)?[a-z]*\s*\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\s*(tasks|todos)?\s*$/i;

/** Words that carry no task meaning on their own. */
const FILLER = new Set([
  "the", "a", "an", "and", "or", "to", "for", "of", "in", "on", "at", "with",
  "todo", "todos", "task", "tasks", "week", "day", "stuff", "things", "misc",
]);

export function normalizeTitle(title: string): string {
  return String(title ?? "")
    .toLowerCase()
    .replace(/^(inbox action|action item|handoff|test plan)[: ]+/i, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleWords(title: string): string[] {
  return normalizeTitle(title).split(" ").filter(Boolean);
}

export interface QualityWarning {
  kind: "vague" | "duplicate";
  message: string;
  /** For duplicates: the ids of the tasks it resembles. */
  relatedIds?: string[];
}

/**
 * Is this title too thin to be actionable?
 *
 * Catches three shapes: too few meaningful words, a bare date, and a title
 * that is nothing but a brand/person name.
 */
export function checkVagueTitle(title: string, knownBrands: string[] = []): QualityWarning | null {
  const raw = String(title ?? "").trim();
  if (!raw) return null; // empty is handled by the required-field check

  if (DATE_ONLY.test(raw)) {
    return {
      kind: "vague",
      message: `"${raw}" is just a date. What needs doing on that date?`,
    };
  }

  const words = titleWords(raw);
  const meaningful = words.filter((w) => !FILLER.has(w));

  const brandSet = new Set(knownBrands.map((b) => normalizeTitle(b)));
  if (meaningful.length > 0 && brandSet.has(meaningful.join(" "))) {
    return {
      kind: "vague",
      message: `"${raw}" is only a brand name. Add the action - what about it?`,
    };
  }

  if (meaningful.length < MIN_TITLE_WORDS) {
    return {
      kind: "vague",
      message: `Only ${meaningful.length} meaningful word${
        meaningful.length === 1 ? "" : "s"
      }. Add a verb and an object so this is workable in three weeks.`,
    };
  }
  return null;
}

/** Word-overlap similarity (Jaccard) between two titles. */
export function titleSimilarity(a: string, b: string): number {
  const A = new Set(titleWords(a).filter((w) => !FILLER.has(w)));
  const B = new Set(titleWords(b).filter((w) => !FILLER.has(w)));
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared += 1;
  const union = A.size + B.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * Find probable duplicates of `title` among `existing`.
 *
 * Scoped to the same brand by the caller - cross-brand near-matches are
 * usually genuinely different work ("month 1" vs "month 2", TikTok vs
 * Instagram), and flagging those was the false-positive problem that made an
 * earlier automated pass useless.
 */
export function findSimilar(
  title: string,
  existing: Array<{ id: string; title: string }>,
  threshold = DUPLICATE_THRESHOLD,
): QualityWarning | null {
  const hits = existing
    .map((e) => ({ ...e, score: titleSimilarity(title, e.title) }))
    .filter((e) => e.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (hits.length === 0) return null;
  return {
    kind: "duplicate",
    message: `Looks like ${hits.length === 1 ? "an existing task" : "existing tasks"}: ${hits
      .map((h) => `#${h.id}`)
      .join(", ")}. Same thing, or genuinely different?`,
    relatedIds: hits.map((h) => h.id),
  };
}
