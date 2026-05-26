// parse-task.ts - one-pass natural language parser for the QuickAdd input.
//
// Power-user shorthand the bot already accepts in /add. Lifting it to the web
// so a single field can capture title + priority + owner + brand + due + flags.
//
// Supported tokens (any order, surrounded by whitespace):
//
//   #brand-slug         -> brand (e.g. #zaodevz, #wavewarz). Multiple OK.
//   !p1 | !p2 | !p3     -> priority. Last one wins.
//   !urgent             -> urgent flag
//   !important          -> important flag
//   @zaal | @iman | ... -> owner. Case-insensitive. Last one wins.
//   due:2026-06-15      -> exact date
//   due:today           -> today's date
//   due:tomorrow        -> tomorrow
//   due:mon..sun        -> next occurrence of that weekday (incl. today if today is that day)
//
// Tokens are stripped from the title. Anything left over is the title.
// Unknown !flag-something and #not-a-brand are left in the title untouched.

import { BRAND_SLUGS, type BrandName } from "./brands";

export type ParsedPriority = "P1" | "P2" | "P3";

const KNOWN_OWNERS = ["Zaal", "Iman", "ThyRev", "Samantha", "Tyler", "Both", "Open"] as const;
type OwnerName = (typeof KNOWN_OWNERS)[number];

export interface ParsedTask {
  title: string;
  brands: BrandName[];
  priority: ParsedPriority | null;
  urgent: boolean;
  important: boolean;
  owner: OwnerName | null;
  due: string | null;
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

function isoDateLocal(d: Date): string {
  // Format YYYY-MM-DD in the browser's local timezone. UTC would shift the
  // date for users west of UTC after their afternoon.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resolveDueToken(raw: string, now: Date = new Date()): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  // ISO date passthrough
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (t === "today") return isoDateLocal(now);
  if (t === "tomorrow" || t === "tmrw") {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return isoDateLocal(d);
  }
  // Next weekday (incl. today if today matches)
  const wd = WEEKDAYS[t];
  if (typeof wd === "number") {
    const d = new Date(now);
    const today = d.getDay();
    const diff = (wd - today + 7) % 7;
    d.setDate(d.getDate() + diff);
    return isoDateLocal(d);
  }
  return null;
}

function ownerFromHandle(raw: string): OwnerName | null {
  const lower = raw.toLowerCase();
  for (const o of KNOWN_OWNERS) {
    if (o.toLowerCase() === lower) return o;
  }
  return null;
}

const TOKEN_RE = /(?:\s|^)(#[a-z0-9-]+|![a-zA-Z0-9]+|@[a-zA-Z0-9_]+|due:[a-zA-Z0-9-]+)(?=\s|$)/g;

export function parseTask(input: string, now: Date = new Date()): ParsedTask {
  const brands: BrandName[] = [];
  let priority: ParsedPriority | null = null;
  let urgent = false;
  let important = false;
  let owner: OwnerName | null = null;
  let due: string | null = null;

  // Replace recognized tokens with placeholders we'll strip later. Anything
  // unrecognized (e.g. `#randomtag`, `!hello`, `@unknownuser`) gets left alone
  // and ends up in the title.
  const stripped = input.replace(TOKEN_RE, (whole, tok: string) => {
    const t = tok.toLowerCase();
    if (tok.startsWith("#")) {
      const b = BRAND_SLUGS[t.slice(1)];
      if (b && !brands.includes(b)) brands.push(b);
      return b ? " " : whole;
    }
    if (tok.startsWith("!")) {
      const v = t.slice(1);
      if (v === "p1" || v === "p2" || v === "p3") {
        priority = v.toUpperCase() as ParsedPriority;
        return " ";
      }
      if (v === "urgent") {
        urgent = true;
        return " ";
      }
      if (v === "important") {
        important = true;
        return " ";
      }
      return whole;
    }
    if (tok.startsWith("@")) {
      const o = ownerFromHandle(tok.slice(1));
      if (o) {
        owner = o;
        return " ";
      }
      return whole;
    }
    if (t.startsWith("due:")) {
      const resolved = resolveDueToken(tok.slice(4), now);
      if (resolved) {
        due = resolved;
        return " ";
      }
      return whole;
    }
    return whole;
  });

  const title = stripped.replace(/\s+/g, " ").trim();
  return { title, brands, priority, urgent, important, owner, due };
}
