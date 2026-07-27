"use client";

// board/modals.tsx - the self-contained overlay components lifted out of
// Board.tsx (help, welcome, tour, daily reminder, toast, project picker) plus
// the tour copy they render.
//
// None of them touch board state: they take props and render. Keeping them in
// the same file as the 2700-line board just made that file harder to navigate.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { isAssignedTo, type ActionItem } from "@/lib/types";
import { parseDueDate } from "@/components/board/board-csv";

export const TOUR_STEPS: Array<{ title: string; lines: string[] }> = [
  {
    title: "Welcome to The Zao Co-Works",
    lines: [
      "This is your shared operational workspace.",
      "Add tasks, track progress, submit updates, and collaborate — all in one place.",
    ],
  },
  {
    title: "Task Rooms",
    lines: [
      "Click any task title to open its Task Room — a dedicated workspace for that task.",
      "Inside you'll find the full history, comments, progress updates, and approval workflow.",
    ],
  },
  {
    title: "Add tasks fast",
    lines: [
      'Use the "+ add item" box at the top of any column and press Enter.',
      "Set owner, priority, and importance before submitting.",
    ],
  },
  {
    title: "Approve or reject updates",
    lines: [
      "Workers can submit progress updates from inside a Task Room.",
      "If approval is required, the update goes to the review queue for the lead to approve or reject.",
    ],
  },
  {
    title: "Stay organized",
    lines: [
      "Use the filters at the top — Mine, Aging, Owner, Category, Priority, DMAIC.",
      "Tasks sort by urgency/importance first, then priority, then age.",
    ],
  },
  {
    title: "Everything lives in the ☰ Menu",
    lines: [
      "Top-right ☰ Menu holds My Work (your tasks + @mentions), Activity (every comment & update across all tasks), the AI Assistant, and Settings.",
      "A red dot on the menu means someone @mentioned you.",
    ],
  },
  {
    title: "Search anywhere — ⌘K",
    lines: [
      "Press ⌘K (or just /) from any screen to jump straight to a task by title, #id, or owner.",
    ],
  },
  {
    title: "Saved views & instant edits",
    lines: [
      "Save any filter combo as a View for one-click reuse.",
      "Change a task's status from the dropdown and it saves instantly — and comments, updates, and notes autosave as you type, so nothing gets lost.",
    ],
  },
  {
    title: "Settings & all features",
    lines: [
      "Open ☰ Menu → Settings any time to see every feature explained and set your preferences (AI model, notifications).",
    ],
  },
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-zao-ink border border-white/10 rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">How to use</h2>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>
        <ol className="space-y-2 text-sm text-white/80 list-decimal list-inside">
          <li>
            <b className="text-white">Task Rooms</b>: Click any task title or "open" to enter its
            dedicated workspace — history, comments, approvals all in one place.
          </li>
          <li>
            <b className="text-white">Add items</b>: type in the "+ add item" box at top of any
            column, press Enter.
          </li>
          <li>
            <b className="text-white">Move items</b>: use the status dropdown on a card, or
            submit a progress update from inside the Task Room.
          </li>
          <li>
            <b className="text-white">Approval workflow</b>: enable "Require Approval" on a task
            so updates go to review before the status changes.
          </li>
          <li>
            <b className="text-white">Set priority</b>: click the colored dot on the left of any
            card to cycle P1 → P2 → P3.
          </li>
          <li>
            <b className="text-white">Filter</b>: use the chips at top. "Mine" shows what's on
            you. "Aging" shows items open more than 14 days.
          </li>
        </ol>
        <h3 className="mt-4 text-xs uppercase tracking-wider text-white/40">Six Sigma cheat</h3>
        <ul className="mt-1 space-y-1 text-xs text-white/70 list-disc list-inside">
          <li>
            <b className="text-white">DMAIC phase</b>: Define → Measure → Analyze → Improve →
            Control.
          </li>
          <li>
            <b className="text-white">Notes template</b>: Customer / Success / Measurement.
          </li>
          <li>
            <b className="text-white">WIP limit</b>: aim for 5 active items per person max.
          </li>
        </ul>
      </div>
    </div>
  );
}

// Renders children into document.body. Without this, a fixed-position modal
// nested under a backdrop-blur/transform ancestor is positioned relative to
// that ancestor (the tall task board) instead of the viewport - which dropped
// the welcome + tour prompts to the middle of the page.
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

export function WelcomeModal({
  userLabel,
  onClose,
  onTour,
}: {
  userLabel: string;
  onClose: () => void;
  onTour: () => void;
}) {
  return (
    <Portal>
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100vw-2rem)] max-w-md">
        <div className="bg-[#0d1f35] border border-white/10 rounded-2xl p-5 shadow-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Hi {userLabel}</h2>
            <button
              onClick={onClose}
              className="text-white/50 hover:text-white text-xl leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          <p className="mt-2 text-sm text-white/70">
            Welcome to The Zao Co-Works — your operational workspace. Click any task to open its
            dedicated room with comments, history, and the approval workflow.
          </p>
          <div className="mt-4 flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5 text-white/70"
            >
              Not now
            </button>
            <button
              onClick={onTour}
              className="rounded-lg bg-zao-accent hover:bg-blue-500 px-4 py-2 text-sm font-medium"
            >
              Yes, tour me
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export function TourModal({
  step,
  onClose,
  onBack,
  onNext,
}: {
  step: number;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const s = TOUR_STEPS[Math.max(0, Math.min(TOUR_STEPS.length - 1, step))];
  const last = step >= TOUR_STEPS.length - 1;
  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0d1f35] backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="text-xs text-white/45">
            Tour {step + 1} / {TOUR_STEPS.length}
          </div>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>
        <h2 className="mt-2 text-base font-semibold">{s.title}</h2>
        <ul className="mt-2 space-y-2 text-sm text-white/75 list-disc list-inside">
          {s.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            onClick={onBack}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5 text-white/70 disabled:opacity-40"
            disabled={step === 0}
          >
            Back
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5 text-white/70"
            >
              Close
            </button>
            <button
              onClick={last ? onClose : onNext}
              className="rounded-lg bg-zao-accent hover:bg-blue-500 px-4 py-2 text-sm font-medium"
            >
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
      </div>
    </Portal>
  );
}

export function DailyReminderModal({
  userLabel,
  items,
  todayKey,
  storageUserKey,
  onClose,
}: {
  userLabel: string;
  items: ActionItem[];
  todayKey: string;
  storageUserKey: string;
  onClose: () => void;
}) {
  const mine = storageUserKey;
  // Doc 763 F4 + F6: exclude archived + TRIAGE from daily counts.
  const active = items.filter((it) => !it.archivedAt && it.status !== "TRIAGE");
  const openMine = active.filter((it) => {
    if (it.status === "DONE") return false;
    return isAssignedTo(it, mine);
  });
  const openAll = active.filter((it) => it.status !== "DONE");
  const openUnowned = active.filter((it) => {
    if (it.status === "DONE") return false;
    const o = String(it.owner ?? "").trim();
    return !o || o === "Open";
  });
  const overdueMine = openMine.filter((it) => {
    const due = parseDueDate(it.due);
    if (!due) return false;
    return due.toISOString().slice(0, 10) < todayKey;
  });
  const lastSeenKey = `zao-cowork-last-seen:${storageUserKey}`;
  const lastSeenRaw =
    typeof window === "undefined" ? "" : window.localStorage.getItem(lastSeenKey) || "";
  const lastSeenMs = lastSeenRaw ? new Date(lastSeenRaw).getTime() : 0;
  const completedByCoworker = items.filter((it) => {
    if (it.status !== "DONE") return false;
    if (!it.completedAt) return false;
    const doneMs = new Date(it.completedAt).getTime();
    if (!Number.isFinite(doneMs) || doneMs <= lastSeenMs) return false;
    const created = String(it.createdBy || "").toLowerCase();
    const completedBy = String(it.completedBy || "").toLowerCase();
    return created === mine && completedBy && completedBy !== mine;
  });
  const pendingReviews = items.reduce(
    (n, it) => n + ((it.updates || []).filter((u) => u.reviewStatus === "pending").length),
    0,
  );

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0d1f35] backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Daily check-in</h2>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>
        <p className="mt-2 text-sm text-white/70">
          Hey {userLabel}, here's what's waiting for you today.
        </p>
        <div className="mt-4 grid grid-cols-4 gap-2">
          <div className="rounded-xl bg-black/30 border border-white/10 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-white/45">My open</div>
            <div className="mt-0.5 text-xl font-bold leading-none">{openMine.length}</div>
            <div className="text-[9px] text-white/35 mt-0.5">
              of {openAll.length} team · {openUnowned.length} unowned
            </div>
          </div>
          <div className="rounded-xl bg-black/30 border border-red-500/25 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-white/45">Overdue</div>
            <div className="mt-0.5 text-xl font-bold leading-none text-red-200">
              {overdueMine.length}
            </div>
          </div>
          <div className="rounded-xl bg-black/30 border border-emerald-500/25 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-white/45">Done</div>
            <div className="mt-0.5 text-xl font-bold leading-none text-emerald-200">
              {completedByCoworker.length}
            </div>
          </div>
          <div className={`rounded-xl bg-black/30 border ${pendingReviews > 0 ? "border-amber-500/30" : "border-white/10"} px-3 py-2`}>
            <div className="text-[10px] uppercase tracking-wider text-white/45">Reviews</div>
            <div className={`mt-0.5 text-xl font-bold leading-none ${pendingReviews > 0 ? "text-amber-200" : ""}`}>
              {pendingReviews}
            </div>
          </div>
        </div>
        {overdueMine.length > 0 && (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wider text-white/45">Overdue tasks</div>
            <ul className="mt-2 space-y-1 text-sm text-white/75">
              {overdueMine.slice(0, 5).map((it) => (
                <li key={it.id} className="flex items-baseline justify-between gap-3">
                  <span className="truncate">{it.title}</span>
                  <span className="text-xs text-white/45 whitespace-nowrap">{it.due}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {completedByCoworker.length > 0 && (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wider text-white/45">Updates</div>
            <ul className="mt-2 space-y-1 text-sm text-white/75">
              {completedByCoworker.slice(0, 5).map((it) => (
                <li key={it.id} className="truncate">
                  Completed by {it.completedBy || it.owner}: {it.title}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-zao-accent hover:bg-blue-500 px-4 py-2 text-sm font-medium"
          >
            Got it
          </button>
        </div>
      </div>
      </div>
    </Portal>
  );
}

export function Toast({
  title,
  message,
  onClose,
}: {
  title: string;
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const id = window.setTimeout(onClose, 7000);
    return () => window.clearTimeout(id);
  }, [onClose]);
  return (
    <div className="fixed top-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm">
      <div className="rounded-2xl bg-zao-ink border border-white/10 shadow-2xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{title}</div>
            <div className="mt-1 text-sm text-white/70">{message}</div>
          </div>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}


// ProjectPickerBar (doc 765 Phase I): horizontal scrollable chip row
// listing active projects. "All projects" chip clears the filter.
// Mounted above the FilterBar so the picker is the first decision the
// user makes ("which project am I looking at?") before refining by
// owner/priority/status.
export function ProjectPickerBar({
  projects,
  activeId,
  activeSlug,
  activeName,
}: {
  projects: Array<{ id: string; slug: string; name: string; color: string }>;
  activeId: string | null;
  activeSlug: string | null;
  activeName: string | null;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 p-2 overflow-x-auto">
      <div className="flex items-center gap-1.5 min-w-min">
        <span className="text-[10px] uppercase tracking-wider text-white/45 px-2 flex-shrink-0">
          Project
        </span>
        <a
          href="/board"
          className={`text-xs rounded-md px-2 py-1 border whitespace-nowrap transition flex-shrink-0 ${
            !activeId
              ? "bg-indigo-500/20 text-indigo-100 border-indigo-500/40"
              : "border-white/10 text-white/55 hover:text-white/85 hover:bg-white/5"
          }`}
        >
          All projects
        </a>
        {projects.map((p) => {
          const active = activeId === p.id;
          return (
            <a
              key={p.id}
              href={`/?project=${encodeURIComponent(p.slug)}`}
              className={`text-xs rounded-md border px-2 py-1 whitespace-nowrap transition flex-shrink-0 ${
                active
                  ? p.color
                  : "border-white/10 text-white/55 hover:text-white/85 hover:bg-white/5"
              }`}
              title={p.name}
            >
              {p.name}
            </a>
          );
        })}
        {activeSlug && activeName && (
          <span className="text-[10px] text-white/45 ml-auto pl-2 flex-shrink-0">
            scope: {activeName}
          </span>
        )}
      </div>
    </div>
  );
}
