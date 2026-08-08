// Pure @-mention autocomplete. Client-safe - no React, no DOM - so the caret
// logic can be unit-tested without rendering anything.
//
// WHY THIS EXISTS
// The comment box placeholder has always said "tag with @name", and mentions
// have always WORKED - matchMentions() in mentions.ts resolves them and drives
// notifications. What was missing is any way to find out what the names ARE.
// You had to already know the roster to use the feature the placeholder invites
// you to use, so in practice mentions only ever went to the two or three people
// you could remember.
//
// The same class of bug is already documented one file over: every people
// picker except TaskRoom used a hardcoded OWNERS list and was "missing 7 of the
// 14 active members". A picker that shows a stale subset is worse than none,
// because it looks complete. So this reads the live roster the caller passes in
// and never carries its own list of humans.

import type { TeamOption } from "@/lib/team-options";

/** A row in the dropdown. `slug` is what gets inserted after the @. */
export interface MentionCandidate {
  slug: string;
  name: string;
  /** Non-human helpers (zoe). Sorted last and labelled, never hidden. */
  isBot?: boolean;
}

/**
 * ZOE is mentionable on purpose.
 *
 * `@zoe` in a board comment is a real interface - ZOE watches for it, answers
 * questions in-thread, and (for an authorized commander) executes board
 * commands. If the picker listed only humans, the most capable participant on
 * the board would be the one you had to remember by heart.
 */
export const BOT_CANDIDATES: MentionCandidate[] = [
  { slug: "zoe", name: "ZOE (assistant)", isBot: true },
];

export interface MentionQuery {
  /** Is the caret inside an @token right now? */
  active: boolean;
  /** The text typed after the @, lowercased. Empty right after typing "@". */
  query: string;
  /** Index of the "@" in the source text. -1 when inactive. */
  start: number;
  /** Index just past the token, i.e. the caret. -1 when inactive. */
  end: number;
}

const INACTIVE: MentionQuery = { active: false, query: "", start: -1, end: -1 };

/**
 * Decide whether the caret sits in an @mention, and what has been typed so far.
 *
 * Scans back from the caret to the nearest "@". The token ends at the caret, so
 * editing mid-word works: with "hey @za|l" the query is "za", not "zal".
 *
 * Deliberately conservative about what opens a menu:
 * - the "@" must start a word (so an email address never triggers it)
 * - the token may not contain whitespace (one word only)
 * - a token longer than 32 chars is not a name anyone is typing
 */
export function getMentionQuery(text: string, caret: number): MentionQuery {
  if (caret < 0 || caret > text.length) return INACTIVE;

  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === "@") break;
    // A name is one word. Whitespace or a second "@" means we are not in a token.
    if (/\s/.test(ch)) return INACTIVE;
    if (caret - i > 32) return INACTIVE;
    i--;
  }
  if (i < 0) return INACTIVE;

  // "@" must open a word - guards against emails (a@b) and mid-word ats.
  const before = i > 0 ? text[i - 1] : "";
  if (before && /[A-Za-z0-9_]/.test(before)) return INACTIVE;

  const query = text.slice(i + 1, caret);
  // Only word characters are part of a name token.
  if (!/^[A-Za-z0-9_]*$/.test(query)) return INACTIVE;

  return { active: true, query: query.toLowerCase(), start: i, end: caret };
}

/**
 * Rank the roster against what has been typed.
 *
 * Prefix matches beat substring matches, because someone typing "sa" means
 * Samantha rather than "Jose (Casa)". Within a tier, order is alphabetical so
 * the list does not reshuffle unpredictably as you type.
 *
 * An empty query returns everyone - typing a bare "@" is how you ask "who is
 * there?", which is the whole point of the feature.
 */
export function rankCandidates(
  query: string,
  people: TeamOption[],
  opts: { includeBots?: boolean; limit?: number } = {},
): MentionCandidate[] {
  const { includeBots = true, limit = 8 } = opts;
  const q = query.toLowerCase().trim();

  const pool: MentionCandidate[] = [
    ...people.map((p) => ({ slug: p.slug, name: p.name })),
    ...(includeBots ? BOT_CANDIDATES : []),
  ];

  const scored: Array<{ c: MentionCandidate; rank: number }> = [];
  for (const c of pool) {
    const slug = c.slug.toLowerCase();
    const name = c.name.toLowerCase();
    const nameNoSpace = name.replace(/\s+/g, "");

    let rank = -1;
    if (q === "") rank = 2;
    else if (slug.startsWith(q) || nameNoSpace.startsWith(q)) rank = 0;
    else if (slug.includes(q) || nameNoSpace.includes(q)) rank = 1;
    if (rank < 0) continue;

    // Bots sort after people at the same relevance - present, never in the way.
    scored.push({ c, rank: rank * 2 + (c.isBot ? 1 : 0) });
  }

  scored.sort((a, b) => a.rank - b.rank || a.c.slug.localeCompare(b.c.slug));
  return scored.slice(0, limit).map((s) => s.c);
}

/**
 * Replace the in-progress token with the chosen handle.
 *
 * Returns the new text and where the caret belongs, so the caller can restore
 * it. A trailing space is appended because the next thing typed is always
 * either more prose or another mention, and both want the separation.
 */
export function applyMention(
  text: string,
  q: MentionQuery,
  slug: string,
): { text: string; caret: number } {
  if (!q.active) return { text, caret: q.end < 0 ? text.length : q.end };
  const inserted = `@${slug} `;
  const next = text.slice(0, q.start) + inserted + text.slice(q.end);
  return { text: next, caret: q.start + inserted.length };
}

/** Move a highlighted index within a list, wrapping at both ends. */
export function moveHighlight(current: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((current + delta) % length) + length) % length;
}
