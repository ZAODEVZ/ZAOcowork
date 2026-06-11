import { NextRequest } from "next/server";
import { authBot } from "@/lib/bot-auth";
import { getItem, saveItem, type ActionStatus } from "@/lib/data";
import { readJsonObject, apiError } from "@/lib/api-validate";

// PATCH /api/v1/items/:id — update a task by its legacy id (the #N). See
// docs/BOT-API.md. Body: { status?, assignee?, due_date?, notes? }
// Bots are trusted infra (bearer), so status changes apply directly (no review
// queue). For closing on PR merge, prefer the existing webhook/auto-close.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_ALIASES: Record<string, ActionStatus> = {
  triage: "TRIAGE",
  todo: "TODO",
  wip: "WIP",
  in_progress: "WIP",
  blocked: "BLOCKED",
  done: "DONE",
};

function normalizeStatus(v: unknown): ActionStatus | null {
  if (typeof v !== "string") return null;
  return STATUS_ALIASES[v.trim().toLowerCase()] ?? null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const bot = await authBot(req);
  if (!bot) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req);
  } catch (e) {
    return apiError(e);
  }

  // Single-row read/write — getItem resolves by legacy_id (#N) or UUID.
  const cur = await getItem(id);
  if (!cur) return Response.json({ ok: false, error: `no task #${id}` }, { status: 404 });

  const now = new Date().toISOString();
  const next = { ...cur, updatedAt: now };
  const changes: string[] = [];

  if (body.status !== undefined) {
    const s = normalizeStatus(body.status);
    if (!s) return Response.json({ ok: false, error: `bad status "${String(body.status)}"` }, { status: 400 });
    if (s !== cur.status) {
      next.status = s;
      if (s === "DONE" && !next.completedAt) {
        next.completedAt = now;
        next.completedBy = bot;
      } else if (s !== "DONE") {
        next.completedAt = "";
        next.completedBy = "";
      }
      changes.push(`${cur.status}→${s}`);
    }
  }
  if (typeof body.assignee === "string") {
    next.owner = body.assignee.trim() || "Open";
    next.claimable = next.owner === "Open";
    changes.push(`owner=${next.owner}`);
  }
  if (typeof body.due_date === "string") {
    next.due = body.due_date;
    changes.push("due");
  }
  if (typeof body.notes === "string") {
    next.notes = body.notes;
    changes.push("notes");
  }

  if (changes.length === 0) {
    return Response.json({ ok: true, id: cur.id, status: cur.status, unchanged: true });
  }

  next.activity = [
    ...(cur.activity || []),
    { id: `a-${Date.now()}`, userId: bot, displayName: bot, action: "updated", detail: `via bot API: ${changes.join(", ")}`, createdAt: now },
  ];
  try {
    await saveItem(next, bot, `bot ${bot} patched #${cur.id}: ${changes.join(", ")}`);
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "save failed" },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, id: cur.id, status: next.status });
}
