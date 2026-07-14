import { getSession, isAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NavBar } from "@/components/NavBar";
import { GoalsWidget } from "@/components/overview/GoalsWidget";
import { TaskStatusWidget } from "@/components/overview/TaskStatusWidget";
import { DeadlinesWidget } from "@/components/overview/DeadlinesWidget";
import { ReposWidget } from "@/components/overview/ReposWidget";
import { SurfacesWidget } from "@/components/overview/SurfacesWidget";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const user = await getSession();
  if (!user) redirect("/");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <NavBar />

      <main className="container mx-auto max-w-7xl px-4 py-8">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Mission Control</h1>
          <p className="text-slate-400">ZAO ecosystem overview, goals, status, and key surfaces</p>
        </div>

        {/* 5-widget grid: responsive (1 col mobile, 2-3 desktop) */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Widget 1: Goals (spans full width on desktop) */}
          <div className="lg:col-span-3">
            <GoalsWidget />
          </div>

          {/* Widget 2: Task Status (spans 2 cols on desktop) */}
          <div className="md:col-span-2">
            <TaskStatusWidget />
          </div>

          {/* Widget 3: Deadlines */}
          <div>
            <DeadlinesWidget />
          </div>

          {/* Widget 4: Repos */}
          <div>
            <ReposWidget />
          </div>

          {/* Widget 5: Surfaces (spans 2 cols) */}
          <div className="md:col-span-2">
            <SurfacesWidget />
          </div>
        </div>
      </main>
    </div>
  );
}
