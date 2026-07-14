import { NextResponse } from "next/server";
import { getActions } from "@/lib/data";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

// Goal keyword matchers - case-insensitive
const GOAL_MATCHERS: Record<string, string[]> = {
  geo: ["geo", "llms.txt", "ai answer", "json-ld", "citable"],
  zaostock: ["zaostock", "zao stock"],
  zabal_games: ["zabal", "zabal games"],
  artizen: ["artizen"],
  fractal: ["fractal", "ordao", "respect"],
  devcon: ["devcon", "zaotravelz", "mumbai", "festival"],
  revenue: ["revenue", "wavewarz", "monetiz", "sponsor", "paid"],
};

interface GoalProgress {
  key: string;
  matched: number;
  done: number;
  pct: number | null;
  tracked: boolean;
}

interface CycleTimeMetrics {
  avgLeadTimeDays: number | null;
  avgCycleTimeDays: number | null;
  throughputPerWeek: number | null;
  completedLast30Days: number;
  note: string;
}

interface TaskStatusData {
  totalOpen: number;
  byStatus: {
    todo: number;
    in_progress: number;
    blocked: number;
  };
  doneThisWeek: number;
  doneThisMonth: number;
  topOwners: Array<{ owner: string; count: number }>;
  blockedItems: Array<{ id: string; title: string; owner: string; blockedSinceDays?: number }>;
  dueSoon: Array<{ id: string; title: string; due: string; owner: string }>;
  recentlyAdded: Array<{ id: string; title: string; createdAt: string; owner: string }>;
  goalProgress: GoalProgress[];
  cycleTime: CycleTimeMetrics;
}

function computeGoalProgress(items: any[]): GoalProgress[] {
  const goals: GoalProgress[] = [];

  for (const [goalKey, keywords] of Object.entries(GOAL_MATCHERS)) {
    // Find all tasks that match any keyword in this goal (case-insensitive search in title + notes)
    const matchedTasks = items.filter((item) => {
      const searchText = `${item.title} ${item.notes || ""}`.toLowerCase();
      return keywords.some((keyword) => searchText.includes(keyword.toLowerCase()));
    });

    const totalMatched = matchedTasks.length;
    const doneCount = matchedTasks.filter((t) => t.status === "DONE").length;
    const pct = totalMatched > 0 ? Math.round((doneCount / totalMatched) * 100) : null;

    goals.push({
      key: goalKey,
      matched: totalMatched,
      done: doneCount,
      pct,
      tracked: totalMatched > 0,
    });
  }

  return goals;
}

function computeCycleTimeMetrics(items: any[]): CycleTimeMetrics {
  // Completed items in the last 30 days (using completedAt)
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const completedRecently = items.filter((x) => {
    if (x.status !== "DONE" || !x.completedAt) return false;
    const completedTime = new Date(x.completedAt).getTime();
    return completedTime >= thirtyDaysAgo && completedTime <= now;
  });

  // Lead time: created_at -> completed_at
  const leadTimes = completedRecently
    .map((x) => {
      const createdTime = new Date(x.createdAt).getTime();
      const completedTime = new Date(x.completedAt).getTime();
      const daysDiff = (completedTime - createdTime) / (24 * 60 * 60 * 1000);
      return daysDiff;
    })
    .filter((d) => Number.isFinite(d) && d >= 0);

  const avgLeadTimeDays = leadTimes.length > 0 ? Math.round(leadTimes.reduce((a, b) => a + b) / leadTimes.length * 10) / 10 : null;

  // Cycle time is ideally from first in-progress to done, but we don't track
  // in_progress_at yet. For now, use lead time as proxy and note the limitation.
  // Future: migrate to tracking in_progress_at in schema + activity_log.
  const avgCycleTimeDays = avgLeadTimeDays; // Same as lead time until in_progress_at exists

  // Throughput: completed items per week (over 30d window)
  const weeksInPeriod = 30 / 7;
  const throughputPerWeek = completedRecently.length > 0 ? Math.round((completedRecently.length / weeksInPeriod) * 10) / 10 : null;

  return {
    avgLeadTimeDays,
    avgCycleTimeDays,
    throughputPerWeek,
    completedLast30Days: completedRecently.length,
    note: "Lead/cycle time uses created_at to completed_at (in_progress_at tracking pending)",
  };
}

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const doc = await getActions();
    const items = doc.items;

    // Exclude archived and done/cancelled items
    const active = items.filter((x) => !x.archivedAt && x.status !== "DONE" && x.status !== "TRIAGE");
    const open = active.filter((x) => x.status !== "DONE");

    // Count by status
    const statusCounts = {
      todo: open.filter((x) => x.status === "TODO").length,
      in_progress: open.filter((x) => x.status === "WIP").length,
      blocked: open.filter((x) => x.status === "BLOCKED").length,
    };

    // Count done items this week and this month
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

    const doneItems = items.filter((x) => x.status === "DONE");
    const doneThisWeek = doneItems.filter((x) => {
      if (!x.completedAt) return false;
      const completedTime = new Date(x.completedAt).getTime();
      return completedTime >= weekAgo && completedTime <= now;
    }).length;

    const doneThisMonth = doneItems.filter((x) => {
      if (!x.completedAt) return false;
      const completedTime = new Date(x.completedAt).getTime();
      return completedTime >= monthAgo && completedTime <= now;
    }).length;

    // Top owners (by count of open tasks)
    const ownerCounts = new Map<string, number>();
    open.forEach((x) => {
      const owner = String(x.owner ?? "Open").trim();
      ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
    });
    const topOwners = Array.from(ownerCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([owner, count]) => ({ owner, count }));

    // Blocked items (with limit) - include days blocked (no update for >3d = stuck)
    const blockedItems = open
      .filter((x) => x.status === "BLOCKED")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
      .map((x) => {
        const updatedTime = new Date(x.updatedAt || x.createdAt).getTime();
        const blockedSinceDays = Math.round((now - updatedTime) / (24 * 60 * 60 * 1000));
        return {
          id: x.dbId || x.id,
          title: x.title,
          owner: String(x.owner ?? "Open").trim(),
          blockedSinceDays,
        };
      });

    // Due soon (next 7 days)
    const in7Days = now + 7 * 24 * 60 * 60 * 1000;
    const dueSoon = open
      .filter((x) => {
        if (!x.due) return false;
        // Only ISO dates (YYYY-MM-DD), not free-text dues
        if (!/^\d{4}-\d{2}-\d{2}$/.test(x.due)) return false;
        const dueTime = new Date(x.due + "T23:59:59Z").getTime();
        return dueTime >= now && dueTime <= in7Days;
      })
      .sort((a, b) => new Date(a.due!).getTime() - new Date(b.due!).getTime())
      .slice(0, 10)
      .map((x) => ({
        id: x.dbId || x.id,
        title: x.title,
        due: x.due!,
        owner: String(x.owner ?? "Open").trim(),
      }));

    // Recently added (last 5)
    const recentlyAdded = open
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map((x) => ({
        id: x.dbId || x.id,
        title: x.title,
        createdAt: x.createdAt,
        owner: String(x.owner ?? "Open").trim(),
      }));

    // Compute real goal progress from tasks (all items, not just open ones)
    const goalProgress = computeGoalProgress(items);

    // Compute cycle-time metrics
    const cycleTime = computeCycleTimeMetrics(items);

    const data: TaskStatusData = {
      totalOpen: open.length,
      byStatus: statusCounts,
      doneThisWeek,
      doneThisMonth,
      topOwners,
      blockedItems,
      dueSoon,
      recentlyAdded,
      goalProgress,
      cycleTime,
    };

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("Overview route error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch overview data" },
      { status: 500 }
    );
  }
}
