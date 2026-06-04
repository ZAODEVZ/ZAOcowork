"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { quickCreate } from "@/app/actions";
import { parseTask, type ParsedPriority } from "@/lib/parse-task";
import { brandColor } from "@/lib/brands";
import { VoiceButton } from "./VoiceButton";

// The core add-task form, shared by the inline bar and the Cmd+K modal.
//
// One text input handles everything via NL parse:
//   `fix login bug !p1 @iman due:fri #zaodevz` -> P1 / Iman / 2026-05-29 / ZAO Devz / title="fix login bug"
//
// A chip row below the input shows the parsed fields live so the user knows
// what will land in the DB before they hit Enter. Empty title disables submit.
// On submit, fields go in as FormData; quickCreate writes to Supabase.
//
// `tabBrand` auto-tags every task with the current tab's brand when no #brand
// is typed - the URL-driven brand context cascades down to creation.

export function QuickAddBody({
  currentUser,
  defaultCategory,
  tabBrand,
  autoFocus,
  onSubmitted,
  onCreated,
  compact,
}: {
  currentUser: string;
  defaultCategory: string;
  tabBrand: string | null;
  autoFocus?: boolean;
  onSubmitted?: () => void;
  // Called with the new task id so the Board can open it / highlight it.
  onCreated?: (id: string) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
  }, [autoFocus]);

  const parsed = useMemo(() => parseTask(text), [text]);
  const effectiveBrands = parsed.brands.length > 0
    ? parsed.brands
    : tabBrand
      ? [tabBrand]
      : [];

  const defaultOwner = useMemo(() => {
    const me = currentUser.trim().toLowerCase();
    if (me === "zaal") return "Zaal";
    if (me === "iman") return "Iman";
    if (me === "thyrev") return "ThyRev";
    if (me === "samantha") return "Samantha";
    if (me === "tyler") return "Tyler";
    return "Open";
  }, [currentUser]);

  const effectiveOwner = parsed.owner ?? defaultOwner;
  const effectivePriority: ParsedPriority = parsed.priority ?? "P2";

  function submit() {
    if (!parsed.title || pending) return;
    const fd = new FormData();
    fd.set("title", parsed.title);
    fd.set("status", "TODO");
    fd.set("owner", effectiveOwner);
    fd.set("priority", effectivePriority);
    fd.set("category", defaultCategory);
    if (parsed.urgent) fd.set("urgent", "1");
    if (parsed.important) fd.set("important", "1");
    if (parsed.due) fd.set("due", parsed.due);
    for (const b of effectiveBrands) fd.append("brands", b);
    start(async () => {
      const res = await quickCreate(fd);
      setText("");
      onSubmitted?.();
      router.refresh();
      // Auto-open the new task so you land straight in it to fill in the
      // details (Jose's flow: create -> immediately add the quest details).
      // This doubles as the confirmation — you see the task and its number.
      if (res && onCreated) onCreated(res.id);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const hasChips =
    parsed.priority || parsed.owner || parsed.due || parsed.urgent || parsed.important || effectiveBrands.length > 0;

  return (
    <div className={compact ? "space-y-2" : "space-y-2 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-3"}>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder='What needs doing?  try "fix bug !p1 @iman due:fri #zaodevz"'
          className="flex-1 rounded-lg bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-zao-accent/60"
          disabled={pending}
          autoComplete="off"
        />
        <VoiceButton
          onTranscript={(t) => setText((prev) => (prev ? `${prev} ${t}` : t))}
          disabled={pending}
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || !parsed.title}
          className="rounded-lg bg-zao-accent hover:bg-blue-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-50 disabled:hover:bg-zao-accent transition whitespace-nowrap"
        >
          {pending ? "Adding..." : "Add"}
        </button>
      </div>

      {hasChips ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-white/40 uppercase tracking-wider mr-1">parsed:</span>
          {effectiveBrands.map((b) => (
            <span key={b} className={`px-1.5 py-0.5 rounded border ${brandColor(b)}`}>
              {b}
            </span>
          ))}
          {parsed.owner && (
            <span className="px-1.5 py-0.5 rounded border border-blue-400/40 bg-blue-500/15 text-blue-200">
              @{parsed.owner}
            </span>
          )}
          {parsed.priority && (
            <span className="px-1.5 py-0.5 rounded border border-amber-400/40 bg-amber-500/15 text-amber-200">
              {parsed.priority}
            </span>
          )}
          {parsed.urgent && (
            <span className="px-1.5 py-0.5 rounded border border-red-400/40 bg-red-500/15 text-red-200">
              urgent
            </span>
          )}
          {parsed.important && (
            <span className="px-1.5 py-0.5 rounded border border-yellow-400/40 bg-yellow-500/15 text-yellow-200">
              important
            </span>
          )}
          {parsed.due && (
            <span className="px-1.5 py-0.5 rounded border border-emerald-400/40 bg-emerald-500/15 text-emerald-200">
              due {parsed.due}
            </span>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-white/35">
          tip: <code className="text-white/55">!p1</code> priority,{" "}
          <code className="text-white/55">@iman</code> owner,{" "}
          <code className="text-white/55">due:fri</code>,{" "}
          <code className="text-white/55">#zaodevz</code>{" "}
          {tabBrand && (
            <span>
              · auto-tagged: <span className="text-white/70">{tabBrand}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
