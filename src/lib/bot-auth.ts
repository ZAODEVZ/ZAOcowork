// Per-bot bearer-token auth for the /api/v1/* fleet endpoints.
//
// Tokens live in one env var so a small fleet needs no tokens table:
//   COWORK_BOT_TOKENS="hermes=tok_abc,zoe=tok_def,zaodevz=tok_ghi"
// Each bot gets its own token -> per-bot audit (we log the resolved bot name)
// and per-bot revocation (rotate that one entry). Swap for a DB table later if
// the fleet grows or you want runtime rotation without a redeploy.

import { timingSafeEqual } from "node:crypto";

function tokenMap(): Map<string, string> {
  // token -> bot name
  const raw = process.env.COWORK_BOT_TOKENS ?? "";
  const map = new Map<string, string>();
  for (const pair of raw.split(/[,\n]/)) {
    const [bot, token] = pair.split("=").map((s) => s.trim());
    if (bot && token) map.set(token, bot.toLowerCase());
  }
  return map;
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
export function authBot(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const presented = header.slice(7).trim();
  if (!presented) return null;
  for (const [token, bot] of tokenMap()) {
    if (safeEqualStr(presented, token)) return bot;
  }
  return null;
}
