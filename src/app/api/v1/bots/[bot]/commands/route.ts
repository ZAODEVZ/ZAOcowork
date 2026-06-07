import { NextRequest } from "next/server";
import { authBot } from "@/lib/bot-auth";
import { getSession } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase-server";

// GET /api/v1/bots/:bot/commands — recent command history for one bot (newest
// first, up to 20), so the board can show pending/done state + ask replies.
// Dual auth (bot token OR logged-in session), matching the other board reads.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 20;

interface CommandRow {
  id: number;
  bot: string;
  command: string;
  args: Record<string, unknown> | null;
  status: string;
  result: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
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
      .from("bot_commands")
      .select("id, bot, command, args, status, result, created_by, created_at, completed_at")
      .eq("bot", botName)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (error) {
      return Response.json(
        { ok: false, error: error.message, hint: "apply supabase/migrations/012_bot_commands.sql" },
        { status: 503 },
      );
    }
    return Response.json({ ok: true, bot: botName, commands: (data ?? []) as CommandRow[] });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "read failed" },
      { status: 500 },
    );
  }
}
