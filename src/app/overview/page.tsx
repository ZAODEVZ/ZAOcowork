import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NavBar } from "@/components/NavBar";
import { AttentionStrip } from "@/components/overview/AttentionStrip";
import { GoalsWidget } from "@/components/overview/GoalsWidget";
import { TaskStatusWidget } from "@/components/overview/TaskStatusWidget";
import { CycleTimeWidget } from "@/components/overview/CycleTimeWidget";
import { DeadlinesWidget } from "@/components/overview/DeadlinesWidget";
import { ReposWidget } from "@/components/overview/ReposWidget";
import { SurfacesWidget } from "@/components/overview/SurfacesWidget";
import { TerminalsWidget } from "@/components/overview/TerminalsWidget";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const user = await getSession();
  if (!user) redirect("/");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <NavBar />

      <main className="container mx-auto max-w-7xl px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Mission Control</h1>
          <p className="text-slate-400 text-sm">
            ZAO ecosystem overview, goals, status, and key surfaces
          </p>
        </div>

        {/* Attention Strip - What needs you now */}
        <AttentionStrip />

        {/* Responsive grid layout */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 auto-rows-max">
          {/* Row 1: Goals (full width) */}
          <div className="lg:col-span-3">
            <GoalsWidget />
          </div>

          {/* Row 2: Task Status (2 cols) + Deadlines (1 col) */}
          <div className="md:col-span-2">
            <TaskStatusWidget />
          </div>
          <div>
            <DeadlinesWidget />
          </div>

          {/* Row 3: Cycle Time (1 col) + Repos (1 col) + Surfaces (1 col) */}
          <div>
            <CycleTimeWidget />
          </div>
          <div>
            <ReposWidget />
          </div>
          <div>
            <SurfacesWidget />
          </div>

          {/* Row 4: Terminals (full width) */}
          <div className="lg:col-span-3">
            <TerminalsWidget />
          </div>
        </div>

        {/* Footer note */}
        <div className="mt-12 text-center text-xs text-white/40">
          Data refreshes every few minutes. Last sync time available on each widget.
        </div>
      </main>
    </div>
  );
}
