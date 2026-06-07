import { NextRequest } from "next/server";
import { authBot } from "@/lib/bot-auth";
import { serviceClient } from "@/lib/supabase-server";

// POST /api/v1/bots/events — a bot reports an activity event. Identity comes from
// the bearer token (not the body), so a token can only post as itself.
// Body: { kind: string, message?: string, meta?: object }
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE = 2000;
const MAX_KIND = 64;

export async function POST(req: NextRequest) {
  const bot = authBot(req);
  if (!bot) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const kind = typeof body.kind === "string" ? body.kind.trim().slice(0, MAX_KIND) : "";
  if (!kind) return Response.json({ ok: false, error: "kind is required" }, { status: 400 });
  const message = typeof body.message === "string" ? body.message.slice(0, MAX_MESSAGE) : null;
  const meta = body.meta && typeof body.meta === "object" ? body.meta : {};
  const ts = new Date().toISOString();

  try {
    const { error } = await serviceClient()
      .from("bot_events")
      .insert({ bot, kind, message, meta, ts });
    if (error) {
      // Most likely the table isn't provisioned yet (migration 011).
      return Response.json(
        { ok: false, error: error.message, hint: "apply supabase/migrations/011_bot_events.sql" },
        { status: 503 },
      );
    }
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "event insert failed" },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, bot, kind, ts });
}
