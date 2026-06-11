import { NextRequest } from "next/server";
import { authBot } from "@/lib/bot-auth";
import { getSession, isAdmin } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase-server";
import { readJsonObject, optObject, apiError } from "@/lib/api-validate";

// /api/v1/bots/commands — the control-plane command queue (doc 800 Phase 2-4).
//
// POST  enqueue a command       — board, session + isAdmin (RBAC).
// GET   pull pending commands    — bot token. ?bot=<self> for a bot's own queue,
//                                   ?scope=host for the fleet-agent (start|stop).
//
// Pull atomically CLAIMS (pending -> claimed) so two pollers can't double-execute.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What each puller is allowed to claim + execute.
const BOT_SELF_COMMANDS = ["restart", "pause", "resume", "run_task", "ask"] as const;
const HOST_COMMANDS = ["start", "stop"] as const;
const ALL_COMMANDS: string[] = [...BOT_SELF_COMMANDS, ...HOST_COMMANDS];

interface CommandRow {
  id: number;
  bot: string;
  command: string;
  args: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

// ---- GET: a bot (or the fleet-agent) pulls + claims its pending commands -------
export async function GET(req: NextRequest) {
  const caller = await authBot(req);
  if (!caller) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const scope = sp.get("scope");
  const botParam = sp.get("bot");
  const now = new Date().toISOString();
  const sc = serviceClient();

  try {
    if (scope === "host") {
      // Only the fleet-agent (token -> "fleet") may claim host lifecycle ops.
      if (caller !== "fleet") {
        return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      const { data, error } = await sc
        .from("bot_commands")
        .update({ status: "claimed", claimed_at: now })
        .eq("status", "pending")
        .in("command", HOST_COMMANDS as unknown as string[])
        .select("id, bot, command, args, status, created_at");
      if (error) return migrationHint(error.message);
      return Response.json({ ok: true, commands: (data ?? []) as CommandRow[] });
    }

    // Bot-self queue: a token may only pull its own bot's commands.
    const self = (botParam ?? caller).toLowerCase();
    if (self !== caller) {
      return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const { data, error } = await sc
      .from("bot_commands")
      .update({ status: "claimed", claimed_at: now })
      .eq("status", "pending")
      .eq("bot", self)
      .in("command", BOT_SELF_COMMANDS as unknown as string[])
      .select("id, bot, command, args, status, created_at");
    if (error) return migrationHint(error.message);
    return Response.json({ ok: true, commands: (data ?? []) as CommandRow[] });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "pull failed" },
      { status: 500 },
    );
  }
}

// ---- POST: the board enqueues a command (admin only) --------------------------
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(session))) {
    return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  let args: Record<string, unknown>;
  try {
    body = await readJsonObject(req);
    args = optObject(body.args, "args") ?? {};
  } catch (e) {
    return apiError(e);
  }

  const bot = typeof body.bot === "string" ? body.bot.trim().toLowerCase() : "";
  const command = typeof body.command === "string" ? body.command.trim() : "";
  if (!bot) return Response.json({ ok: false, error: "bot is required" }, { status: 400 });
  if (!ALL_COMMANDS.includes(command)) {
    return Response.json(
      { ok: false, error: `command must be one of: ${ALL_COMMANDS.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await serviceClient()
      .from("bot_commands")
      .insert({ bot, command, args, status: "pending", created_by: session })
      .select("id")
      .single();
    if (error) return migrationHint(error.message);
    return Response.json({ ok: true, id: data?.id, bot, command });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "enqueue failed" },
      { status: 500 },
    );
  }
}

function migrationHint(message: string): Response {
  return Response.json(
    { ok: false, error: message, hint: "apply supabase/migrations/012_bot_commands.sql" },
    { status: 503 },
  );
}
