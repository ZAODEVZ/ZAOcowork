"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionItem } from "@/lib/types";
import type { ProposalRow } from "@/lib/proposals";
import { approveProposal, rejectProposal } from "@/app/actions";

// ProposalsPanel: list pending proposals, render the "what would change"
// diff vs current task state, and let admins approve or reject per row.

export function ProposalsPanel({
  rows,
  tasksById,
}: {
  rows: ProposalRow[];
  tasksById: Map<string, ActionItem>;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-8 text-center">
        <div className="text-sm text-white/55">
          No pending proposals. When the rule-based proposer or future LLM proposers
          fire, suggestions land here for your approval.
        </div>
        <div className="mt-3 text-xs text-white/40">
          Try it: open any unbranded task on the board, then call <code className="text-white/55">POST /api/proposals/suggest-brands?taskId=X</code>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((p) => (
        <ProposalCard key={p.id} proposal={p} task={tasksById.get(p.task_id)} />
      ))}
    </div>
  );
}

function ProposalCard({ proposal, task }: { proposal: ProposalRow; task: ActionItem | undefined }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const summary = summarize(proposal, task);
  const confidence = proposal.confidence !== null ? `${Math.round(proposal.confidence * 100)}%` : null;

  function act(action: "approve" | "reject") {
    setError(null);
    const fd = new FormData();
    fd.set("id", proposal.id);
    start(async () => {
      try {
        if (action === "approve") await approveProposal(fd);
        else await rejectProposal(fd);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "action failed");
      }
    });
  }

  return (
    <div className={`rounded-xl border ${proposal.source.startsWith("llm") ? "border-violet-500/30 bg-violet-500/8" : "border-blue-500/30 bg-blue-500/8"} p-4 ${pending ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 mb-1">
            <span className={`text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 ${proposal.source.startsWith("llm") ? "bg-violet-500/30 text-violet-100" : "bg-blue-500/30 text-blue-100"}`}>
              {proposal.action_type.replace(/_/g, " ")}
            </span>
            <span className="text-[10px] text-white/45">source: {proposal.source}</span>
            {confidence && <span className="text-[10px] text-white/45">· {confidence} confidence</span>}
          </div>
          <div className="text-sm text-white/90">
            Task <span className="font-mono text-white/70">#{proposal.task_id}</span>:{" "}
            <span className="font-medium">{task?.title ?? "(task not found)"}</span>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 mb-3 text-xs">
        <div className="text-[10px] uppercase tracking-wider text-white/45 mb-1">What would change</div>
        <div className="text-white/85">{summary}</div>
        {proposal.rationale && (
          <div className="text-[11px] text-white/50 mt-1.5 italic">{proposal.rationale}</div>
        )}
      </div>

      {error && (
        <div className="text-[11px] text-red-300 mb-2">{error}</div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => act("reject")}
          className="rounded-lg border border-white/10 hover:bg-white/5 text-white/70 text-xs font-medium px-3 py-1.5 transition disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => act("approve")}
          className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold px-3 py-1.5 transition disabled:opacity-50"
        >
          Approve & apply
        </button>
      </div>
    </div>
  );
}

function summarize(p: ProposalRow, task: ActionItem | undefined): string {
  switch (p.action_type) {
    case "set_brands": {
      const proposed = Array.isArray(p.payload.brands) ? (p.payload.brands as string[]) : [];
      const current = task?.brands ?? [];
      const added = proposed.filter((b) => !current.includes(b));
      const removed = current.filter((b) => !proposed.includes(b));
      const parts: string[] = [];
      if (added.length) parts.push(`add [${added.join(", ")}]`);
      if (removed.length) parts.push(`remove [${removed.join(", ")}]`);
      return parts.length ? parts.join(", ") : `set brands -> [${proposed.join(", ")}]`;
    }
    case "set_owner":
      return `owner: ${task?.owner ?? "?"} -> ${p.payload.owner ?? "?"}`;
    case "set_service_class":
      return `service class: ${task?.serviceClass ?? "Standard"} -> ${p.payload.serviceClass ?? "?"}`;
    case "set_priority":
      return `priority: ${task?.priority ?? "?"} -> ${p.payload.priority ?? "?"}`;
    case "move_status":
      return `status: ${task?.status ?? "?"} -> ${p.payload.status ?? "?"}`;
    case "flag_duplicate":
      return `flag as duplicate of #${p.payload.duplicateOf ?? "?"}`;
    case "add_comment": {
      const text = String(p.payload.text ?? "");
      return `add comment: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"`;
    }
  }
}
