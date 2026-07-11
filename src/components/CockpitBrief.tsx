import Link from "next/link";
import type { ActionItem } from "@/lib/types";
import { ageDays, relativeTime } from "@/lib/data";

const PRIORITY_DOT: Record<string, string> = {
  P1: "bg-red-500",
  P2: "bg-amber-500",
  P3: "bg-emerald-500",
};

const STATUS_BADGE: Record<string, string> = {
  TRIAGE: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  TODO: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  WIP: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  BLOCKED: "bg-red-500/15 text-red-300 border-red-500/30",
  DONE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

export interface CockpitBriefProps {
  items: ActionItem[];
  currentUser: string;
  sections?: {
    doFirst?: ActionItem[];
    needsYou?: ActionItem[];
    openPRs?: ActionItem[];
    ideaInbox?: ActionItem[];
    stale?: ActionItem[];
  };
}

function CockpitTaskRow({ it }: { it: ActionItem }) {
  const age = ageDays(it.createdAt);
  const overdue = it.due && it.status !== "DONE" && new Date(it.due) < new Date();

  return (
    <Link
      href={`/todo/${encodeURIComponent(it.id)}`}
      prefetch={false}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 -mx-1 hover:bg-white/[0.05] transition"
    >
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[it.priority] ?? "bg-white/30"}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-white/85 truncate font-medium">{it.title}</div>
        <div className="text-[10px] text-white/40 truncate">
          <span className="text-white/55">#{it.id}</span> · {age}d
          {overdue ? <span className="text-red-300 ml-1">overdue</span> : null}
        </div>
      </div>
      <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0 ${STATUS_BADGE[it.status] ?? ""}`}>
        {it.status}
      </span>
    </Link>
  );
}

function CockpitSection({
  title,
  accent,
  items,
  emptyText = "Nothing here",
}: {
  title: string;
  accent: string;
  items: ActionItem[];
  emptyText?: string;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
      <div className="mb-2 flex items-baseline gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${accent}`} />
        <h3 className="text-xs font-semibold text-white/75">{title}</h3>
        <span className="text-[10px] text-white/30">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[10px] text-white/25 italic py-1.5">No {emptyText.toLowerCase()}</p>
      ) : (
        <div className="space-y-0">
          {items.map((it) => (
            <CockpitTaskRow key={it.id} it={it} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * CockpitBrief - renders 5-section operational brief above the board.
 * Placement-agnostic: just takes items + currentUser.
 * Gated behind ?cockpit=1 URL param on the board page.
 */
export function CockpitBrief({ items, currentUser, sections }: CockpitBriefProps) {
  // If sections not provided, compute them here (for standalone use)
  const { doFirst = [], needsYou = [], openPRs = [], ideaInbox = [], stale = [] } = sections || {};

  return (
    <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-5">
      <div className="mb-4 flex items-baseline gap-2">
        <span className="h-2 w-2 rounded-full bg-blue-400" />
        <h2 className="text-sm font-semibold text-white/85">Cockpit Brief</h2>
        <span className="text-xs text-white/40">at-a-glance context</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        <CockpitSection title="Do First" accent="bg-amber-400" items={doFirst} emptyText="urgent items" />
        <CockpitSection title="Needs You" accent="bg-blue-400" items={needsYou} emptyText="awaiting your decision" />
        <CockpitSection title="Open PRs" accent="bg-indigo-400" items={openPRs} emptyText="PRs in flight" />
        <CockpitSection title="Idea Inbox" accent="bg-fuchsia-400" items={ideaInbox} emptyText="captures" />
        <CockpitSection title="Stale" accent="bg-red-400" items={stale} emptyText="forgotten work" />
      </div>
    </div>
  );
}
