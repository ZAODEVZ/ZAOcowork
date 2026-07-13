"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionItem } from "@/lib/types";
import { quickCreate } from "@/app/actions";

interface TeamMember {
  slug: string;
  name: string;
}

interface DailyTaskEntry {
  member: TeamMember;
  task: ActionItem | null;
  isCreating?: boolean;
}

export function DailyView({
  items,
  currentUser,
  onOpenTask,
}: {
  items: ActionItem[];
  currentUser: string;
  onOpenTask: (id: string) => void;
}) {
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [entries, setEntries] = useState<DailyTaskEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const todayKey = new Date().toISOString().slice(0, 10);

  // Fetch team members
  useEffect(() => {
    async function fetchMembers() {
      try {
        const res = await fetch("/api/team");
        if (!res.ok) throw new Error("Failed to fetch team members");
        const data = await res.json();
        setMembers(data.people || []);
      } catch (err) {
        console.error("Error fetching team members:", err);
        setMembers([]);
      }
    }
    fetchMembers();
  }, []);

  // Build daily task entries
  useEffect(() => {
    const newEntries: DailyTaskEntry[] = [];

    for (const member of members) {
      // Search for daily task matching pattern: "YYYY-MM-DD <Name> tasks"
      const taskTitle = `${todayKey} ${member.name} tasks`;
      const task = items.find(
        (it) => it.title.toLowerCase() === taskTitle.toLowerCase(),
      );

      newEntries.push({ member, task: task || null });
    }

    setEntries(newEntries);
    setLoading(false);
  }, [members, items, todayKey]);

  // Create a daily task for a team member
  async function createDailyTask(member: TeamMember) {
    const taskTitle = `${todayKey} ${member.name} tasks`;
    startTransition(async () => {
      try {
        // Capitalize owner name (e.g., "zaal" -> "Zaal")
        const ownerName =
          member.slug.charAt(0).toUpperCase() + member.slug.slice(1);

        const fd = new FormData();
        fd.set("title", taskTitle);
        fd.set("status", "TODO");
        fd.set("owner", ownerName);
        fd.set("priority", "P3");
        fd.set("category", "Ops");

        const result = await quickCreate(fd);

        if (result?.id) {
          // Refresh to show the new task
          router.refresh();
          // Auto-open the newly created task
          onOpenTask(result.id);
        }
      } catch (err) {
        console.error("Error creating daily task:", err);
      }
    });
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <p className="text-sm text-white/60">Loading daily tasks...</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <p className="text-sm text-white/60">No team members found.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">
        Daily Tasks for {todayKey}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {entries.map((entry) => (
          <div
            key={entry.member.slug}
            className="rounded-lg border border-white/10 bg-white/[0.03] p-3 hover:bg-white/[0.06] transition"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <p className="text-sm font-medium text-white">
                  {entry.member.name}
                </p>
                <p className="text-xs text-white/40">@{entry.member.slug}</p>
              </div>
            </div>

            {entry.task ? (
              <button
                onClick={() => onOpenTask(entry.task!.id)}
                className="w-full px-2.5 py-1.5 text-xs font-medium rounded-md border border-zao-accent/50 bg-zao-accent/10 text-zao-accent hover:bg-zao-accent/20 transition text-left truncate"
                title={`Open ${entry.task.title}`}
              >
                #{entry.task.id}: Today's list
              </button>
            ) : (
              <button
                onClick={() => createDailyTask(entry.member)}
                disabled={isPending || entry.isCreating}
                className="w-full px-2.5 py-1.5 text-xs font-medium rounded-md border border-white/15 text-white/70 hover:bg-white/5 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                title={`Start ${entry.member.name}'s daily list`}
              >
                {isPending || entry.isCreating ? "Creating..." : "Start list"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
