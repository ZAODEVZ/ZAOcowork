import { NextRequest } from "next/server";
import { authBot } from "@/lib/bot-auth";
import { getSession } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase-server";

// GET /api/v1/bots/:bot/events — recent activity feed for one bot (newest first,
// up to 50). Readable by a bot Bearer token (machine callers) OR a logged-in team
// session (so a teammate browser can render the detail panel), matching GET /api/v1/bots.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 50;

interface EventRow {
  id: number;
  bot: string;
  kind: string;
  message: string | null;
  meta: Record<string, unknown> | null;
  ts: string;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ bot: string }> }) {
  const isBot = Boolean(authBot(req));
  const session = isBot ? null : await getSession();
  if (!isBot && !session) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { bot } = await ctx.params;
  const botName = bot.toLowerCase();

  try {
    const { data, error } = await serviceClient()
      .from("bot_events")
      .select("id, bot, kind, message, meta, ts")
      .eq("bot", botName)
      .order("ts", { ascending: false })
      .limit(LIMIT);
    if (error) {
      return Response.json(
        { ok: false, error: error.message, hint: "apply supabase/migrations/011_bot_events.sql" },
        { status: 503 },
      );
    }
    return Response.json({ ok: true, bot: botName, events: (data ?? []) as EventRow[] });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "read failed" },
      { status: 500 },
    );
  }
}
