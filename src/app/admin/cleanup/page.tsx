import { redirect } from "next/navigation";
import { getSession, isAdmin, isLead } from "@/lib/auth";
import { getActions, ageDays, isStale } from "@/lib/data";
import { listActiveBrands } from "@/lib/brands-db";
import { NavBar } from "@/components/NavBar";
import { CleanupPanel } from "@/components/admin/CleanupPanel";
import { AdminBackLink } from "@/components/admin/AdminBackLink";

export const dynamic = "force-dynamic";

// /admin/cleanup - bulk action surface for tasks the team has neglected
// or wants to close out in batches with a single explanation.
//
// Filters the dataset to 4 buckets the admin can switch between:
//   - stale (no activity 5+ days, active status)
//   - aging (>14d old, active status)
//   - unowned (owner=Open or NULL, active status)
//   - blocked (status=BLOCKED, oldest first)
//
// Per row checkbox + a single "what happened" note field at the bottom
// applies to whichever bulk action button you click (Mark Done, Archive,
// Move to Triage). The note becomes a comment + activity entry on every
// touched task so the historical record explains why.

export default async function CleanupPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!isLead(user) && !(await isAdmin(user))) redirect("/?not-allowed=cleanup");

  const [doc, navBrands] = await Promise.all([
    getActions(),
    listActiveBrands(),
  ]);

  // Pre-bucket on the server so the client gets clean lists. Exclude
  // archived + TRIAGE everywhere - those have their own surfaces.
  const active = doc.items.filter((it) => !it.archivedAt && it.status !== "TRIAGE");
  const buckets = {
    stale: active.filter((it) => isStale(it)),
    aging: active.filter((it) => it.status !== "DONE" && ageDays(it.createdAt) > 14),
    unowned: active.filter((it) => {
      if (it.status === "DONE") return false;
      const o = String(it.owner ?? "").trim();
      return !o || o === "Open";
    }),
    blocked: active.filter((it) => it.status === "BLOCKED"),
  };

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#0a0f1f] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.16),transparent_55%)]" />
      <div className="relative max-w-6xl mx-auto py-8 space-y-6">
        <header className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-5">
          <div className="mb-4">
            <AdminBackLink />
            <h1 className="text-2xl font-bold mt-1">Cleanup</h1>
            <p className="text-sm text-white/55 mt-1">
              Bulk close out aging or stale tasks. Every action takes a one-line note
              that gets logged as a comment on each touched task.
            </p>
          </div>
          <NavBar isAdmin={await isAdmin(user)} isLead={isLead(user)} brands={navBrands} />
        </header>

        <CleanupPanel buckets={buckets} />
      </div>
    </main>
  );
}
