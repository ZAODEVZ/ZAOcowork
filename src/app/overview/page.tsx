import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NavBar } from "@/components/NavBar";
import { AttentionStrip } from "@/components/overview/AttentionStrip";
import { VaultStatusWidget } from "@/components/home/VaultStatusWidget";
import { BoardSummary } from "@/components/home/BoardSummary";
import { DirectoryWidget } from "@/components/overview/DirectoryWidget";

export const dynamic = "force-dynamic";

// REDESIGNED 2026-09-20. This page used to stack 11 widgets (tool-reference
// cheatsheet, goals, task status, cycle time, deadlines, repos, surfaces,
// terminals, an "AI front door" block, plus this and the directory) on one
// screen. Removed entirely: HowIUseMyToolsWidget (a command reference, not
// a daily-use status - it belongs in docs, not the homepage), AIFrontDoor,
// TerminalsWidget, CycleTimeWidget, SurfacesWidget, GoalsWidget. What's
// left is three things: what changed today (from the vault), what needs
// you right now (unchanged - AttentionStrip was already doing this job
// well), and a compact board summary that links out to /board for depth
// instead of trying to be /board. DirectoryWidget stays as the one
// link-out list, for anyone who wants a specific surface.
export default async function OverviewPage() {
  const user = await getSession();
  if (!user) redirect("/");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <NavBar />

      <main className="container mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">The ZAO</h1>
          <p className="text-slate-400 text-sm">What changed, what needs you, what's open.</p>
        </div>

        <div className="space-y-6">
          <VaultStatusWidget />
          <AttentionStrip />
          <BoardSummary />
          <DirectoryWidget />
        </div>

        <div className="mt-12 text-center text-xs text-white/40">
          Data refreshes on load.
        </div>
      </main>
    </div>
  );
}
