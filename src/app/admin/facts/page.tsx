import { redirect } from "next/navigation";
import { getSession, isAdmin, isLead, userLabel } from "@/lib/auth";
import { listActiveBrands } from "@/lib/brands-db";
import { logout } from "@/app/actions";
import { NavBar } from "@/components/NavBar";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { FactsPanel } from "@/components/admin/FactsPanel";
import { SlaGridChip } from "@/components/SlaGridChip";
import { factsConfigured, readFactsFromGitHub, type FactsMap } from "@/lib/facts-repo";

export const dynamic = "force-dynamic";

// /admin/facts - dashboard view + editor for data/facts.json, the shared
// single-source-of-truth values substituted into every paper via
// scripts/apply-facts.mjs. Saving here commits straight to main (via the
// GitHub Contents API, see src/lib/facts-repo.ts) so the normal Vercel
// build regenerates public/ from templates/ within the usual deploy
// window - same effect as an editor hand-editing facts.json + running
// npm run facts:apply. See docs/shared-facts.md.

export default async function FactsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const userIsAdmin = await isAdmin(user);
  if (!isLead(user) && !userIsAdmin) redirect("/?not-allowed=facts");

  const navBrands = await listActiveBrands();
  const userLabelStr = userLabel(user);
  const configured = factsConfigured();

  let facts: FactsMap | null = null;
  let loadError: string | null = null;
  if (configured) {
    try {
      const result = await readFactsFromGitHub();
      facts = result.facts;
    } catch (err) {
      loadError = err instanceof Error ? err.message : "Couldn't load facts.json";
    }
  }

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#0a0f1f] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.16),transparent_55%)]" />
      <div className="relative max-w-3xl mx-auto py-8 space-y-6">
        <header className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <AdminBackLink />
              <h1 className="text-2xl font-bold mt-1">Shared facts</h1>
              <p className="text-sm text-white/55 mt-1">
                Single source of truth for numbers that repeat across ZAO papers. Saving here
                commits data/facts.json to main - live on every paper within the usual deploy window.
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

        {!configured ? (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
            <div className="font-semibold mb-1">GITHUB_FACTS_TOKEN not set</div>
            <div className="text-xs text-amber-100/85">
              Editing is disabled until a GitHub personal access token with write access to{" "}
              <code className="text-amber-300">{process.env.GITHUB_REPO || "ZAODEVZ/ZAOcowork"}</code> is
              set as GITHUB_FACTS_TOKEN. Generate a fine-grained token at github.com/settings/tokens
              (Contents: Read and write, scoped to this repo), add it in the Vercel project's
              environment variables, then redeploy. See .env.example for details. In the meantime,
              edit data/facts.json directly and run npm run facts:apply.
            </div>
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            <div className="font-semibold mb-1">Couldn&apos;t load facts.json</div>
            <div className="text-xs text-red-100/85">{loadError}</div>
          </div>
        ) : (
          <FactsPanel facts={facts!} />
        )}
      </div>
      <SlaGridChip />
    </main>
  );
}
