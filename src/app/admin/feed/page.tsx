import { redirect } from "next/navigation";
import { getSession, isAdmin, isLead, userLabel } from "@/lib/auth";
import { listActiveBrands } from "@/lib/brands-db";
import { listAuditLogs, listAuditActors, type AuditEntityType } from "@/lib/audit";
import { logout } from "@/app/actions";
import { NavBar } from "@/components/NavBar";
import { ActivityFeed } from "@/components/admin/ActivityFeed";
import { SlaGridChip } from "@/components/SlaGridChip";

export const dynamic = "force-dynamic";

const FEED_PAGE_SIZE = 80;

function parseEntity(v: string | undefined): AuditEntityType | undefined {
  if (v === "task" || v === "user" || v === "brand" || v === "system") return v;
  return undefined;
}

// /admin/feed - workspace-wide activity feed (doc 764 F2).
//
// Different from /admin (audit log panel) in two ways:
// 1. The feed lives on its own URL so it's the "9am check what happened
//    overnight" page rather than buried inside admin.
// 2. Larger page size + grouping by day so scanning is fast.
//
// Per the Stream.io 2026 distinction: this is the activity feed (calm,
// browsable). In-app notifications (urgent, action-required) stay where
// they are - the bell + per-task review queue. Don't conflate the two.
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; actor?: string; page?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  // Audit doc 766 finding #2: previously this route had only session
  // gate, so workers could view all audit_logs incl. admin actions.
  // Restrict to lead + admin per the original doc 765 design.
  const userIsAdmin = await isAdmin(user);
  if (!isLead(user) && !userIsAdmin) redirect("/?not-allowed=feed");

  const sp = await searchParams;
  const entity = parseEntity(sp.entity);
  const actor = sp.actor ? sp.actor.trim() : null;
  const pageRaw = Number(sp.page ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const [navBrands, feed, actors] = await Promise.all([
    listActiveBrands(),
    listAuditLogs({
      limit: FEED_PAGE_SIZE,
      offset: (page - 1) * FEED_PAGE_SIZE,
      entity_type: entity,
      actor: actor ?? undefined,
    }),
    listAuditActors().catch(() => [] as string[]),
  ]);

  const userLabelStr = userLabel(user);

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#0a0f1f] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.16),transparent_55%)]" />
      <div className="relative max-w-5xl mx-auto py-8 space-y-6">
        <header className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">Activity feed</h1>
              <p className="text-sm text-white/55 mt-1">
                Everything that happened across the workspace, newest first. Read this once a day instead of chasing pings.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-white/15 bg-white/[0.04] text-xs px-3 py-1 text-white/75">
                {userLabelStr}
              </span>
              <form action={logout}>
                <button className="text-xs rounded-lg border border-white/10 px-2.5 py-1.5 hover:bg-white/5 text-white/70">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <NavBar isAdmin={userIsAdmin} brands={navBrands} />
        </header>

        <ActivityFeed
          rows={feed.rows}
          total={feed.total}
          available={feed.available}
          page={page}
          pageSize={FEED_PAGE_SIZE}
          entity={entity}
          actor={actor}
          actors={actors}
        />
      </div>
      <SlaGridChip />
    </main>
  );
}
