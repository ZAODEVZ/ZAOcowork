import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getSession } from "@/lib/auth";
import { getActions, ageDays, type ActionItem } from "@/lib/data";
import { isAssignedTo } from "@/lib/types";
import { listTeamMembers, type TeamMember } from "@/lib/team";
import { matchMentions } from "@/lib/mentions";

// /api/my-digest — per-person digest (their open tasks + @mentions + pending
// reviews). Cron-friendly like /api/digest:
//   - Bearer DIGEST_CRON_TOKEN: build for everyone; ?send=1 emails each member
//     who has an `email` (via Resend, if RESEND_API_KEY is set).
//   - Session cookie: preview your OWN digest as JSON (no send).
//
// It never throws on a single member; top-level DB errors propagate as 500.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PersonalDigest {
  member: string;
  email: string | null;
  assigned: Array<{ id: string; title: string; status: string; priority: string; age: number; due: string }>;
  mentions: Array<{ id: string; title: string; by: string; at: string }>;
  pendingReviews: number;
}

function buildFor(member: TeamMember, items: ActionItem[]): PersonalDigest {
  const me = (member.legacy_owner ?? member.name).toLowerCase();
  const aliases = [member.name, member.legacy_owner];

  const assigned = items
    .filter((it) => {
      if (it.status === "DONE" || it.archivedAt) return false;
      return isAssignedTo(it, me);
    })
    .sort((a, b) => ageDays(b.createdAt) - ageDays(a.createdAt))
    .map((it) => ({
      id: it.id,
      title: it.title,
      status: it.status,
      priority: it.priority,
      age: ageDays(it.createdAt),
      due: it.due || "",
    }));

  const mentions: PersonalDigest["mentions"] = [];
  for (const it of items) {
    for (const c of it.comments ?? []) {
      if (!c.content || (c.userId ?? "").toLowerCase() === me) continue;
      if (matchMentions(c.content, [{ key: "me", aliases }]).length === 0) continue;
      mentions.push({ id: it.id, title: it.title, by: c.displayName || c.userId || "?", at: c.createdAt });
    }
  }
  mentions.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  let pendingReviews = 0;
  if (member.role === "lead" || member.role === "admin") {
    for (const it of items) {
      for (const u of it.updates ?? []) if (u.reviewStatus === "pending") pendingReviews++;
    }
  }

  return { member: member.name, email: member.email, assigned, mentions: mentions.slice(0, 10), pendingReviews };
}

function isEmpty(d: PersonalDigest): boolean {
  return d.assigned.length === 0 && d.mentions.length === 0 && d.pendingReviews === 0;
}

function toHtml(d: PersonalDigest, base: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const link = (id: string, label: string) => `<a href="${base}/todo/${encodeURIComponent(id)}">${esc(label)}</a>`;
  const parts: string[] = [`<h2>Your Co-Works digest — ${esc(d.member)}</h2>`];
  parts.push(`<p><b>${d.assigned.length}</b> open · <b>${d.mentions.length}</b> recent mentions${d.pendingReviews ? ` · <b>${d.pendingReviews}</b> awaiting your review` : ""}</p>`);
  if (d.assigned.length) {
    parts.push("<h3>Your open tasks</h3><ul>");
    for (const t of d.assigned.slice(0, 15)) {
      parts.push(`<li>[${esc(t.status)}] ${link(t.id, `#${t.id} ${t.title}`)} — ${t.priority}, ${t.age}d old${t.due ? `, due ${esc(t.due)}` : ""}</li>`);
    }
    parts.push("</ul>");
  }
  if (d.mentions.length) {
    parts.push("<h3>You were mentioned</h3><ul>");
    for (const m of d.mentions) parts.push(`<li>${esc(m.by)} on ${link(m.id, `#${m.id} ${m.title}`)}</li>`);
    parts.push("</ul>");
  }
  return parts.join("\n");
}

function bearerOk(req: NextRequest): boolean {
  const token = process.env.DIGEST_CRON_TOKEN;
  if (!token) return false;
  const auth = req.headers.get("authorization") ?? "";
  const a = Buffer.from(auth);
  const b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const wantSend = url.searchParams.get("send") === "1";
  const cron = bearerOk(req);

  let sessionUser: string | null = null;
  if (!cron) {
    sessionUser = await getSession();
    if (!sessionUser) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (wantSend) return Response.json({ ok: false, error: "send requires Bearer DIGEST_CRON_TOKEN" }, { status: 401 });
  }

  const [doc, members] = await Promise.all([getActions(), listTeamMembers()]);
  const active = members.filter((m) => m.active);

  // Session preview: just your own digest. Cron: everyone.
  const targets = cron
    ? active
    : active.filter((m) => (m.legacy_owner ?? m.name).toLowerCase() === sessionUser);

  const digests = targets.map((m) => buildFor(m, doc.items)).filter((d) => !isEmpty(d));

  if (!wantSend) {
    return Response.json({ ok: true, digests });
  }

  // Send path (cron only). Email each digest to the member's address via Resend.
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_FROM_ADDRESS ?? "ZAOcowork <noreply@thezao.xyz>";
  const base = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.thezao.xyz").replace(/\/$/, "");
  if (!resendKey) {
    return Response.json({ ok: true, sent: false, reason: "RESEND_API_KEY not set", wouldSend: digests.map((d) => ({ member: d.member, email: d.email })) });
  }

  const results: Array<{ member: string; sent: boolean; error?: string }> = [];
  for (const d of digests) {
    if (!d.email) {
      results.push({ member: d.member, sent: false, error: "no email" });
      continue;
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [d.email],
          subject: `Your Co-Works digest — ${d.assigned.length} open${d.mentions.length ? `, ${d.mentions.length} mentions` : ""}`,
          html: toHtml(d, base),
        }),
      });
      results.push({ member: d.member, sent: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` });
    } catch (err) {
      results.push({ member: d.member, sent: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return Response.json({ ok: true, sent: true, results });
}
