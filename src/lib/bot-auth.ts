// Per-bot bearer-token auth for the /api/v1/* fleet endpoints.
//
// Tokens come from two sources, merged:
//   1. the bot_tokens table (migration 016) — add or rotate an agent at runtime
//      with NO redeploy; revoke by setting revoked_at.
//   2. the COWORK_BOT_TOKENS env var ("zoe=tok_abc,zaodevz=tok_def") — the
//      bootstrap/fallback so the fleet keeps working before the table is seeded
//      (or if the DB is ever unreachable during auth).
// The DB lookup is cached briefly so auth doesn't hit Postgres on every request.

import { timingSafeEqual } from "node:crypto";
import { serviceClient } from "@/lib/supabase-server";

type Entry = { token: string; bot: string };

function envEntries(): Entry[] {
  const raw = process.env.COWORK_BOT_TOKENS ?? "";
  const out: Entry[] = [];
  for (const pair of raw.split(/[,\n]/)) {
    const [bot, token] = pair.split("=").map((s) => s.trim());
    if (bot && token) out.push({ token, bot: bot.toLowerCase() });
  }
  return out;
}

async function dbEntries(): Promise<Entry[]> {
  try {
    const { data, error } = await serviceClient()
      .from("bot_tokens")
      .select("bot, token")
      .is("revoked_at", null);
    if (error || !data) return []; // table missing/unreachable -> env-only
    return data.map((r) => ({
      token: String((r as { token: unknown }).token),
      bot: String((r as { bot: unknown }).bot).toLowerCase(),
    }));
  } catch {
    return [];
  }
}

const CACHE_TTL_MS = 60_000;
let cache: { entries: Entry[]; at: number } | null = null;

async function activeEntries(): Promise<Entry[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.entries;
  // env first as a stable bootstrap; DB rows extend/override the fleet.
  const merged = [...envEntries(), ...(await dbEntries())];
  cache = { entries: merged, at: now };
  return merged;
}

/** Drop the token cache so a freshly issued/revoked token takes effect at once. */
export function invalidateBotTokenCache(): void {
  cache = null;
}

function safeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Resolve the bot behind an Authorization: Bearer <token> header.
 * Returns the lowercased bot name, or null if the token is missing/unknown.
 */
export async function authBot(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const presented = header.slice(7).trim();
  if (!presented) return null;
  for (const { token, bot } of await activeEntries()) {
    if (safeEqualStr(presented, token)) return bot;
  }
  return null;
}
