import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, userLabel } from "@/lib/auth";
import { getActions } from "@/lib/data";
import { relativeTime, isAssignedTo, type ActionItem } from "@/lib/types";
import { NavBar } from "@/components/NavBar";

export const dynamic = "force-dynamic";

// The "intern view" - a role-shaped page for whoever is making sure nothing
// falls through the cracks (Iman today).
//
// Why this exists instead of pointing him at /board: the board answers "what
// exists". This page answers "what is about to be dropped". Those are different
// questions, and the second one is the job. Everything here is a THING THAT
// STALLED - it is deliberately empty when the system is healthy.
//
// Ordering is by neglect, not priority: the longest-ignored item is the most
// likely to be quietly lost.

const REPOS = ["bettercallzaal/ZAOOS", "ZAODEVZ/ZAOcowork"];
const STALE_DAYS = 3;
const PR_STALE_HOURS = 48;

interface PullRequest {
  number: number;
  title: string;
  repo: string;
  url: string;
  author: string;
  ageHours: number;
  draft: boolean;
}

/** Open PRs across both repos, oldest first. Degrades to null without a token. */
async function fetchOpenPRs(): Promise<PullRequest[] | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  const out: PullRequest[] = [];
  for (const repo of REPOS) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/pulls?state=open&per_page=100`,
        {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
          next: { revalidate: 120 },
        },
      );
      if (!res.ok) continue;
      const prs = (await res.json()) as Array<{
        number: number; title: string; html_url: string; created_at: string;
        draft: boolean; user?: { login?: string };
      }>;
      for (const p of prs) {
        out.push({
          number: p.number,
          title: p.title,
          repo: repo.split("/")[1],
          url: p.html_url,
          author: p.user?.login ?? "unknown",
          ageHours: Math.floor((Date.now() - new Date(p.created_at).getTime()) / 3600000),
          draft: p.draft,
        });
      }
    } catch {
      // A GitHub hiccup should not blank the whole page - the task lanes below
      // are the more important half.
      continue;
    }
  }
  return out.sort((a, b) => b.ageHours - a.ageHours);
}

function daysSince(iso: string | undefined): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function Lane({
  title, hint, count, children,
}: {
  title: string; hint: string; count: number; children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-1 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <span
          className={
            count === 0
              ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300"
              : "rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300"
          }
        >
          {count}
        </span>
      </div>
      <p className="mb-3 text-sm text-white/40">{hint}</p>
      {count === 0 ? (
        <p className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-white/30">
          Nothing here. That is the goal.
        </p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </section>
  );
}

function TaskRow({ it, meta }: { it: ActionItem; meta: string }) {
  return (
    <Link
      href={`/board?focus=${encodeURIComponent(it.id)}`}
      className="block rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:bg-white/[0.06]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm text-white">{it.title}</span>
        <span className="shrink-0 text-xs text-white/35">{meta}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/35">
        <span>{it.status}</span>
        {it.owner ? <span>owner: {String(it.owner)}</span> : null}
        {it.priority ? <span>{it.priority}</span> : null}
      </div>
    </Link>
  );
}

export default async function InternPage() {
  const session = await getSession();
  if (!session) redirect("/login?from=/intern");

  const [doc, prs] = await Promise.all([getActions(), fetchOpenPRs()]);
  const items: ActionItem[] = doc.items ?? [];
  const open = items.filter((i) => i.status !== "DONE");

  // Lane 1: PRs sitting unreviewed. The backlog that hit 70 open PRs.
  const stalePRs = (prs ?? []).filter((p) => !p.draft && p.ageHours >= PR_STALE_HOURS);

  // Lane 2: agent output waiting on a human verdict.
  const needsApproval = open.filter((i) => i.requiresApproval || i.nextOwner === "review");

  // Lane 3: dropped ideas - captured, never triaged, and gone quiet.
  const droppedIdeas = open
    .filter((i) => i.status === "TRIAGE" && daysSince(i.updatedAt || i.createdAt) >= STALE_DAYS)
    .sort((a, b) => daysSince(b.updatedAt || b.createdAt) - daysSince(a.updatedAt || a.createdAt));

  // Lane 4: started and then abandoned - the most expensive kind of stall.
  const stalled = open
    .filter(
      (i) =>
        (i.status === "WIP" || i.status === "BLOCKED") &&
        daysSince(i.updatedAt || i.createdAt) >= STALE_DAYS,
    )
    .sort((a, b) => daysSince(b.updatedAt || b.createdAt) - daysSince(a.updatedAt || a.createdAt));

  // Lane 5: promised by a date that has passed.
  const overdue = open
    .filter((i) => i.due && new Date(i.due) < new Date())
    .sort((a, b) => (a.due < b.due ? -1 : 1));

  // Lane 6: his own queue, last - the point of this page is the system, not self.
  const mine = open.filter((i) => isAssignedTo(i, session));

  const totalAttention =
    stalePRs.length + needsApproval.length + droppedIdeas.length + stalled.length + overdue.length;

  return (
    <div className="min-h-screen bg-[#0a1628] text-white">
      <NavBar />
      <main className="mx-auto max-w-3xl px-5 py-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-[#f5a623]">Intern view</h1>
          <p className="mt-1 text-sm text-white/50">
            {userLabel(session)} - everything at risk of being dropped, oldest first.{" "}
            {totalAttention === 0 ? (
              <span className="text-emerald-300">Nothing needs you right now.</span>
            ) : (
              <span className="text-amber-300">{totalAttention} items need attention.</span>
            )}
          </p>
        </header>

        <Lane
          title="PRs waiting on review"
          hint={`Open more than ${PR_STALE_HOURS}h. Give each a verdict: safe-to-merge, needs-changes, or hold.`}
          count={stalePRs.length}
        >
          {stalePRs.map((p) => (
            <a
              key={`${p.repo}-${p.number}`}
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:bg-white/[0.06]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm text-white">
                  <span className="text-white/40">{p.repo} #{p.number}</span> {p.title}
                </span>
                <span className="shrink-0 text-xs text-amber-300">
                  {Math.floor(p.ageHours / 24)}d
                </span>
              </div>
              <div className="mt-1 text-xs text-white/35">by {p.author}</div>
            </a>
          ))}
        </Lane>

        {prs === null ? (
          <p className="-mt-4 mb-8 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-xs text-white/40">
            GITHUB_TOKEN is not set, so PRs cannot be listed here. Everything below still works.
          </p>
        ) : null}

        <Lane
          title="Waiting on a verdict"
          hint="Agent output or submissions that need a human to approve or reject."
          count={needsApproval.length}
        >
          {needsApproval.map((i) => (
            <TaskRow key={i.id} it={i} meta={relativeTime(i.updatedAt || i.createdAt)} />
          ))}
        </Lane>

        <Lane
          title="Dropped ideas"
          hint={`Captured, never triaged, quiet for ${STALE_DAYS}+ days. Route it or kill it.`}
          count={droppedIdeas.length}
        >
          {droppedIdeas.map((i) => (
            <TaskRow key={i.id} it={i} meta={`${daysSince(i.updatedAt || i.createdAt)}d quiet`} />
          ))}
        </Lane>

        <Lane
          title="Stalled"
          hint={`Started, then went quiet for ${STALE_DAYS}+ days. Unblock, reassign, or close.`}
          count={stalled.length}
        >
          {stalled.map((i) => (
            <TaskRow key={i.id} it={i} meta={`${daysSince(i.updatedAt || i.createdAt)}d quiet`} />
          ))}
        </Lane>

        <Lane
          title="Overdue"
          hint="Past its due date and not done. Move the date or move the task."
          count={overdue.length}
        >
          {overdue.map((i) => (
            <TaskRow key={i.id} it={i} meta={`due ${i.due}`} />
          ))}
        </Lane>

        <Lane title="Your own queue" hint="Assigned to you." count={mine.length}>
          {mine.slice(0, 15).map((i) => (
            <TaskRow key={i.id} it={i} meta={i.due ? `due ${i.due}` : relativeTime(i.createdAt)} />
          ))}
        </Lane>

        <footer className="mt-10 border-t border-white/10 pt-4 text-xs text-white/30">
          Ordered by neglect, not priority - the longest-ignored item is the one most likely to be
          quietly lost. Full board at{" "}
          <Link href="/board" className="text-[#f5a623] hover:underline">
            /board
          </Link>
          .
        </footer>
      </main>
    </div>
  );
}
