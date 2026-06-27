import { NextRequest } from "next/server";
import { guardBot, botError, botOk } from "@/lib/bot-route";
import { getItem, saveItem } from "@/lib/data";
import { readJsonObject, reqString, apiError } from "@/lib/api-validate";

// POST /api/v1/items/:id/comments — a bot leaves a comment on a task.
// Body: { content (required) }. Identity comes from the bearer token.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await guardBot(req, { scope: "comments" });
  if (guard instanceof Response) return guard;
  const { bot } = guard;

  const { id } = await ctx.params;
  let content: string;
  try {
    const body = await readJsonObject(req);
    content = reqString(body.content, "content", 4000);
  } catch (e) {
    return apiError(e);
  }

  const cur = await getItem(id);
  if (!cur) return botError(404, `no task #${id}`);

  const now = new Date().toISOString();
  const comment = {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId: bot,
    displayName: bot,
    content,
    createdAt: now,
  };
  const next = {
    ...cur,
    updatedAt: now,
    comments: [...(cur.comments ?? []), comment],
    activity: [
      ...(cur.activity ?? []),
      { id: `a-${Date.now()}`, userId: bot, displayName: bot, action: "commented", detail: content.slice(0, 60), createdAt: now },
    ],
  };

  try {
    await saveItem(next, bot, `bot ${bot} commented on #${cur.id}`);
  } catch (err) {
    return botError(500, err instanceof Error ? err.message : "save failed");
  }

  return botOk({ id: cur.id, commentId: comment.id }, 201);
}
