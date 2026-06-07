import { NextRequest } from "next/server";
import { authBot } from "@/lib/bot-auth";
import { serviceClient } from "@/lib/supabase-server";

// POST /api/v1/bots/commands/:id/result — a bot (or the fleet-agent) reports the
// outcome of a command it claimed. Bot-token auth; a token may only complete a
// command addressed to its own bot (the "fleet" token may complete any, since it
// executes host lifecycle ops on behalf of the target).
// Body: { status: 'done' | 'error', result?: object }
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const caller = authBot(req);
  if (!caller) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const commandId = Number(id);
  if (!Number.isInteger(commandId)) {
    return Response.json({ ok: false, error: "invalid command id" }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const status = body.status === "error" ? "error" : "done";
  const result = body.result && typeof body.result === "object" ? body.result : {};

  const sc = serviceClient();
  try {
    const { data: cmd, error: readErr } = await sc
      .from("bot_commands")
      .select("id, bot")
      .eq("id", commandId)
      .single();
    if (readErr || !cmd) {
      return Response.json({ ok: false, error: "command not found" }, { status: 404 });
    }
    if (caller !== cmd.bot && caller !== "fleet") {
      return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const { error } = await sc
      .from("bot_commands")
      .update({ status, result, completed_at: new Date().toISOString() })
      .eq("id", commandId);
    if (error) {
      return Response.json({ ok: false, error: error.message }, { status: 503 });
    }
    return Response.json({ ok: true, id: commandId, status });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "result update failed" },
      { status: 500 },
    );
  }
}
