import { NextResponse } from "next/server";
import { getActions } from "@/lib/data";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

interface TaskStatusData {
  totalOpen: number;
  byStatus: {
    todo: number;
    in_progress: number;
    blocked: number;
  };
  topOwners: Array<{ owner: string; count: number }>;
  blockedItems: Array<{ id: string; title: string; owner: string }>;
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

    // Blocked items (with limit)
    const blockedItems = open
      .filter((x) => x.status === "BLOCKED")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
      .map((x) => ({
        id: x.dbId || x.id,
        title: x.title,
        owner: String(x.owner ?? "Open").trim(),
      }));

    // Due soon (next 7 days)
    const now = Date.now();
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
