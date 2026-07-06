"use client";

import { useState, useTransition } from "react";
import { addComment } from "@/app/actions";
import { VoiceButton } from "@/components/quickadd/VoiceButton";

// A single agentic-todo card that reads clean and lets you drop context or a
// voice note straight onto the task, in place. Context is stored as a normal
// task comment (via the addComment server action, silent so it does not ping
// the team), so it shows up everywhere the task does. Voice uses the browser
// Web Speech API (VoiceButton) - the transcript lands in the same box.

export interface ContextNote {
  id: string;
  content: string;
  displayName?: string;
  createdAt?: string;
}

const STATUS_BADGE: Record<string, string> = {
  todo: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  in_progress: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  blocked: "bg-red-500/15 text-red-300 border-red-500/30",
  done: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

function when(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AgenticTaskCard({
  id,
  title,
  notes,
  due,
  status,
  category,
  important,
  isNew,
  comments,
}: {
  id: string;
  title: string;
  notes: string | null;
  due: string | null;
  status: string;
  category: string | null;
  important: boolean;
  isNew: boolean;
  comments: ContextNote[];
}) {
  const [text, setText] = useState("");
  const [list, setList] = useState<ContextNote[]>(comments);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const overdue = due && status !== "done" && new Date(due) < new Date();

  function save() {
    const content = text.trim();
    if (!content || pending) return;
    setErr(null);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("content", content);
    fd.set("silent", "1");
    startTransition(async () => {
      const res = await addComment(fd);
      if (res?.error) {
        setErr(res.error);
        return;
      }
      setList((prev) => [
        ...prev,
        { id: `local-${prev.length}`, content, displayName: "You", createdAt: new Date().toISOString() },
      ]);
      setText("");
    });
  }

  function onVoice(t: string) {
    setText((prev) => (prev ? `${prev} ${t}` : t));
  }

  return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-white/90 leading-snug">
            {important ? <span className="text-amber-300" aria-hidden="true">* </span> : null}
            {title}
            {isNew ? (
              <span className="ml-2 align-middle text-[9px] uppercase tracking-wide text-violet-300 border border-violet-400/40 rounded px-1 py-0.5">
                new
              </span>
            ) : null}
          </div>
          {notes ? <div className="text-[12.5px] text-white/55 mt-1 leading-snug">{notes}</div> : null}
          <div className="text-[11px] text-white/35 mt-1">
            {category ?? "General"}
            {due ? <span className={overdue ? "text-red-300" : "text-white/35"}> · due {due}</span> : null}
          </div>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${STATUS_BADGE[status] ?? "border-white/15 text-white/50"}`}
        >
          {status}
        </span>
      </div>

      {list.length > 0 ? (
        <div className="space-y-1.5 border-t border-white/5 pt-2.5">
          {list.map((c) => (
            <div key={c.id} className="text-[13px] text-white/75 leading-snug">
              <span className="text-white/85">{c.content}</span>
              <span className="text-white/30 text-[11px]"> · {c.displayName ?? "note"}{c.createdAt ? ` · ${when(c.createdAt)}` : ""}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
          }}
          rows={2}
          placeholder="Add context or memory... (or tap the mic)"
          className="flex-1 resize-none rounded-lg bg-black/25 border border-white/10 focus:border-white/25 outline-none px-3 py-2 text-sm text-white/90 placeholder:text-white/30"
        />
        <VoiceButton onTranscript={onVoice} disabled={pending} />
        <button
          type="button"
          onClick={save}
          disabled={pending || !text.trim()}
          className="h-9 px-3 rounded-lg text-sm font-medium border border-violet-400/40 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30 transition disabled:opacity-40"
        >
          {pending ? "..." : "Add"}
        </button>
      </div>
      {err ? <div className="text-[11px] text-red-300">{err}</div> : null}
    </div>
  );
}
