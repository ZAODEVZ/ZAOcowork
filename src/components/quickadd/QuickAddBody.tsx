"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
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

// The just-created task, kept so we can show an obvious "Added #N to <column>"
// confirmation with a button that opens it. Cleared on the next keystroke.
type Created = { id: string; title: string; status: string; owner: string };

// QuickAdd always lands a task in TODO, but map defensively so the banner
// reads the board's column name rather than the raw enum.
const COLUMN_LABEL: Record<string, string> = {
  TODO: "TO DO",
  WIP: "IN PROGRESS",
  BLOCKED: "BLOCKED",
  DONE: "DONE",
  TRIAGE: "TRIAGE",
};

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
  const [created, setCreated] = useState<Created | null>(null);
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
      if (res) setCreated({ id: res.id, title: res.title, status: res.status, owner: res.owner });
      onSubmitted?.();
      router.refresh();
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
          onChange={(e) => {
            setText(e.target.value);
            if (created) setCreated(null);
          }}
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

      {created && (
        <CreateBubble
          created={created}
          onOpen={() => {
            if (onCreated) onCreated(created.id);
            setCreated(null);
          }}
          onDone={() => setCreated(null)}
        />
      )}
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

// CreateBubble: a centered "receipt" that surfaces a freshly created task —
// like a tx-hash confirmation. Per Jose's spec: appears in the middle in cyan,
// lasts 7s total, fades its opacity out over the final 2s, then vanishes.
// Clickable to jump straight to the task. Portaled to body so it's centered on
// the viewport regardless of where the add bar lives or how far you've scrolled.
function CreateBubble({
  created,
  onOpen,
  onDone,
}: {
  created: Created;
  onOpen: () => void;
  onDone: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    setMounted(true);
    // Start the fade with 2s left of the 7s lifetime.
    const fadeTimer = window.setTimeout(() => setPhase("out"), 5000);
    const doneTimer = window.setTimeout(onDone, 7000);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none">
      <button
        type="button"
        onClick={onOpen}
        style={{ transition: "opacity 2000ms ease, transform 300ms ease" }}
        className={`pointer-events-auto flex items-center gap-3 rounded-2xl border border-cyan-400/50 bg-cyan-500/15 px-5 py-3.5 backdrop-blur-md shadow-2xl shadow-cyan-500/20 hover:bg-cyan-500/25 ${
          phase === "out" ? "opacity-0" : "opacity-100"
        } ${phase === "in" ? "animate-[bubblePop_300ms_ease-out]" : ""}`}
      >
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-cyan-400/25 text-base font-bold text-cyan-100">
          ✓
        </span>
        <span className="text-left">
          <span className="block text-sm font-semibold text-white">
            Task created · <span className="text-cyan-200">#{created.id}</span>
          </span>
          <span className="block text-[11px] text-cyan-100/70">
            in {COLUMN_LABEL[created.status] ?? created.status} · tap to view →
          </span>
        </span>
      </button>
    </div>,
    document.body,
  );
}
