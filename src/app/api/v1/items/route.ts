import { NextRequest } from "next/server";
import { guardBot, botError, botOk } from "@/lib/bot-route";
import {
  queryItems,
  insertItem,
  normalizeItem,
  TASK_SOURCES,
  type TaskSource,
  type ActionItem,
} from "@/lib/data";
import { isAgentSource } from "@/lib/types";
import { checkAgentIntake } from "@/lib/agent-intake";
import { readJsonObject, reqString, apiError } from "@/lib/api-validate";

// /api/v1/items — bot fleet task surface. See docs/BOT-API.md.
//   GET  list tasks (filterable) -> { tasks: [...] }
//   POST create a task           -> { id }
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/items?status=&assignee=&q=&limit= — read the board.
// Returns a compact task shape so agents can reason over the work list.
export async function GET(req: NextRequest) {
  const guard = await guardBot(req, { scope: "items-read", max: 120 });
  if (guard instanceof Response) return guard;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status")?.trim().toUpperCase() || "";
  const assignee = sp.get("assignee")?.trim().toLowerCase() || "";
  const q = sp.get("q")?.trim().toLowerCase() || "";
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 100, 1), 500);

  // status/q/archived/TRIAGE are pushed into SQL. assignee cannot be - it
  // lives in the metadata jsonb - so it stays a JS filter, and that is
  // exactly why `exact` (which lets Postgres apply the LIMIT) is only set
  // when no assignee filter follows.
  let filtered: ActionItem[];
  try {
    filtered = await queryItems({
      status,
      q,
      limit,
      exact: !assignee,
      excludeTriage: true,
    });
  } catch (err) {
    return botError(500, err instanceof Error ? err.message : "read failed");
  }

  if (assignee) {
    filtered = filtered.filter(
      (it) =>
        (it.assignees ?? []).includes(assignee) ||
        String(it.owner ?? "").toLowerCase() === assignee,
    );
  }

  const tasks = filtered.slice(0, limit).map((it) => ({
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
  }));

  return botOk({ count: tasks.length, tasks });
}

function nowIso() {
  return new Date().toISOString();
}

export async function POST(req: NextRequest) {
  const guard = await guardBot(req, { scope: "items" });
  if (guard instanceof Response) return guard;
  const { bot } = guard;

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
  const notes = typeof body.notes === "string" ? body.notes : "";

  // Doc 2193: agent writers are gated here. A human at the QuickAdd box gets
  // dismissable warnings (task-quality.ts); an agent gets a refusal, because
  // there is nobody at the screen to read a warning. Measured before this
  // shipped: 93 of 93 open escalator rows had no body, 35 were near-dupes of
  // each other, and 1 of 94 had ever been completed.
  if (isAgentSource(source)) {
    let open: ActionItem[];
    try {
      open = await queryItems({ status: "", q: "", limit: 500, exact: true, excludeTriage: false });
    } catch (err) {
      return botError(500, err instanceof Error ? err.message : "dedup read failed");
    }
    const rejection = checkAgentIntake(
      { title, notes, source },
      open.map((it) => ({ id: it.id, title: it.title })),
    );
    if (rejection) {
      // 409 for a collision with existing work, 422 for a task that is not
      // well-formed enough to act on. Both are permanent for this payload -
      // the caller must change something, so neither should be retried as-is.
      return botError(rejection.code === "duplicate" ? 409 : 422, rejection.message, {
        code: rejection.code,
        ...(rejection.relatedIds ? { related_ids: rejection.relatedIds } : {}),
      });
    }
  }

  const now = nowIso();

  // No board read here. This used to call getActions() purely to compute a
  // newId; insertItem sets legacy_id NULL and lets the DB trigger assign the
  // id, which is both one INSERT instead of a full read+write and race-free.
  const item: ActionItem = normalizeItem({
    id: "",
    title,
    owner: assignee || "Open",
    status: "TODO",
    due: typeof body.due_date === "string" ? body.due_date : "",
    notes,
    createdBy: bot,
    createdAt: now,
    updatedAt: now,
    source,
    claimable: !assignee,
  });
  item.activity = [
    { id: `a-${Date.now()}`, userId: bot, displayName: bot, action: "created", detail: "via bot API", createdAt: now },
  ];

  let created: ActionItem;
  try {
    created = await insertItem(item);
  } catch (err) {
    return botError(500, err instanceof Error ? err.message : "save failed");
  }

  // created.id is the DB-assigned number, read back from the INSERT.
  return botOk({ id: created.id }, 201);
}
