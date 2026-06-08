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

  // Count a mention from either a comment or an update body (people @mention in
  // both), excluding the user's own posts. Kept in sync with the My Work and
  // Activity "My mentions" views so the badge number matches what's listed.
  const tally = (content: string, authorId: string, createdAt: string) => {
    if (!content) return;
    if ((authorId ?? "").toLowerCase() === me) return; // not your own
    if (matchMentions(content, [{ key: "me", aliases }]).length === 0) return;
    total++;
    if (!latestAt || createdAt > latestAt) latestAt = createdAt;
    if (!since || createdAt > since) unread++;
  };

  const doc = await getActions();
  for (const it of doc.items) {
    for (const c of it.comments ?? []) tally(c.content, c.userId ?? "", c.createdAt);
    for (const u of it.updates ?? []) tally(u.content, u.submittedBy ?? "", u.createdAt);
  }

  return Response.json({ total, unread, latestAt });
}
