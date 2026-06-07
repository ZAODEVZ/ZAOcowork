"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ageDays, relativeTime, type ActionItem } from "@/lib/types";
import { bulkMarkDone, bulkArchive, bulkMoveToTriage } from "@/app/actions";

// CleanupPanel: 4 buckets in tabs, checkbox-select rows, single note,
// then bulk action buttons act on every selected row in the current
// bucket (or all selected across all buckets if cross-bucket).

type Bucket = "stale" | "aging" | "unowned" | "blocked";

const BUCKET_LABELS: Record<Bucket, string> = {
  stale: "Stale",
  aging: "Aging",
  unowned: "Unowned",
  blocked: "Blocked",
};

const BUCKET_HINTS: Record<Bucket, string> = {
  stale: "No activity 5+ days. Probably forgotten.",
  aging: "Older than 14 days. Probably no longer relevant.",
  unowned: "No owner. Probably never picked up.",
  blocked: "Status BLOCKED. Probably needs a decision.",
};

export function CleanupPanel({
  buckets,
}: {
  buckets: Record<Bucket, ActionItem[]>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Bucket>("stale");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const items = buckets[tab];
  const allSelected = items.length > 0 && items.every((it) => selected.has(it.id));

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((s) => {
      const next = new Set(s);
      if (allSelected) {
        for (const it of items) next.delete(it.id);
      } else {
        for (const it of items) next.add(it.id);
      }
      return next;
    });
  }

  function runAction(action: "done" | "archive" | "triage") {
    if (selected.size === 0) return;
    const labels = { done: "mark as DONE", archive: "archive", triage: "move to triage" };
    if (!confirm(`${selected.size} task${selected.size === 1 ? "" : "s"} will ${labels[action]}. Continue?`)) return;
    const fd = new FormData();
    for (const id of selected) fd.append("ids", id);
    if (note.trim()) fd.set("note", note.trim());
    setError(null);
    start(async () => {
      try {
        if (action === "done") await bulkMarkDone(fd);
        else if (action === "archive") await bulkArchive(fd);
        else await bulkMoveToTriage(fd);
        // Only clear on success — a failed run keeps the selection + note so
        // the user can retry without re-checking every row.
        setSelected(new Set());
        setNote("");
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error
            ? `Couldn't ${labels[action]}: ${err.message}`
            : `Couldn't ${labels[action]}. Selection kept — try again.`
        );
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Bucket tabs */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(buckets) as Bucket[]).map((b) => {
          const count = buckets[b].length;
          const active = tab === b;
          return (
            <button
              key={b}
              type="button"
              onClick={() => setTab(b)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                active
                  ? "border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-100"
                  : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06]"
              }`}
            >
              <span className="font-medium">{BUCKET_LABELS[b]}</span>
              <span className={`text-xs rounded-full px-1.5 py-0.5 ${active ? "bg-fuchsia-500/30" : "bg-white/10"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="text-xs text-white/45 px-1">{BUCKET_HINTS[tab]}</div>

      {/* Item list */}
      <div className="rounded-2xl bg-white/[0.04] border border-white/10 overflow-hidden">
        {items.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-white/55">
            Nothing here. {BUCKET_LABELS[tab].toLowerCase()} bucket is empty.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-white/[0.02]">
              <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-white/30 bg-[#0b1220] accent-fuchsia-500 cursor-pointer"
                />
                {allSelected ? "Deselect all" : `Select all ${items.length}`}
              </label>
              <div className="text-xs text-white/45">
                {selected.size > 0 ? `${selected.size} selected` : "no selection"}
              </div>
            </div>
            <ul className="divide-y divide-white/[0.06]">
              {items.map((it) => (
                <CleanupRow
                  key={it.id}
                  item={it}
                  selected={selected.has(it.id)}
                  onToggle={() => toggle(it.id)}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Sticky action footer */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-30 rounded-2xl bg-[#0a1226] border border-fuchsia-500/40 shadow-2xl shadow-black/40 p-3 md:p-4">
          {error && (
            <div className="mb-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="flex-1 min-w-0">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-white/45">What happened? (optional, becomes a comment on every task)</span>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. shipped in PR #21 / no longer relevant after Magnetic pivot / closed during May cleanup"
                  className="mt-1 w-full rounded-lg bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-fuchsia-500/50"
                />
              </label>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                type="button"
                disabled={pending}
                onClick={() => runAction("triage")}
                className="rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-200 text-xs font-medium px-3 py-2 transition disabled:opacity-50"
              >
                Move to Triage ({selected.size})
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => runAction("archive")}
                className="rounded-lg border border-slate-500/40 bg-slate-500/15 hover:bg-slate-500/25 text-slate-100 text-xs font-medium px-3 py-2 transition disabled:opacity-50"
              >
                Archive ({selected.size})
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => runAction("done")}
                className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold px-3 py-2 transition disabled:opacity-50"
              >
                Mark Done ({selected.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CleanupRow({
  item,
  selected,
  onToggle,
}: {
  item: ActionItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const age = ageDays(item.createdAt);
  const lastActivity = useMemo(() => {
    const acts = item.activity ?? [];
    if (acts.length > 0) return relativeTime(acts[acts.length - 1].createdAt);
    return relativeTime(item.updatedAt);
  }, [item]);
  const ownerStr = String(item.owner ?? "").trim();
  const ownerLabel = !ownerStr || ownerStr === "Open" ? "Unowned" : ownerStr;

  return (
    <li
      className={`flex items-start gap-3 px-4 py-3 transition cursor-pointer ${
        selected ? "bg-fuchsia-500/10" : "hover:bg-white/[0.03]"
      }`}
      onClick={onToggle}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="mt-1 h-4 w-4 rounded border-white/30 bg-[#0b1220] accent-fuchsia-500 cursor-pointer flex-shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white/90 truncate">{item.title}</div>
        <div className="text-[11px] text-white/45 mt-0.5">
          #{item.id} · {item.status} · {ownerLabel} · {age}d old · last activity {lastActivity}
        </div>
        {item.notes && (
          <div className="text-[11px] text-white/35 mt-1 truncate italic">
            {item.notes.slice(0, 120)}
          </div>
        )}
      </div>
      <a
        href={`/?task=${item.id}`}
        onClick={(e) => e.stopPropagation()}
        target="_blank"
        rel="noreferrer"
        className="text-[10px] text-white/40 hover:text-white/80 underline flex-shrink-0"
      >
        open
      </a>
    </li>
  );
}
