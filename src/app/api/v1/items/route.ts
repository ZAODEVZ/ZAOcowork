import { NextRequest } from "next/server";
import { authBot } from "@/lib/bot-auth";
import {
  getActions,
  saveActions,
  newId,
  normalizeItem,
  TASK_SOURCES,
  type TaskSource,
  type ActionItem,
} from "@/lib/data";
import { readJsonObject, reqString, apiError } from "@/lib/api-validate";

// POST /api/v1/items — create a task (bot fleet). See docs/BOT-API.md.
// Body: { title (required), assignee?, due_date?, notes?, source? } -> { id }
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nowIso() {
  return new Date().toISOString();
}

export async function POST(req: NextRequest) {
  const bot = await authBot(req);
  if (!bot) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  let title: string;
  try {
    body = await readJsonObject(req);
    title = reqString(body.title, "title", 500);
  } catch (e) {
    return apiError(e);
  }

  const assignee = typeof body.assignee === "string" ? body.assignee.trim() : "";
  const source = TASK_SOURCES.includes(body.source as TaskSource)
    ? (body.source as TaskSource)
    : "human-bot";

  const doc = await getActions();
  const id = newId(doc.items);
  const now = nowIso();

  const item: ActionItem = normalizeItem({
    id,
    title,
    owner: assignee || "Open",
    status: "TODO",
    due: typeof body.due_date === "string" ? body.due_date : "",
    notes: typeof body.notes === "string" ? body.notes : "",
    createdBy: bot,
    createdAt: now,
    updatedAt: now,
    source,
    claimable: !assignee,
  });
  item.activity = [
    { id: `a-${Date.now()}`, userId: bot, displayName: bot, action: "created", detail: "via bot API", createdAt: now },
  ];

  doc.items.push(item);
  try {
    await saveActions(doc, bot, `bot ${bot} created #${id}: ${title.slice(0, 40)}`);
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "save failed" },
      { status: 500 },
    );
  }

  // item.id is the DB-assigned number after save (not the optimistic newId).
  return Response.json({ ok: true, id: item.id }, { status: 201 });
}
