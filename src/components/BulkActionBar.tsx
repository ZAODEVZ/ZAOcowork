"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkAddBrand,
  bulkDelete,
  bulkSetOwner,
  bulkSetPriority,
  bulkSetStatus,
} from "@/app/actions";
import { BRANDS } from "@/lib/brands";
import { OWNERS, PRIORITIES, STATUSES } from "@/lib/types";

// Floating bar that appears at the bottom of the viewport when one or more
// tasks are checked. Surfaces every bulk op behind a single dropdown so the
// chrome stays small. Action runs through Server Actions; the bar clears its
// selection on success.

type Action = "owner" | "status" | "priority" | "brand" | "delete";

export function BulkActionBar({
  selectedIds,
  onClear,
}: {
  selectedIds: string[];
  onClear: () => void;
}) {
  const router = useRouter();
  const [action, setAction] = useState<Action>("owner");
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();

  if (selectedIds.length === 0) return null;

  function run() {
    const ids = selectedIds;
    if (ids.length === 0) return;
    const fd = new FormData();
    for (const id of ids) fd.append("ids", id);
    start(async () => {
      try {
        if (action === "delete") {
          if (!window.confirm(`Permanently delete ${ids.length} task${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) {
            return;
          }
          await bulkDelete(fd);
        } else if (action === "owner") {
          if (!value) return;
          fd.set("owner", value);
          await bulkSetOwner(fd);
        } else if (action === "status") {
          if (!value) return;
          fd.set("status", value);
          await bulkSetStatus(fd);
        } else if (action === "priority") {
          if (!value) return;
          fd.set("priority", value);
          await bulkSetPriority(fd);
        } else if (action === "brand") {
          if (!value) return;
          fd.set("brand", value);
          await bulkAddBrand(fd);
        }
        onClear();
        setValue("");
        router.refresh();
      } catch (err) {
        console.error("bulk op failed", err);
      }
    });
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(720px,calc(100vw-2rem))] rounded-2xl bg-[#0a1226] border border-white/20 shadow-2xl shadow-black/50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-md bg-zao-accent/20 border border-zao-accent/40 px-2 py-0.5 text-xs font-semibold text-zao-accent">
          {selectedIds.length} selected
        </span>
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value as Action);
            setValue("");
          }}
          disabled={pending}
          className="rounded-md bg-[#0b1220] border border-white/10 px-2 py-1.5 text-sm text-white/85"
        >
          <option value="owner">Reassign to</option>
          <option value="status">Set status</option>
          <option value="priority">Set priority</option>
          <option value="brand">Add brand tag</option>
          <option value="delete">Delete</option>
        </select>
        {action !== "delete" && (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
            className="flex-1 min-w-[140px] rounded-md bg-[#0b1220] border border-white/10 px-2 py-1.5 text-sm text-white/85"
          >
            <option value="">Choose...</option>
            {action === "owner" && OWNERS.map((o) => <option key={o} value={o}>{o}</option>)}
            {action === "status" && STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            {action === "priority" && PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            {action === "brand" && BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        <button
          type="button"
          onClick={run}
          disabled={pending || (action !== "delete" && !value)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
            action === "delete"
              ? "bg-red-500/20 border border-red-400/50 text-red-200 hover:bg-red-500/30"
              : "bg-zao-accent text-black hover:bg-blue-500"
          }`}
        >
          {pending ? "Applying..." : action === "delete" ? "Delete" : "Apply"}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={pending}
          className="text-xs text-white/55 hover:text-white/85 underline"
        >
          clear
        </button>
      </div>
    </div>
  );
}
