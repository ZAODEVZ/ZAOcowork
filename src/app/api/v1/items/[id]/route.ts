import { NextRequest } from "next/server";
import { guardBot, botError, botOk } from "@/lib/bot-route";
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

// GET /api/v1/items/:id — read a single task with its comments + activity.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await guardBot(req, { scope: "items-read", max: 120 });
  if (guard instanceof Response) return guard;

  const { id } = await ctx.params;
  const it = await getItem(id);
  if (!it) return botError(404, `no task #${id}`);

  return botOk({
    task: {
      id: it.id,
      title: it.title,
      status: it.status,
      priority: it.priority,
      assignees: it.assignees ?? [],
      owner: it.owner,
      category: it.category,
      due: it.due || null,
      notes: it.notes || "",
      createdAt: it.createdAt,
      updatedAt: it.updatedAt,
      comments: (it.comments ?? []).map((c) => ({
        author: c.displayName,
        content: c.content,
        createdAt: c.createdAt,
      })),
    },
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await guardBot(req, { scope: "items" });
  if (guard instanceof Response) return guard;
  const { bot } = guard;

  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req);
  } catch (e) {
    return apiError(e);
  }

  // Single-row read/write — getItem resolves by legacy_id (#N) or UUID.
  const cur = await getItem(id);
  if (!cur) return botError(404, `no task #${id}`);

  const now = new Date().toISOString();
  const next = { ...cur, updatedAt: now };
  const changes: string[] = [];

  if (body.status !== undefined) {
    const s = normalizeStatus(body.status);
    if (!s) return botError(400, `bad status "${String(body.status)}"`);
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
    return botOk({ id: cur.id, status: cur.status, unchanged: true });
  }

  next.activity = [
    ...(cur.activity || []),
    { id: `a-${Date.now()}`, userId: bot, displayName: bot, action: "updated", detail: `via bot API: ${changes.join(", ")}`, createdAt: now },
  ];
  try {
    await saveItem(next, bot, `bot ${bot} patched #${cur.id}: ${changes.join(", ")}`);
  } catch (err) {
    return botError(500, err instanceof Error ? err.message : "save failed");
  }

  return botOk({ id: cur.id, status: next.status });
}
