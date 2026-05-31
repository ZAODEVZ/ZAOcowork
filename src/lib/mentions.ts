// Pure @-mention parsing. Client-safe — no node/browser imports — so the comment
// box can preview "who will be notified" and the server can compute recipients
// from the exact same logic.

/**
 * Pull @tokens out of free text. A token is `@` followed by 2-32 word chars,
 * not preceded by another word char (so emails like a@b don't match). Returns
 * lowercased, de-duplicated tokens.
 */
export function extractMentionTokens(text: string): string[] {
  const out = new Set<string>();
  const re = /(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_]{2,32})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.add(m[1].toLowerCase());
  }
  return Array.from(out);
}

/**
 * Given comment text and a list of candidates (each with a stable `key` and a
 * set of `aliases` — display name, login id, telegram username), return the
 * keys of every candidate that was @-mentioned.
 */
export function matchMentions(
  text: string,
  candidates: Array<{ key: string; aliases: Array<string | null | undefined> }>,
): string[] {
  const tokens = new Set(extractMentionTokens(text));
  if (tokens.size === 0) return [];
  const hits: string[] = [];
  for (const c of candidates) {
    const hit = c.aliases.some((a) => {
      if (!a) return false;
      // allow "@First Last" -> "firstlast" and spaced names collapsing
      const norm = a.toLowerCase().replace(/\s+/g, "");
      return tokens.has(a.toLowerCase()) || tokens.has(norm);
    });
    if (hit) hits.push(c.key);
  }
  return hits;
}
