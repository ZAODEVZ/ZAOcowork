"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ActionItem } from "@/lib/types";
import { parseText, type ParsedAction } from "@/lib/todo-parser";
import { todoProcess } from "@/app/actions";

const STATUS_LABEL: Record<string, string> = {
  TODO: "To Do",
  WIP: "In Progress",
  BLOCKED: "Blocked",
  DONE: "Done",
};

const OWNER_COLOR: Record<string, string> = {
  Iman: "bg-purple-500/20 text-purple-200 border-purple-500/40",
  Zaal: "bg-blue-500/20 text-blue-200 border-blue-500/40",
  Both: "bg-slate-500/20 text-slate-200 border-slate-500/40",
};

const STATUS_COLOR: Record<string, string> = {
  TODO: "bg-slate-500/20 text-slate-200 border-slate-500/40",
  WIP: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  BLOCKED: "bg-red-500/20 text-red-200 border-red-500/40",
  DONE: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
};

const PRIORITY_COLOR: Record<string, string> = {
  P1: "bg-red-500/15 text-red-300 border-red-500/30",
  P2: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  P3: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

type Phase = "input" | "preview" | "done";

export function TodoPanel({
  items,
  open,
  onClose,
}: {
  items: ActionItem[];
  open: boolean;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("input");
  const [text, setText] = useState("");
  const [actions, setActions] = useState<ParsedAction[]>([]);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);
  const [pending, start] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && phase === "input") {
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [open, phase]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  function reset() {
    setPhase("input");
    setText("");
    setActions([]);
    setResult(null);
  }

  function handleClose() {
    onClose();
    setTimeout(reset, 300);
  }

  function handleParse() {
    const parsed = parseText(text.trim(), items);
    if (parsed.length === 0) return;
    setActions(parsed);
    setPhase("preview");
  }

  function removeAction(index: number) {
    setActions((prev) => prev.filter((_, i) => i !== index));
  }

  function handleApply() {
    const fd = new FormData();
    fd.set("actions", JSON.stringify(actions));
    start(async () => {
      const res = await todoProcess(fd);
      setResult(res);
      setPhase("done");
    });
  }

  if (!open) return null;

  const createCount = actions.filter((a) => a.type === "create").length;
  const updateCount = actions.filter((a) => a.type !== "create").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        className="absolute inset-0 w-full h-full"
        style={{ background: "rgba(2,8,20,0.85)", backdropFilter: "blur(6px)" }}
        onClick={handleClose}
        aria-label="Close Todo"
        tabIndex={-1}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-xl flex flex-col rounded-2xl border border-white/[0.12] shadow-2xl overflow-hidden"
        style={{
          background: "#07111e",
          maxHeight: "min(90vh, 680px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 border border-blue-500/30">
              <span className="text-blue-300 text-sm leading-none">✦</span>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white leading-none">Todo</h2>
              <p className="text-[11px] text-white/40 mt-0.5 leading-none">
                Drop text — tasks detected automatically
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-white/35 hover:text-white/80 text-xl leading-none transition"
          >
            ×
          </button>
        </div>

        {/* Phase: Input */}
        {phase === "input" && (
          <InputPhase
            text={text}
            onChange={setText}
            onParse={handleParse}
            textareaRef={textareaRef}
          />
        )}

        {/* Phase: Preview */}
        {phase === "preview" && (
          <PreviewPhase
            actions={actions}
            createCount={createCount}
            updateCount={updateCount}
            pending={pending}
            onRemove={removeAction}
            onBack={() => setPhase("input")}
            onApply={handleApply}
          />
        )}

        {/* Phase: Done */}
        {phase === "done" && result && (
          <DonePhase result={result} onClose={handleClose} />
        )}
      </div>
    </div>
  );
}

function InputPhase({
  text,
  onChange,
  onParse,
  textareaRef,
}: {
  text: string;
  onChange: (v: string) => void;
  onParse: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const canParse = text.trim().length > 5;

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (canParse) onParse();
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder={`Paste meeting notes, a status update, or a task list.\n\nExamples:\n- Fix the login bug (Zaal)\n- Iman: design the new landing page\n- Recording session done\n- Distribution for Track 4 is blocked waiting on artwork`}
          className="w-full h-full resize-none bg-transparent px-5 pt-4 pb-3 text-sm text-white/80 placeholder-white/22 focus:outline-none leading-relaxed"
          style={{ minHeight: "220px" }}
        />
      </div>

      {/* Hints */}
      <div className="px-5 pb-3 flex flex-wrap gap-1.5">
        {[
          "- or * for list items",
          "Mention Iman or Zaal to assign",
          "Say 'done' or 'blocked' to update status",
          "Ctrl+Enter to parse",
        ].map((hint) => (
          <span
            key={hint}
            className="text-[10px] px-2 py-0.5 rounded-full border border-white/[0.08] text-white/35"
          >
            {hint}
          </span>
        ))}
      </div>

      <div className="px-5 pb-5 flex-shrink-0">
        <button
          onClick={onParse}
          disabled={!canParse}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-default px-4 py-2.5 text-sm font-semibold transition"
        >
          Parse & Preview
        </button>
      </div>
    </div>
  );
}

function PreviewPhase({
  actions,
  createCount,
  updateCount,
  pending,
  onRemove,
  onBack,
  onApply,
}: {
  actions: ParsedAction[];
  createCount: number;
  updateCount: number;
  pending: boolean;
  onRemove: (i: number) => void;
  onBack: () => void;
  onApply: () => void;
}) {
  if (actions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-5 gap-4 flex-1">
        <p className="text-sm text-white/40 text-center">
          All items removed. Go back and try different text.
        </p>
        <button
          onClick={onBack}
          className="text-sm text-blue-400 hover:text-blue-300 underline"
        >
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Sub-header */}
      <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-3 flex-shrink-0">
        <button
          onClick={onBack}
          className="text-xs text-white/40 hover:text-white/70 transition flex items-center gap-1"
        >
          ← Back
        </button>
        <div className="flex-1 text-xs text-white/55">
          <span className="text-white/80 font-medium">
            {actions.length} item{actions.length !== 1 ? "s" : ""} detected
          </span>
          {createCount > 0 && (
            <span className="ml-2 text-emerald-400">{createCount} new</span>
          )}
          {updateCount > 0 && (
            <span className="ml-2 text-blue-400">{updateCount} update{updateCount !== 1 ? "s" : ""}</span>
          )}
        </div>
        <span className="text-[10px] text-white/30">tap × to remove</span>
      </div>

      {/* Action list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {actions.map((action, i) => (
          <ActionCard key={i} action={action} onRemove={() => onRemove(i)} />
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/[0.06] flex-shrink-0">
        <button
          onClick={onApply}
          disabled={pending || actions.length === 0}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-default px-4 py-2.5 text-sm font-semibold transition"
        >
          {pending
            ? "Applying…"
            : `Apply ${actions.length} change${actions.length !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

function ActionCard({
  action,
  onRemove,
}: {
  action: ParsedAction;
  onRemove: () => void;
}) {
  if (action.type === "create") {
    return (
      <div className="group relative rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-semibold uppercase tracking-wide">
            New
          </span>
          <p className="flex-1 text-sm text-white/85 font-medium leading-snug">
            {action.title}
          </p>
          <button
            onClick={onRemove}
            className="flex-shrink-0 text-white/25 hover:text-white/60 transition text-base leading-none ml-1"
          >
            ×
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 pl-[52px]">
          {action.claimable ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 font-semibold">
              CLAIM — unassigned
            </span>
          ) : action.owner ? (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                OWNER_COLOR[action.owner] || OWNER_COLOR.Both
              }`}
            >
              {action.owner}
            </span>
          ) : null}
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full border ${STATUS_COLOR[action.status]}`}
          >
            {STATUS_LABEL[action.status]}
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full border ${PRIORITY_COLOR[action.priority]}`}
          >
            {action.priority}
          </span>
        </div>
      </div>
    );
  }

  if (action.type === "update_status") {
    return (
      <div className="group relative rounded-xl border border-blue-500/15 bg-blue-500/[0.04] px-3.5 py-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border border-blue-500/40 bg-blue-500/10 text-blue-300 font-semibold uppercase tracking-wide">
            Status
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white/75 leading-snug truncate">
              {action.matchedTitle}
            </p>
            <p className="text-[11px] text-blue-300/70 mt-0.5">
              → {STATUS_LABEL[action.newStatus]}
            </p>
          </div>
          <button
            onClick={onRemove}
            className="flex-shrink-0 text-white/25 hover:text-white/60 transition text-base leading-none ml-1"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  if (action.type === "add_note") {
    return (
      <div className="group relative rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/35 bg-amber-500/8 text-amber-300 font-semibold uppercase tracking-wide">
            Note
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-white/45 leading-none mb-1 truncate">
              {action.matchedTitle}
            </p>
            <p className="text-sm text-white/70 leading-snug line-clamp-2">
              {action.note}
            </p>
          </div>
          <button
            onClick={onRemove}
            className="flex-shrink-0 text-white/25 hover:text-white/60 transition text-base leading-none ml-1"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function DonePhase({
  result,
  onClose,
}: {
  result: { created: number; updated: number };
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 gap-5 flex-1">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
        <span className="text-emerald-400 text-2xl leading-none">✓</span>
      </div>
      <div className="text-center space-y-1">
        <p className="text-base font-semibold text-white">Applied successfully</p>
        <p className="text-sm text-white/50">
          {result.created > 0 && (
            <span className="text-emerald-400 font-medium">{result.created} task{result.created !== 1 ? "s" : ""} created</span>
          )}
          {result.created > 0 && result.updated > 0 && (
            <span className="text-white/30"> · </span>
          )}
          {result.updated > 0 && (
            <span className="text-blue-400 font-medium">{result.updated} updated</span>
          )}
          {result.created === 0 && result.updated === 0 && (
            <span className="text-white/40">No changes applied</span>
          )}
        </p>
      </div>
      <button
        onClick={onClose}
        className="rounded-xl bg-blue-600 hover:bg-blue-500 px-8 py-2.5 text-sm font-semibold transition"
      >
        Done
      </button>
    </div>
  );
}

export function TodoTrigger({
  onClick,
  claimableCount,
}: {
  onClick: () => void;
  claimableCount: number;
}) {
  return (
    <button
      onClick={onClick}
      className="group fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-blue-500/30 bg-[#07111e] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition-all hover:border-blue-400/50 hover:bg-[#0a1828] hover:shadow-blue-700/40 hover:shadow-xl active:scale-95"
      style={{ backdropFilter: "blur(12px)" }}
      aria-label="Open Todo"
    >
      <span className="text-blue-400 text-base leading-none transition group-hover:rotate-12">
        ✦
      </span>
      <span className="text-white/90">Todo</span>
      {claimableCount > 0 && (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-black text-[10px] font-bold leading-none">
          {claimableCount}
        </span>
      )}
    </button>
  );
}
