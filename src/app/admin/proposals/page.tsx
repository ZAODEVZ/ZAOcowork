import { redirect } from "next/navigation";
import { getSession, isAdmin, isLead, userLabel } from "@/lib/auth";
import { listActiveBrands } from "@/lib/brands-db";
import { listProposals } from "@/lib/proposals";
import { getActions } from "@/lib/data";
import { logout } from "@/app/actions";
import { NavBar } from "@/components/NavBar";
import { ProposalsPanel } from "@/components/admin/ProposalsPanel";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { migrationPath } from "@/lib/migrations";
import { SlaGridChip } from "@/components/SlaGridChip";

export const dynamic = "force-dynamic";

// /admin/proposals - approval queue for AI / rule-based proposals
// (doc 764 F7). Lead + admin only.
//
// Pattern stolen from moodler/liz-tracker: LLMs and rules can propose
// task mutations (add brand, change owner, flag duplicate, etc) but
// only humans approve them. Every proposal lives in task_proposals with
// status=pending until someone clicks Approve/Reject.

export default async function ProposalsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const userIsAdmin = await isAdmin(user);
  if (!isLead(user) && !userIsAdmin) redirect("/?not-allowed=proposals");

  const [navBrands, proposals, doc] = await Promise.all([
    listActiveBrands(),
    listProposals("pending"),
    getActions(),
  ]);

  // Build a tiny lookup so the UI can show task titles + current state next
  // to each proposal without doing N selects from the client.
  const tasksById = new Map(doc.items.map((it) => [it.id, it]));

  const userLabelStr = userLabel(user);

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#0a0f1f] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.16),transparent_55%)]" />
      <div className="relative max-w-5xl mx-auto py-8 space-y-6">
        <header className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <AdminBackLink />
              <h1 className="text-2xl font-bold mt-1">AI proposals</h1>
              <p className="text-sm text-white/55 mt-1">
                Rule-based + LLM-backed suggestions. Only humans approve - nothing applies until you click.
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

        {!proposals.available ? (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
            <div className="font-semibold mb-1">task_proposals not ready</div>
            <div className="text-xs text-amber-100/85">
              Apply <code className="text-amber-300">{migrationPath("proposals")}</code> in
              the Supabase SQL editor, then refresh.
            </div>
          </div>
        ) : (
          <ProposalsPanel rows={proposals.rows} tasksById={tasksById} />
        )}
      </div>
      <SlaGridChip />
    </main>
  );
}
