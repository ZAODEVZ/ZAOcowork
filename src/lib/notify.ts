// Server-only notification dispatcher for the web app. Currently handles the
// "new comment" event: posts to the ZAO DEVZ Telegram group, tagging the people
// who should see it. Best-effort throughout — a failure here must never break
// the comment save that triggered it.
//
// Targeting (union, minus the comment's author):
//   - @mentions in the comment text         (suppressed when `silent`)
//   - the task owner
//   - everyone who already commented on the task
//   - all leads / admins
//
// FOLLOW-UP (ZAO OS): the 1-hour "no reaction -> DM the person" escalation
// can't run here (Vercel is serverless: no reaction stream, no delayed jobs).
// It belongs in the ZAO OS repo, which owns the bot's long-running process.
// sendGroupMessage returns the group message_id so that loop can later
// correlate reactions/replies to mark recipients "seen".

import { listTeamMembers, type TeamMember } from "./team";
import { sendGroupMessage, escapeHtml, type TelegramSendResult } from "./telegram";
import { matchMentions } from "./mentions";
import type { ActionItem } from "./types";

function appBaseUrl(): string {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://www.thezao.xyz"
  ).replace(/\/$/, "");
}

/** Render a member as a Telegram tag that actually pings them. */
function tagFor(m: TeamMember): string {
  if (m.telegram_username) return `@${m.telegram_username}`;
  if (m.telegram_id) return `<a href="tg://user?id=${m.telegram_id}">${escapeHtml(m.name)}</a>`;
  return escapeHtml(m.name); // no telegram link -> listed but not pinged
}

interface NotifyCommentArgs {
  item: ActionItem;
  /** login id of the commenter (lowercase, e.g. "zaal") */
  actor: string;
  commentText: string;
  /** when true, do NOT ping the @mentioned people (owner/leads still notified) */
  silent: boolean;
}

export async function notifyComment(args: NotifyCommentArgs): Promise<TelegramSendResult> {
  const { item, actor, commentText, silent } = args;
  const actorKey = actor.toLowerCase();

  let members: TeamMember[];
  try {
    members = (await listTeamMembers()).filter((m) => m.active);
  } catch (err) {
    console.warn("[notify] roster load failed, skipping comment notification", err);
    return { ok: false, error: "roster load failed" };
  }

  const recipients = new Map<string, TeamMember>();
  const add = (m?: TeamMember | null) => {
    if (!m) return;
    const login = (m.legacy_owner ?? m.name).toLowerCase();
    if (login === actorKey) return; // never notify the author
    recipients.set(m.id, m);
  };

  // @mentions (skipped when silent)
  if (!silent) {
    const mentionedKeys = matchMentions(
      commentText,
      members.map((m) => ({
        key: m.id,
        aliases: [m.name, m.legacy_owner, m.telegram_username],
      })),
    );
    const byId = new Map(members.map((m) => [m.id, m]));
    for (const k of mentionedKeys) add(byId.get(k));
  }

  // task owner
  const ownerStr = String(item.owner ?? "").toLowerCase();
  if (ownerStr && ownerStr !== "open" && ownerStr !== "both") {
    add(members.find((m) => (m.legacy_owner ?? m.name).toLowerCase() === ownerStr));
  }

  // prior commenters
  for (const c of item.comments ?? []) {
    const uid = (c.userId ?? "").toLowerCase();
    if (!uid) continue;
    add(members.find((m) => (m.legacy_owner ?? "").toLowerCase() === uid));
  }

  // all leads + admins
  for (const m of members) {
    if (m.role === "lead" || m.role === "admin") add(m);
  }

  if (recipients.size === 0) return { ok: false, error: "no recipients" };

  const list = Array.from(recipients.values());
  const tags = list.map(tagFor).join(" ");
  const excerpt = commentText.length > 240 ? `${commentText.slice(0, 240)}…` : commentText;
  const url = `${appBaseUrl()}/todo/${encodeURIComponent(item.id)}`;
  const actorName = actor.charAt(0).toUpperCase() + actor.slice(1);

  const html = [
    `💬 <b>New comment</b> on <b>#${escapeHtml(item.id)}</b> — ${escapeHtml(item.title)}`,
    `<b>${escapeHtml(actorName)}</b>: ${escapeHtml(excerpt)}`,
    "",
    tags,
    `👉 <a href="${url}">Open task</a>`,
  ].join("\n");

  return sendGroupMessage(html);
}
