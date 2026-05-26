"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkAssignUnowned } from "@/app/actions";
import { OWNERS } from "@/lib/types";

// /admin Bulk task ops panel. The board's BulkActionBar covers the
// "select-rows-then-act" flow; this surface is for fire-and-forget shortcuts
// across the whole dataset where opening the board + selecting hundreds of
// rows by hand would be friction.
//
// Today: one shortcut, "Assign all unowned tasks to <user>". The 2026-05-26
// audit (doc 761 finding #9) flagged 99 of 311 tasks with NULL/Open owner -
// these stay invisible to every owner filter until reassigned.

export function BulkOpsPanel({ unownedCount }: { unownedCount: number }) {
  const router = useRouter();
  const [owner, setOwner] = useState<string>("Zaal");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function runAssignUnowned() {
    if (unownedCount === 0) return;
    if (!window.confirm(
      `Assign all ${unownedCount} unowned tasks to ${owner}? They can reassign later from the board, this just gets them out of the NULL bucket.`
    )) {
      return;
    }
    const fd = new FormData();
    fd.set("owner", owner);
    start(async () => {
      try {
        const r = await bulkAssignUnowned(fd);
        setResult(`Assigned ${r.assigned} task${r.assigned === 1 ? "" : "s"} to ${owner}.`);
        router.refresh();
      } catch (err) {
        setResult(err instanceof Error ? `Failed: ${err.message}` : "Failed.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card
        title="Fix unowned tasks"
        body={
          unownedCount === 0
            ? "All tasks have an owner. Nothing to fix."
            : `${unownedCount} task${unownedCount === 1 ? "" : "s"} currently have no owner (or owner "Open"). These don't show up in any owner filter on the board, so they often go missed. Assign them in one shot to one teammate; that teammate can hand them off later.`
        }
        action={
          unownedCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="rounded-md bg-[#0b1220] border border-white/10 px-2 py-1.5 text-sm text-white/85"
              >
                {OWNERS.filter((o) => o !== "Open" && o !== "Both").map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={runAssignUnowned}
                disabled={pending}
                className="rounded-md bg-zao-accent hover:bg-blue-500 px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50 transition"
              >
                {pending ? "Assigning..." : `Assign ${unownedCount} to ${owner}`}
              </button>
            </div>
          ) : null
        }
      />

      <Card
        title="More bulk ops on the board"
        body="For everything else, open the board, click Select in the filter bar to switch on multi-select, check the rows you want to change, then use the floating action bar at the bottom of the screen to reassign / change status / change priority / add a brand tag / delete in one shot."
      />

      {result && (
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
          {result}
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 space-y-2">
      <div className="text-sm font-semibold text-white/85">{title}</div>
      <p className="text-xs text-white/65 leading-relaxed">{body}</p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
