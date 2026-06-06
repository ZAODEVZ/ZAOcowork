import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, isAdmin, isLead, userLabel } from "@/lib/auth";
import { listActiveBrands } from "@/lib/brands-db";
import { getActions, ageDays, relativeTime } from "@/lib/data";
import { logout } from "@/app/actions";
import { NavBar } from "@/components/NavBar";

export const dynamic = "force-dynamic";

type FeedKind = "comment" | "update";
interface FeedEntry {
  kind: FeedKind;
  taskId: string;
  taskTitle: string;
  author: string;
  authorId: string;
  content: string;
  createdAt: string;
}

const KIND_META: Record<FeedKind, { icon: string; label: string; dot: string }> = {
  comment: { icon: "💬", label: "commented on", dot: "bg-sky-400" },
  update: { icon: "📝", label: "posted an update on", dot: "bg-amber-400" },
};

export default async function ActivityPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const [doc, navBrands] = await Promise.all([getActions(), listActiveBrands()]);

  // Flatten every comment + update across all tasks into one chronological feed
  // so recent comments are findable in one place instead of buried per-task.
  const entries: FeedEntry[] = [];
  for (const it of doc.items) {
    for (const c of it.comments ?? []) {
      entries.push({
        kind: "comment",
        taskId: it.id,
        taskTitle: it.title,
        author: c.displayName || c.userId || "?",
        authorId: c.userId || "",
        content: c.content,
        createdAt: c.createdAt,
      });
    }
    for (const u of it.updates ?? []) {
      if (!u.content) continue;
      entries.push({
        kind: "update",
        taskId: it.id,
        taskTitle: it.title,
        author: u.displayName || u.submittedBy || "?",
        authorId: u.submittedBy || "",
        content: u.content,
        createdAt: u.createdAt,
      });
    }
  }
  entries.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const recent = entries.slice(0, 150);
  const commentCount = entries.filter((e) => e.kind === "comment").length;

  const open = doc.items.filter((x) => x.status !== "DONE").length;
  const blocked = doc.items.filter((x) => x.status === "BLOCKED").length;
  const aging = doc.items.filter(
    (x) => x.status !== "DONE" && ageDays(x.createdAt) > 14,
  ).length;
  const userLabelStr = userLabel(user);

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#03141f] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.14),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(14,165,233,0.10),transparent_60%)]" />
      <div className="relative max-w-4xl mx-auto py-6 space-y-4">
        <header className="flex flex-col gap-3 rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">The Zao Co-Works</h1>
              <p className="text-white/50 text-xs md:text-sm">
                {open} open · {blocked} blocked · {aging} aging
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
          <NavBar isAdmin={await isAdmin(user)} isLead={isLead(user)} brands={navBrands} />
        </header>

        <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span className="text-sm font-semibold text-white/80">Activity</span>
            <span className="text-xs text-white/40">
              — {commentCount} comment{commentCount === 1 ? "" : "s"} + updates across all tasks, newest first
            </span>
          </div>

          {recent.length === 0 ? (
            <p className="text-sm text-white/40 py-8 text-center">
              No comments or updates yet.
            </p>
          ) : (
            <ul className="divide-y divide-white/5">
              {recent.map((e, i) => {
                const meta = KIND_META[e.kind];
                return (
                  <li key={`${e.taskId}-${e.kind}-${i}`}>
                    <Link
                      href={`/todo/${encodeURIComponent(e.taskId)}`}
                      prefetch={false}
                      className="flex gap-3 py-3 px-1 -mx-1 rounded-lg hover:bg-white/[0.04] transition"
                    >
                      <span className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${meta.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-white/45">
                          <span className="text-white/80 font-medium">{e.author}</span>{" "}
                          {meta.icon} {meta.label}{" "}
                          <span className="text-white/70">#{e.taskId}</span>{" "}
                          <span className="text-white/55">— {e.taskTitle}</span>
                          {" · "}
                          {relativeTime(e.createdAt)}
                        </div>
                        <p className="mt-0.5 text-sm text-white/80 whitespace-pre-wrap break-words line-clamp-3">
                          {e.content}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
