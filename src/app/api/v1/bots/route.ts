import { NextRequest } from "next/server";
import { authBot } from "@/lib/bot-auth";
import { getSession } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase-server";

// GET /api/v1/bots — status board: latest heartbeat per bot, with a computed
// `online` flag (heartbeat within ONLINE_WINDOW). Readable by either a valid
// bot Bearer token (machine callers) OR a logged-in team session (so a
// teammate's browser can render the board), matching the other board reads.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONLINE_WINDOW_MS = 10 * 60_000; // 10 min

interface HeartbeatRow {
  bot: string;
  status: string;
  ts: string;
  meta: Record<string, unknown> | null;
}

export async function GET(req: NextRequest) {
  // Machine callers present a bot token; browsers present the session cookie.
  const isBot = Boolean(await authBot(req));
  const session = isBot ? null : await getSession();
  if (!isBot && !session) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error } = await serviceClient()
      .from("bot_heartbeats")
      .select("bot, status, ts, meta")
      .order("bot");
    if (error) {
      return Response.json(
        { ok: false, error: error.message, hint: "apply supabase/migrations/010_bot_heartbeats.sql" },
        { status: 503 },
      );
    }
    const now = Date.now();
    // errors per bot in the last 24h (best-effort; empty if bot_events absent)
    const since = new Date(now - 24 * 60 * 60_000).toISOString();
    const errorsByBot = new Map<string, number>();
    try {
      const { data: errRows } = await serviceClient()
        .from("bot_events")
        .select("bot")
        .eq("kind", "error")
        .gte("ts", since);
      for (const e of (errRows ?? []) as { bot: string }[]) {
        errorsByBot.set(e.bot, (errorsByBot.get(e.bot) ?? 0) + 1);
      }
    } catch {
      // bot_events missing/unreadable -> no error counts, board still renders
    }
    const bots = ((data ?? []) as HeartbeatRow[]).map((r) => ({
      ...r,
      // online = posting recently AND not self-reported down. A 'degraded' bot
      // (process up, model auth dead) stays online so it renders amber, not red.
      online: r.status !== "down" && now - new Date(r.ts).getTime() < ONLINE_WINDOW_MS,
      ageSeconds: Math.round((now - new Date(r.ts).getTime()) / 1000),
      errorsToday: errorsByBot.get(r.bot) ?? 0,
    }));
    return Response.json({ ok: true, bots });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "read failed" },
      { status: 500 },
    );
  }
}
