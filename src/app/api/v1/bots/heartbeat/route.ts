import { NextRequest } from "next/server";
import { guardBot } from "@/lib/bot-route";
import { serviceClient } from "@/lib/supabase-server";
import { readJsonObject, optObject, apiError } from "@/lib/api-validate";

// POST /api/v1/bots/heartbeat — a bot reports it's alive. The bot identity comes
// from the bearer token (not the body), so a token can only heartbeat as itself.
// Body: { status?: 'up'|'degraded'|'down', meta?: object }
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = new Set(["up", "degraded", "down"]);

export async function POST(req: NextRequest) {
  // Heartbeats are frequent by design — allow a higher ceiling (120/min).
  const guard = await guardBot(req, { scope: "heartbeat", max: 120 });
  if (guard instanceof Response) return guard;
  const { bot } = guard;

  let body: Record<string, unknown>;
  let meta: Record<string, unknown>;
  try {
    body = await readJsonObject(req); // {} for an empty body — heartbeat may be bodyless
    meta = optObject(body.meta, "meta") ?? {};
  } catch (e) {
    return apiError(e);
  }

  const status = STATUSES.has(String(body.status)) ? String(body.status) : "up";
  const now = new Date().toISOString();

  try {
    const { error } = await serviceClient()
      .from("bot_heartbeats")
      .upsert({ bot, status, ts: now, meta, updated_at: now }, { onConflict: "bot" });
    if (error) {
      // Most likely the table isn't provisioned yet (migration 010).
      return Response.json(
        { ok: false, error: error.message, hint: "apply supabase/migrations/010_bot_heartbeats.sql" },
        { status: 503 },
      );
    }
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "heartbeat failed" },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, bot, status, ts: now });
}
