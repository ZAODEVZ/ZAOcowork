// Validates + parses public-status/status.json fetched from the zao-vault
// repo. This is the ONLY vault content this app ever renders, and it is
// deliberately schema-locked rather than a raw-markdown pass-through.
//
// WHY. Two real incidents on 2026-09-20: a third party's private health
// detail sat in a vault daily file for hours before catching it, and a
// third party's email address leaked through a second surface the same
// day. A filter over raw text fails open the first time someone writes a
// sentence the filter did not anticipate. A fixed field schema cannot leak
// a field that is not in it - see zao-vault/public-status/README.md.
//
// FAIL-CLOSED RULES, do not soften these without re-reading the incident
// above:
//   - Unknown keys are dropped from the parsed result (never rendered),
//     but the key NAME (never the value) is logged server-side so a
//     typo'd key doesn't silently produce a blank section forever.
//   - A missing required field (date, headline, updatedAt) refuses the
//     WHOLE payload. No partial render.
//   - An over-length string (headline, or any shipped/next entry) REFUSES
//     the whole payload too. Truncating a string is fail-OPEN: it still
//     publishes the first N characters of whatever leaked. The cap exists
//     so a line that is too long to have been written FOR this schema
//     gets caught immediately, not shortened and shipped.
//   - Array overflow (more than MAX_ITEMS entries) is a count problem on
//     already-valid, already-capped strings, not a content problem - that
//     one truncates rather than refuses.

export const MAX_STRING_LEN = 140;
export const MAX_ITEMS = 6;

export interface VaultStatus {
  date: string;
  headline: string;
  shipped: string[];
  next: string[];
  updatedAt: string;
}

export type VaultStatusResult =
  | { ok: true; status: VaultStatus; droppedKeys: string[] }
  | { ok: false; reason: string };

const REQUIRED_KEYS = ["date", "headline", "updatedAt"] as const;
const KNOWN_KEYS = new Set(["date", "headline", "shipped", "next", "updatedAt"]);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function validateStringField(name: string, v: unknown): { ok: true; value: string } | { ok: false; reason: string } {
  if (!isNonEmptyString(v)) {
    return { ok: false, reason: `field "${name}" must be a non-empty string` };
  }
  if (v.length > MAX_STRING_LEN) {
    // Fail-closed on purpose: truncating still publishes the first
    // MAX_STRING_LEN characters of whatever this was. Refuse instead.
    return {
      ok: false,
      reason: `field "${name}" is ${v.length} chars, over the ${MAX_STRING_LEN}-char cap - refusing rather than truncating`,
    };
  }
  return { ok: true, value: v };
}

function validateStringArray(
  name: string,
  v: unknown
): { ok: true; value: string[] } | { ok: false; reason: string } {
  if (v === undefined) return { ok: true, value: [] };
  if (!Array.isArray(v)) {
    return { ok: false, reason: `field "${name}" must be an array of strings` };
  }
  const out: string[] = [];
  for (const [i, item] of v.entries()) {
    const r = validateStringField(`${name}[${i}]`, item);
    if (!r.ok) return r;
    out.push(r.value);
  }
  // Array overflow truncates - a count problem on already-valid strings,
  // not a content problem. Unlike an over-cap string, this is safe to trim.
  return { ok: true, value: out.slice(0, MAX_ITEMS) };
}

/**
 * Parse + validate a raw JSON payload against the public-status schema.
 * Fail-closed: any violation of a required field or a string length cap
 * refuses the WHOLE payload (ok: false) rather than rendering a partial
 * or truncated result. Unknown keys are dropped and reported by name only.
 */
export function parseVaultStatus(raw: unknown): VaultStatusResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "payload is not a JSON object" };
  }
  const obj = raw as Record<string, unknown>;

  for (const key of REQUIRED_KEYS) {
    if (!(key in obj)) {
      return { ok: false, reason: `missing required field "${key}"` };
    }
  }

  const droppedKeys = Object.keys(obj).filter((k) => !KNOWN_KEYS.has(k));

  const date = validateStringField("date", obj.date);
  if (!date.ok) return date;

  const headline = validateStringField("headline", obj.headline);
  if (!headline.ok) return headline;

  const updatedAt = validateStringField("updatedAt", obj.updatedAt);
  if (!updatedAt.ok) return updatedAt;

  const shipped = validateStringArray("shipped", obj.shipped);
  if (!shipped.ok) return shipped;

  const next = validateStringArray("next", obj.next);
  if (!next.ok) return next;

  return {
    ok: true,
    status: {
      date: date.value,
      headline: headline.value,
      shipped: shipped.value,
      next: next.value,
      updatedAt: updatedAt.value,
    },
    droppedKeys,
  };
}
