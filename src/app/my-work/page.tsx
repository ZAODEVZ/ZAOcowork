import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, isAdmin, isLead, userLabel } from "@/lib/auth";
import { listActiveBrands } from "@/lib/brands-db";
import { getActions, ageDays, relativeTime, type ActionItem } from "@/lib/data";
import { matchMentions } from "@/lib/mentions";
import { logout } from "@/app/actions";
import { NavBar } from "@/components/NavBar";

export const dynamic = "force-dynamic";

const PRIORITY_DOT: Record<string, string> = {
  P1: "bg-red-500",
  P2: "bg-amber-500",
  P3: "bg-emerald-500",
};
const STATUS_BADGE: Record<string, string> = {
  TRIAGE: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  TODO: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  WIP: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  BLOCKED: "bg-red-500/15 text-red-300 border-red-500/30",
  DONE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};
const STATUS_RANK: Record<string, number> = { BLOCKED: 0, WIP: 1, TODO: 2, TRIAGE: 3, DONE: 4 };
const PRIORITY_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2 };

function TaskRow({ it }: { it: ActionItem }) {
  const overdue = it.due && it.status !== "DONE" && new Date(it.due) < new Date();
  return (
    <Link
      href={`/todo/${encodeURIComponent(it.id)}`}
      prefetch={false}
      className="flex items-center gap-3 rounded-xl px-2.5 py-2 -mx-1 hover:bg-white/[0.05] transition"
    >
      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[it.priority] ?? "bg-white/30"}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white/85 truncate">{it.title}</div>
        <div className="text-[11px] text-white/40 truncate">
          <span className="text-white/55">#{it.id}</span> · {it.category} · {ageDays(it.createdAt)}d old
          {it.due ? (
            <span className={overdue ? "text-red-300" : "text-white/40"}> · due {it.due}</span>
          ) : null}
        </div>
      </div>
      <span
        className={`text-[10px] px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${STATUS_BADGE[it.status] ?? ""}`}
      >
        {it.status}
      </span>
    </Link>
  );
}

function Section({
  title,
  count,
  accent,
  children,
}: {
  title: string;
  count: number;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-5">
      <div className="mb-3 flex items-baseline gap-2">
        <span className={`h-2 w-2 rounded-full ${accent}`} />
        <h2 className="text-sm font-semibold text-white/85">{title}</h2>
        <span className="text-xs text-white/35">{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-xs text-white/30 italic py-2">Nothing here right now.</p>
      ) : (
        children
      )}
    </div>
  );
}

export default async function MyWorkPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const lead = isLead(user);
  const [doc, navBrands] = await Promise.all([getActions(), listActiveBrands()]);
  const items = doc.items.filter((x) => !x.archivedAt);

  const me = user.toLowerCase();
  const aliases = [userLabel(user), user];

  // Assigned to me (open), sorted by status then priority then age.
  const assigned = items
    .filter((it) => {
      if (it.status === "DONE") return false;
      const o = String(it.owner).toLowerCase();
      return o === me || o === "both";
    })
    .sort((a, b) => {
      const s = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
      if (s !== 0) return s;
      const p = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
      if (p !== 0) return p;
      return ageDays(b.createdAt) - ageDays(a.createdAt);
    });

  // Open to claim.
  const claimable = items.filter(
    (it) => it.status !== "DONE" && (it.claimable || String(it.owner).toLowerCase() === "open"),
  );

  // Comments that @mention me (not my own), newest first.
  const mentions: Array<{ it: ActionItem; who: string; content: string; at: string }> = [];
  for (const it of items) {
    for (const c of it.comments ?? []) {
      if (!c.content || (c.userId ?? "").toLowerCase() === me) continue;
      if (matchMentions(c.content, [{ key: "me", aliases }]).length === 0) continue;
      mentions.push({ it, who: c.displayName || c.userId || "?", content: c.content, at: c.createdAt });
    }
  }
  mentions.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const recentMentions = mentions.slice(0, 20);

  // Pending reviews (leads only).
  const pending: Array<{ it: ActionItem; who: string; at: string }> = [];
  if (lead) {
    for (const it of items) {
      for (const u of it.updates ?? []) {
        if (u.reviewStatus === "pending") {
          pending.push({ it, who: u.displayName || u.submittedBy || "?", at: u.createdAt });
        }
      }
    }
    pending.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }

  const open = doc.items.filter((x) => x.status !== "DONE").length;
  const blocked = doc.items.filter((x) => x.status === "BLOCKED").length;
  const aging = doc.items.filter((x) => x.status !== "DONE" && ageDays(x.createdAt) > 14).length;
  const userLabelStr = userLabel(user);

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#0a0a1f] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.14),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(59,130,246,0.10),transparent_60%)]" />
      <div className="relative max-w-3xl mx-auto py-6 space-y-4">
        <header className="flex flex-col gap-3 rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">My Work</h1>
              <p className="text-white/50 text-xs md:text-sm">
                {userLabelStr} · {open} open · {blocked} blocked · {aging} aging board-wide
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs rounded-lg border border-white/10 px-2.5 py-1.5 text-white/70">
                {userLabelStr}
              </span>
              <form action={logout}>
                <button className="text-xs rounded-lg border border-white/10 px-2.5 py-1.5 hover:bg-white/5 text-white/70">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <NavBar isAdmin={await isAdmin(user)} isLead={lead} brands={navBrands} />
        </header>

        <Section title="Assigned to me" count={assigned.length} accent="bg-violet-400">
          <div className="space-y-0.5">{assigned.map((it) => <TaskRow key={it.id} it={it} />)}</div>
        </Section>

        {lead && (
          <Section title="Pending your review" count={pending.length} accent="bg-amber-400">
            <ul className="space-y-1">
              {pending.map((p, i) => (
                <li key={`${p.it.id}-${i}`}>
                  <Link
                    href={`/todo/${encodeURIComponent(p.it.id)}`}
                    prefetch={false}
                    className="block rounded-xl px-2.5 py-2 -mx-1 hover:bg-white/[0.05] transition"
                  >
                    <div className="text-sm text-white/85 truncate">{p.it.title}</div>
                    <div className="text-[11px] text-white/40">
                      <span className="text-white/55">#{p.it.id}</span> · {p.who} submitted · {relativeTime(p.at)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Your @mentions" count={recentMentions.length} accent="bg-sky-400">
          <ul className="space-y-1">
            {recentMentions.map((m, i) => (
              <li key={`${m.it.id}-${i}`}>
                <Link
                  href={`/todo/${encodeURIComponent(m.it.id)}`}
                  prefetch={false}
                  className="block rounded-xl px-2.5 py-2 -mx-1 hover:bg-white/[0.05] transition"
                >
                  <div className="text-[11px] text-white/40">
                    <span className="text-white/70 font-medium">{m.who}</span> on{" "}
                    <span className="text-white/55">#{m.it.id}</span> · {relativeTime(m.at)}
                  </div>
                  <div className="text-sm text-white/80 line-clamp-2 whitespace-pre-wrap break-words">
                    {m.content}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Open to claim" count={claimable.length} accent="bg-emerald-400">
          <div className="space-y-0.5">{claimable.map((it) => <TaskRow key={it.id} it={it} />)}</div>
        </Section>
      </div>
    </main>
  );
}
