// Client-safe @mention parsing. Pure functions, no Node/browser imports — safe
// to import from both client components (NotificationBell, TaskRoom) and server
// actions (addComment). The mentionable roster mirrors the session users in
// auth.ts; owner_value lines up with data/team.json for telegram_id lookup.

export interface Mentionable {
  /** Session user key — matches Comment.userId and NotificationBell currentUser. */
  key: string;
  /** Display label. */
  label: string;
  /** Matches data/team.json owner_value, used for telegram_id resolution. */
  ownerValue: string;
  /** Lowercased @handles that resolve to this user. */
  aliases: string[];
}

export const MENTIONABLE_USERS: Mentionable[] = [
  { key: "zaal", label: "Zaal", ownerValue: "Zaal", aliases: ["zaal"] },
  { key: "iman", label: "Iman", ownerValue: "Iman", aliases: ["iman"] },
  { key: "thyrev", label: "ThyRev", ownerValue: "ThyRev", aliases: ["thyrev", "thy"] },
  { key: "samantha", label: "Samantha", ownerValue: "Samantha", aliases: ["samantha", "sam"] },
  { key: "tyler", label: "Tyler", ownerValue: "Tyler", aliases: ["tyler"] },
];

// @ must start the string or follow a non-word char (so emails like a@iman
// don't match). Handle is letters/digits/underscore.
const MENTION_RE = /(?:^|[^\w@])@([a-zA-Z0-9_]+)/g;

/** All distinct lowercased handles mentioned in `text` (without the @). */
export function extractMentionTokens(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(MENTION_RE)) out.add(m[1].toLowerCase());
  return [...out];
}

/** Resolve the @mentions in `text` to known users. Deduplicated. */
export function resolveMentions(text: string): Mentionable[] {
  const tokens = new Set(extractMentionTokens(text));
  if (tokens.size === 0) return [];
  return MENTIONABLE_USERS.filter((u) => u.aliases.some((a) => tokens.has(a)));
}

/** True if `userKey` (a session key) is @mentioned anywhere in `text`. */
export function isUserMentioned(text: string, userKey: string): boolean {
  const k = userKey.trim().toLowerCase();
  const user = MENTIONABLE_USERS.find((u) => u.key === k);
  if (!user) return false;
  const tokens = new Set(extractMentionTokens(text));
  return user.aliases.some((a) => tokens.has(a));
}
