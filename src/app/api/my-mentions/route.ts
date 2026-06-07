import { NextRequest } from "next/server";
import { requireSession, userLabel } from "@/lib/auth";
import { getActions } from "@/lib/data";
import { matchMentions } from "@/lib/mentions";

// Lightweight feed for the nav "Activity" badge: how many comments @mention the
// current user, and the newest such timestamp. Pass ?since=<iso> to get the
// count newer than the caller's last-seen marker (the unread count).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let user: string;
  try {
    user = await requireSession();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new URL(req.url).searchParams.get("since") ?? "";
  const aliases = [userLabel(user), user];
  const me = user.toLowerCase();

  let total = 0;
  let unread = 0;
  let latestAt: string | null = null;

  const doc = await getActions();
  for (const it of doc.items) {
    for (const c of it.comments ?? []) {
      if (!c.content) continue;
      if ((c.userId ?? "").toLowerCase() === me) continue; // not your own
      if (matchMentions(c.content, [{ key: "me", aliases }]).length === 0) continue;
      total++;
      if (!latestAt || c.createdAt > latestAt) latestAt = c.createdAt;
      if (since && c.createdAt > since) unread++;
      else if (!since) unread++;
    }
  }

  return Response.json({ total, unread, latestAt });
}
