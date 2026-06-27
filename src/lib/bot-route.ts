// Shared guard for the external /api/v1/* bot endpoints.
//
// Every bot write route repeats the same three steps: authenticate the bearer
// token, rate-limit per bot, and return a consistent { ok: false, error }
// envelope on failure. This centralizes all three so routes stay thin and the
// error contract is uniform (doc: bot-architecture cleanup).

import { authBot } from "@/lib/bot-auth";
import { rateLimit } from "@/lib/rate-limit";

export interface BotContext {
  bot: string;
}

// Default write budget per bot: 60 writes/minute. Generous for a well-behaved
// agent, a hard speed-bump for a runaway loop or replay. Reads are cheaper and
// can pass a higher max.
const DEFAULT_MAX = 60;
const DEFAULT_WINDOW_MS = 60_000;

/** Standard JSON error envelope shared by all v1 routes. */
export function botError(status: number, error: string, extra?: Record<string, unknown>): Response {
  return Response.json({ ok: false, error, ...(extra ?? {}) }, { status });
}

/** Standard JSON success envelope. */
export function botOk(data: Record<string, unknown>, status = 200): Response {
  return Response.json({ ok: true, ...data }, { status });
}

/**
 * Authenticate + rate-limit a bot request. On success returns { bot }. On
 * failure returns a ready-to-return Response (401 or 429). Callers branch:
 *
 *   const guard = await guardBot(req, { scope: "items" });
 *   if (guard instanceof Response) return guard;
 *   const { bot } = guard;
 */
export async function guardBot(
  req: Request,
  opts: { scope: string; max?: number; windowMs?: number } = { scope: "v1" },
): Promise<BotContext | Response> {
  const bot = await authBot(req);
  if (!bot) return botError(401, "Unauthorized");

  const rl = rateLimit(
    `bot:${opts.scope}:${bot}`,
    opts.max ?? DEFAULT_MAX,
    opts.windowMs ?? DEFAULT_WINDOW_MS,
  );
  if (!rl.ok) {
    return botError(429, "rate limited", {
      retryAfterMs: rl.retryAfterMs,
      retryAfterSeconds: Math.ceil(rl.retryAfterMs / 1000),
    });
  }

  return { bot };
}
