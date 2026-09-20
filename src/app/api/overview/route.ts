import { NextResponse } from "next/server";
import { listItems, listRecentlyDone, countCompletedInWindow } from "@/lib/data";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

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
}

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // openOnly drops DONE and archived in SQL; only TRIAGE is left to filter.
    // DONE rows are fetched separately (bounded to 30 days) rather than by
    // dropping openOnly - see listRecentlyDone's own comment for why.
    const [items, recentlyDone] = await Promise.all([
      listItems({ openOnly: true }),
      listRecentlyDone(30),
    ]);

    const active = items.filter((x) => x.status !== "TRIAGE");
    const open = active.filter((x) => x.status !== "DONE");

    // Count by status
    const statusCounts = {
      todo: open.filter((x) => x.status === "TODO").length,
      in_progress: open.filter((x) => x.status === "WIP").length,
      blocked: open.filter((x) => x.status === "BLOCKED").length,
    };

    // Count done items this week and this month
    const now = Date.now();
    const doneThisWeek = countCompletedInWindow(recentlyDone, 7, now);
    const doneThisMonth = countCompletedInWindow(recentlyDone, 30, now);

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

    const data: TaskStatusData = {
      totalOpen: open.length,
      byStatus: statusCounts,
      doneThisWeek,
      doneThisMonth,
      topOwners,
      blockedItems,
      dueSoon,
      recentlyAdded,
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
