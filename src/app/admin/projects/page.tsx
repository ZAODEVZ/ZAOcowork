import { redirect } from "next/navigation";
import { getSession, isAdmin, isLead, userLabel } from "@/lib/auth";
import { listProjects } from "@/lib/projects";
import { listActiveBrands } from "@/lib/brands-db";
import { getActions } from "@/lib/data";
import { logout } from "@/app/actions";
import { NavBar } from "@/components/NavBar";
import { ProjectsPanel } from "@/components/admin/ProjectsPanel";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { migrationPath } from "@/lib/migrations";
import { SlaGridChip } from "@/components/SlaGridChip";

export const dynamic = "force-dynamic";

// /admin/projects - manage time-bounded project containers (doc 765 Phase I).
//
// Lead + admin only. Projects sit between brand (cross-cutting label) and
// task (atomic unit). A project has 5-50 tasks, a target date, a status,
// and an optional default brand. The board project picker filters tasks
// to a single project; nullable project_id means "unparented" rows show
// in the General bucket so existing tasks aren't forced into a project.
export default async function ProjectsAdminPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const userIsAdmin = await isAdmin(user);
  if (!userIsAdmin) redirect("/?not-allowed=projects-admin");

  const [navBrands, projects, doc] = await Promise.all([
    listActiveBrands(),
    listProjects(),
    getActions(),
  ]);

  // Per-project task counts so the admin sees scope at a glance.
  const taskCounts = new Map<string, { total: number; open: number; done: number }>();
  for (const it of doc.items) {
    if (!it.projectId) continue;
    const c = taskCounts.get(it.projectId) ?? { total: 0, open: 0, done: 0 };
    c.total++;
    if (it.status === "DONE") c.done++;
    else if (it.status !== "TRIAGE" && !it.archivedAt) c.open++;
    taskCounts.set(it.projectId, c);
  }
  const unparentedCount = doc.items.filter(
    (it) => !it.projectId && !it.archivedAt && it.status !== "TRIAGE",
  ).length;

  const userLabelStr = userLabel(user);
  const brandNames = navBrands.map((b) => b.name);

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#0a0f1f] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.16),transparent_55%)]" />
      <div className="relative max-w-5xl mx-auto py-8 space-y-6">
        <header className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <AdminBackLink />
              <h1 className="text-2xl font-bold mt-1">Projects</h1>
              <p className="text-sm text-white/55 mt-1">
                Time-bounded containers above tasks. Brand tags stay cross-cutting; projects group
                5-50 tasks toward a specific outcome.
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
          <NavBar isAdmin={userIsAdmin} isLead={isLead(user)} brands={navBrands} />
        </header>

        {!projects.available ? (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
            <div className="font-semibold mb-1">projects table not ready</div>
            <div className="text-xs text-amber-100/85">
              Apply <code className="text-amber-300">{migrationPath("projects_and_source")}</code> in the Supabase SQL editor, then refresh.
            </div>
          </div>
        ) : (
          <ProjectsPanel
            projects={projects.rows}
            taskCounts={taskCounts}
            unparentedCount={unparentedCount}
            brandNames={brandNames}
          />
        )}
      </div>
      <SlaGridChip />
    </main>
  );
}
