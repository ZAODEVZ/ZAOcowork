"use client";

import Link from "next/link";
import type { ActionItem, Project } from "@/lib/types";

interface PathCard {
  id: string;
  name: string;
  nextAction: ActionItem | null;
  openCount: number;
  blockedCount: number;
  filterParam: string;
  filterValue: string;
  isExternal?: boolean;
  externalUrl?: string;
}

const CURATED_INITIATIVES: PathCard[] = [
  {
    id: "zaostock",
    name: "ZAOstock",
    nextAction: null,
    openCount: 0,
    blockedCount: 0,
    filterParam: "external",
    filterValue: "zaostock",
    isExternal: true,
    externalUrl: "https://github.com/ZAODEVZ/ZAOstock",
  },
  {
    id: "wavewarz",
    name: "WaveWarZ",
    nextAction: null,
    openCount: 0,
    blockedCount: 0,
    filterParam: "external",
    filterValue: "wavewarz",
    isExternal: true,
    externalUrl: "https://github.com/WaveWarZ/WaveWarZ",
  },
  {
    id: "fractal",
    name: "Fractal",
    nextAction: null,
    openCount: 0,
    blockedCount: 0,
    filterParam: "external",
    filterValue: "fractal",
    isExternal: true,
    externalUrl: "https://github.com/thezao/fractal",
  },
  {
    id: "geo",
    name: "GEO (ZAO Context)",
    nextAction: null,
    openCount: 0,
    blockedCount: 0,
    filterParam: "external",
    filterValue: "geo",
    isExternal: true,
    externalUrl: "https://useicm.com",
  },
  {
    id: "zao-zone",
    name: "ZAO Zone",
    nextAction: null,
    openCount: 0,
    blockedCount: 0,
    filterParam: "external",
    filterValue: "zao-zone",
    isExternal: true,
    externalUrl: "https://thezao.xyz",
  },
  {
    id: "zabal-games",
    name: "ZABAL Games",
    nextAction: null,
    openCount: 0,
    blockedCount: 0,
    filterParam: "external",
    filterValue: "zabal-games",
    isExternal: true,
    externalUrl: "https://magnetiq.io",
  },
];

export function PathsClient({
  items,
  projects,
}: {
  items: ActionItem[];
  projects: Project[];
}) {
  // Filter to non-archived, non-done, open tasks
  const activeTasks = items.filter(
    (task) => !task.archivedAt && task.status !== "DONE"
  );

  // Group by projectId if available, otherwise by category
  const pathMap = new Map<string, ActionItem[]>();
  const pathLabels = new Map<string, string>();

  for (const task of activeTasks) {
    let pathId: string;
    let pathName: string;

    if (task.projectId) {
      // Use project name from the projects list
      const project = projects.find((p) => p.id === task.projectId);
      pathId = task.projectId;
      pathName = project?.name || "Unknown Project";
    } else {
      // Fall back to category
      pathId = task.category || "Other";
      pathName = task.category || "Other";
    }

    if (!pathMap.has(pathId)) {
      pathMap.set(pathId, []);
      pathLabels.set(pathId, pathName);
    }
    pathMap.get(pathId)!.push(task);
  }

  // Build path cards
  const derivedPaths: PathCard[] = Array.from(pathMap.entries()).map(
    ([pathId, tasks]) => {
      const openCount = tasks.filter((t) => t.status !== "DONE").length;
      const blockedCount = tasks.filter((t) => t.status === "BLOCKED").length;

      // Find next action: highest priority, then nearest due
      const sorted = [...tasks].sort((a, b) => {
        // P1 > P2 > P3
        const priorityOrder: Record<string, number> = {
          P1: 0,
          P2: 1,
          P3: 2,
        };
        const aPrio = priorityOrder[a.priority || "P2"] ?? 1;
        const bPrio = priorityOrder[b.priority || "P2"] ?? 1;
        if (aPrio !== bPrio) return aPrio - bPrio;

        // Then by due date (nearest first)
        const adue = a.due ? new Date(a.due).getTime() : Infinity;
        const bdue = b.due ? new Date(b.due).getTime() : Infinity;
        return adue - bdue;
      });

      const nextAction = sorted[0] || null;
      const isProjectPath = tasks.length > 0 && tasks[0].projectId;

      return {
        id: pathId,
        name: pathLabels.get(pathId) || pathId,
        nextAction,
        openCount,
        blockedCount,
        filterParam: isProjectPath ? "project" : "category",
        filterValue: isProjectPath
          ? projects.find((p) => p.id === pathId)?.slug || pathId
          : pathId,
      };
    }
  );

  // Sort by open count descending, then by name
  const sortedPaths = derivedPaths.sort((a, b) => {
    if (b.openCount !== a.openCount) return b.openCount - a.openCount;
    return a.name.localeCompare(b.name);
  });

  // Combine with curated initiatives
  const allPaths = [...sortedPaths, ...CURATED_INITIATIVES];

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 px-4 py-3">
        <p className="text-xs text-blue-200">
          Pick a lane. See the one thing to do next. Go. Each path shows your open count +
          the highest-priority next action.
        </p>
      </div>

      {/* Grid of path cards - responsive: 1 col mobile, 2-3 col desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {allPaths.map((path) => (
          <PathCard key={path.id} path={path} />
        ))}
      </div>
    </div>
  );
}

function PathCard({ path }: { path: PathCard }) {
  if (path.isExternal) {
    return (
      <a
        href={path.externalUrl}
        target="_blank"
        rel="noreferrer"
        className="group rounded-xl bg-slate-800/40 border border-slate-700/60 backdrop-blur-sm p-6 hover:bg-slate-800/50 hover:border-slate-600/80 transition-all"
      >
        <h3 className="text-lg font-semibold text-white mb-2">{path.name}</h3>
        <p className="text-xs text-white/50 group-hover:text-white/70">
          External initiative
          <span className="ml-1">→</span>
        </p>
      </a>
    );
  }

  const diveInUrl =
    path.filterParam === "project"
      ? `/board?project=${encodeURIComponent(path.filterValue)}`
      : `/board?category=${encodeURIComponent(path.filterValue)}`;

  return (
    <Link href={diveInUrl}>
      <div className="group rounded-xl bg-slate-800/40 border border-slate-700/60 backdrop-blur-sm p-6 hover:bg-slate-800/50 hover:border-slate-600/80 transition-all cursor-pointer h-full flex flex-col">
        {/* Path name */}
        <h3 className="text-lg font-semibold text-white mb-4">{path.name}</h3>

        {/* Next action section - the key focal point */}
        {path.nextAction ? (
          <div className="mb-4 p-4 rounded-lg bg-slate-700/30 border border-slate-600/40">
            <p className="text-[10px] uppercase tracking-wider text-white/60 font-semibold mb-2">
              Next Action
            </p>
            <p className="text-sm text-white/90 line-clamp-2 font-medium">
              {path.nextAction.title}
            </p>
            {path.nextAction.priority && (
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    path.nextAction.priority === "P1"
                      ? "bg-red-500/20 text-red-200"
                      : path.nextAction.priority === "P2"
                      ? "bg-amber-500/20 text-amber-200"
                      : "bg-slate-500/20 text-slate-200"
                  }`}
                >
                  {path.nextAction.priority}
                </span>
                {path.nextAction.due && (
                  <span className="text-xs text-white/50">
                    due {formatDate(path.nextAction.due)}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mb-4 p-4 rounded-lg bg-slate-700/20 border border-slate-600/30">
            <p className="text-xs text-white/40">No open tasks</p>
          </div>
        )}

        {/* Stats: open count + blocked flag */}
        <div className="flex items-center gap-3 text-xs text-white/60 flex-wrap">
          <span>{path.openCount} open</span>
          {path.blockedCount > 0 && (
            <span className="text-red-300">
              {path.blockedCount} blocked
            </span>
          )}
        </div>

        {/* Dive in indicator */}
        <div className="mt-4 pt-4 border-t border-slate-600/30 flex items-center justify-between">
          <span className="text-xs text-white/50">Dive in</span>
          <span className="text-white/40 group-hover:text-white/70 transition">→</span>
        </div>
      </div>
    </Link>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const today = new Date();
    const diff = d.getTime() - today.getTime();
    const daysAway = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (daysAway < 0) return "overdue";
    if (daysAway === 0) return "today";
    if (daysAway === 1) return "tomorrow";
    if (daysAway <= 7) return `${daysAway}d`;
    if (daysAway <= 30) return `${Math.ceil(daysAway / 7)}w`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}
