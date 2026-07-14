"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type {
  ActionItem,
  ActionStatus,
  Comment,
  TaskUpdate,
  ActivityEvent,
  Priority,
  TaskType,
} from "@/lib/types";
import {
  effectiveAssignees,
  BOARD_STATUSES,
  PRIORITIES,
  PHASES,
  OWNERS,
  CATEGORIES,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  SERVICE_CLASSES,
  SERVICE_CLASS_LABELS,
  relativeTime,
} from "@/lib/types";
import { patchField, addComment, editComment, submitUpdate, reviewUpdate, deleteItem, addTaskDependency, removeTaskDependency, setTaskPublicOverride, setAssignees as setAssigneesAction, createSubtask, linkSubtask, unlinkSubtask } from "@/app/actions";
import { useDraft } from "@/lib/use-draft";
import { resolveSource } from "@/lib/source-resolver";
import type { DepRef } from "@/lib/dependencies";

const STATUS_LABEL: Record<ActionStatus, string> = {
  TRIAGE: "TRIAGE",
  TODO: "TO DO",
  WIP: "IN PROGRESS",
  BLOCKED: "BLOCKED",
  DONE: "DONE",
};

const STATUS_BADGE: Record<ActionStatus, string> = {
  TRIAGE: "bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40",
  TODO: "bg-slate-500/20 text-slate-200 border-slate-500/40",
  WIP: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  BLOCKED: "bg-red-500/20 text-red-200 border-red-500/40",
  DONE: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
};

const PRIORITY_BADGE: Record<Priority, string> = {
  P1: "bg-red-500/15 text-red-300 border-red-500/30",
  P2: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  P3: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

const REVIEW_BADGE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-300 border-red-500/30",
  changes_requested: "bg-orange-500/15 text-orange-300 border-orange-500/30",
};

function userAvatar(userId?: string, displayName?: string, size = "h-7 w-7 text-xs") {
  const color =
    userId === "zaal"
      ? "bg-blue-600/40 text-blue-200"
      : userId === "iman"
      ? "bg-purple-600/40 text-purple-200"
      : userId === "thyrev"
      ? "bg-emerald-600/40 text-emerald-200"
      : "bg-slate-600/40 text-slate-200";
  // Defensive: comments/updates created via the bot or API can land without a
  // displayName. Calling .slice on undefined here crashes the SSR render of
  // TaskRoom (and 500s the whole page on a ?task= deep link), so fall back to
  // the userId or a neutral dot instead of assuming the field is present.
  const initial = (displayName || userId || "?").slice(0, 1).toUpperCase();
  return (
    <div
      className={`${size} flex-shrink-0 rounded-full flex items-center justify-center font-bold ${color}`}
    >
      {initial}
    </div>
  );
}

export function TaskRoom({
  item,
  currentUser,
  onClose,
  projects,
  onOpenTask,
  allItems,
}: {
  item: ActionItem;
  currentUser: string;
  onClose: () => void;
  // Doc 765 Phase I: optional project list passed down from Board. If
  // missing or empty, the picker hides so old call sites keep working.
  projects?: Array<{ id: string; slug: string; name: string }>;
  // Open another task's room (used to jump to a related/dependency task).
  // Optional so existing call sites keep working.
  onOpenTask?: (appId: string) => void;
  // Full board item set, used to suggest related tasks. Optional.
  allItems?: ActionItem[];
}) {
  const [panel, setPanel] = useState<"details" | "log">("details");
  const [mounted, setMounted] = useState(false);
  const pendingUpdates = (item.updates || []).filter((u) => u.reviewStatus === "pending");

  // Portal target only exists on the client. Without this, the panel's
  // `fixed inset-0` is positioned relative to the board's backdrop-blur
  // ancestor instead of the viewport — so opening a task from far down the
  // page rendered the panel up at the top, off-screen (Jose's "empty box":
  // it had data, just not where he was looking). Portaling to document.body
  // makes it cover the viewport no matter how far the user has scrolled.
  useEffect(() => setMounted(true), []);

  // Lock body scroll while the panel is open so the background board doesn't
  // scroll underneath it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <button
        className="hidden lg:block absolute inset-0 w-full h-full cursor-default"
        style={{ background: "rgba(0,5,15,0.8)" }}
        onClick={onClose}
        tabIndex={-1}
        aria-label="Close"
      />

      {/* Panel */}
      <div className="relative ml-auto w-full lg:w-[90%] xl:w-[85%] 2xl:w-[78%] bg-[#07111e] border-l border-white/10 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-start gap-3 px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <span
                className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border font-medium ${STATUS_BADGE[item.status]}`}
              >
                {STATUS_LABEL[item.status]}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${PRIORITY_BADGE[item.priority]}`}
              >
                {item.priority}
              </span>
              {item.taskType && item.taskType !== "task" && (
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/15 text-white/55">
                  {TASK_TYPE_LABELS[item.taskType]}
                </span>
              )}
              {item.requiresApproval && (
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300">
                  Approval Required
                </span>
              )}
              {pendingUpdates.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-medium">
                  {pendingUpdates.length} awaiting review
                </span>
              )}
            </div>
            <h2 className="text-sm font-semibold leading-snug">{item.title}</h2>
            <p className="mt-0.5 text-[11px] text-white/35">
              #{item.id} · {item.category}
              {item.createdBy ? ` · created by ${item.createdBy}` : ""}
              {" · "}
              {relativeTime(item.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <CopyLinkButton id={item.id} />
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white text-2xl leading-none mt-0.5 transition"
              aria-label="Close task room"
            >
              ×
            </button>
          </div>
        </header>

        {/* Mobile tab bar */}
        <div className="flex lg:hidden border-b border-white/10 flex-shrink-0">
          <button
            onClick={() => setPanel("details")}
            className={`flex-1 py-2.5 text-xs font-medium transition ${panel === "details" ? "text-white border-b-2 border-blue-400" : "text-white/45"}`}
          >
            Task Details
          </button>
          <button
            onClick={() => setPanel("log")}
            className={`flex-1 py-2.5 text-xs font-medium transition relative ${panel === "log" ? "text-white border-b-2 border-blue-400" : "text-white/45"}`}
          >
            Operational Log
            {pendingUpdates.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 w-4 rounded-full bg-amber-500 text-black text-[9px] font-bold">
                {pendingUpdates.length}
              </span>
            )}
          </button>
        </div>

        {/* Two-column content */}
        <div className="flex flex-1 min-h-0">
          {/* Left: Details */}
          <div
            className={`${panel === "details" ? "flex" : "hidden"} lg:flex flex-col w-full lg:w-[42%] xl:w-[40%] border-r border-white/10 overflow-y-auto`}
          >
            <DetailsPanel item={item} currentUser={currentUser} onClose={onClose} projects={projects} onOpenTask={onOpenTask} allItems={allItems} />
          </div>

          {/* Right: Operational log */}
          <div
            className={`${panel === "log" ? "flex" : "hidden"} lg:flex flex-col flex-1 overflow-y-auto bg-[#050e1a]`}
          >
            <LogPanel item={item} currentUser={currentUser} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DependenciesBlock({
  item,
  onOpenTask,
}: {
  item: ActionItem;
  onOpenTask?: (appId: string) => void;
}) {
  const taskId = item.dbId;
  const [deps, setDeps] = useState<{ blockedBy: DepRef[]; blocks: DepRef[] } | null>(null);
  const [allTasks, setAllTasks] = useState<Array<{ id: string; title: string }> | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Guard: unsaved task can't have dependencies
  if (!taskId) return null;

  const id = taskId; // Type-narrowed after guard

  useEffect(() => {
    let cancelled = false;
    // Clear stale deps when switching tasks so the previous task's links
    // don't linger while the new fetch is in flight.
    setDeps(null);
    setShowPicker(false);
    async function fetchDeps() {
      try {
        const res = await fetch(`/api/dependencies?taskId=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!cancelled && data.ok) {
          setDeps({ blockedBy: data.blockedBy || [], blocks: data.blocks || [] });
        }
      } catch {
        // Silently ignore fetch errors
      }
    }
    fetchDeps();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const linkedIds = new Set([
    ...((deps?.blockedBy ?? []).map((d) => d.id) ?? []),
    ...((deps?.blocks ?? []).map((d) => d.id) ?? []),
  ]);

  async function handleRemove(blockerId: string, blockedId: string) {
    start(async () => {
      const fd = new FormData();
      fd.set("blockerId", blockerId);
      fd.set("blockedId", blockedId);
      const result = await removeTaskDependency(fd);
      if (result.ok) {
        const res = await fetch(`/api/dependencies?taskId=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (data.ok) {
          setDeps({ blockedBy: data.blockedBy || [], blocks: data.blocks || [] });
        }
      }
    });
  }

  async function handleAddBlocker(blockerId: string) {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("blockerId", blockerId);
      fd.set("blockedId", id);
      const result = await addTaskDependency(fd);
      if (result.ok) {
        const res = await fetch(`/api/dependencies?taskId=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (data.ok) {
          setDeps({ blockedBy: data.blockedBy || [], blocks: data.blocks || [] });
          setShowPicker(false);
        }
      } else {
        setError(result.error || "Failed to add dependency");
      }
    });
  }

  async function handleShowPicker() {
    if (!allTasks) {
      try {
        const res = await fetch("/api/tasks-min");
        const data = await res.json();
        if (data.ok) setAllTasks(data.tasks || []);
      } catch {
        setError("Failed to load task list");
      }
    }
    setShowPicker(true);
  }

  const blockedByOpen = deps?.blockedBy?.filter((d) => d.status !== "done") ?? [];

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-[10px] uppercase tracking-wider text-white/45 mb-2">Dependencies</div>

      {blockedByOpen.length > 0 && (
        <div className="mb-3">
          <div className="text-[9px] text-white/40 mb-1">Blocked by (open)</div>
          <div className="space-y-1">
            {blockedByOpen.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 text-xs text-white/70 bg-red-500/10 border border-red-500/20 rounded px-2 py-1"
              >
                {onOpenTask ? (
                  <button
                    onClick={() => onOpenTask(d.appId)}
                    className="flex-1 min-w-0 truncate text-left hover:text-white hover:underline decoration-white/30"
                    title={`Open: ${d.title}`}
                  >
                    {d.title} <span className="text-white/35">↗</span>
                  </button>
                ) : (
                  <span className="flex-1 min-w-0 truncate">{d.title}</span>
                )}
                <button
                  onClick={() => handleRemove(d.id, taskId)}
                  disabled={pending}
                  className="text-red-400/60 hover:text-red-300 disabled:opacity-50 flex-shrink-0"
                  aria-label="Remove blocker"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(deps?.blocks?.length ?? 0) > 0 && (
        <div className="mb-3">
          <div className="text-[9px] text-white/40 mb-1">Blocks</div>
          <div className="space-y-1">
            {deps?.blocks?.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 text-xs text-white/70 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1"
              >
                {onOpenTask ? (
                  <button
                    onClick={() => onOpenTask(d.appId)}
                    className="flex-1 min-w-0 truncate text-left hover:text-white hover:underline decoration-white/30"
                    title={`Open: ${d.title}`}
                  >
                    {d.title} <span className="text-white/35">↗</span>
                  </button>
                ) : (
                  <span className="flex-1 min-w-0 truncate">{d.title}</span>
                )}
                <button
                  onClick={() => handleRemove(taskId, d.id)}
                  disabled={pending}
                  className="text-amber-400/60 hover:text-amber-300 disabled:opacity-50 flex-shrink-0"
                  aria-label="Remove blocked task"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        {showPicker && allTasks ? (
          <div className="space-y-2">
            {error && <div className="text-xs text-red-300">{error}</div>}
            <div className="text-[9px] text-white/40 mb-1">Add blocker</div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {allTasks
                .filter((t) => t.id !== taskId && !linkedIds.has(t.id))
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleAddBlocker(t.id)}
                    disabled={pending}
                    className="w-full text-left text-xs px-2 py-1 rounded bg-blue-500/15 border border-blue-500/30 text-blue-200 hover:bg-blue-500/25 disabled:opacity-50"
                  >
                    {t.title}
                  </button>
                ))}
            </div>
            <button
              onClick={() => setShowPicker(false)}
              className="w-full text-xs text-white/50 hover:text-white/70 py-1"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleShowPicker}
            className="text-xs text-blue-300 hover:text-blue-200 transition underline"
          >
            + add blocker
          </button>
        )}
      </div>
    </div>
  );
}

function RelatedTasksBlock({
  item,
  onOpenTask,
}: {
  item: ActionItem;
  onOpenTask?: (appId: string) => void;
}) {
  const taskId = item.dbId;
  const [relatedIds, setRelatedIds] = useState<string[]>(item.relatedIds || []);
  const [relatedTasks, setRelatedTasks] = useState<Array<{ id: string; title: string }> | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Guard: unsaved task can't have relations
  if (!taskId) return null;

  const id = taskId;

  useEffect(() => {
    let cancelled = false;
    setRelatedIds(item.relatedIds || []);
    async function fetchRelated() {
      try {
        const res = await fetch(`/api/related-tasks?taskId=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!cancelled && data.ok) {
          setRelatedIds(data.relatedIds || []);
        }
      } catch {
        // Silently ignore fetch errors
      }
    }
    fetchRelated();
    return () => {
      cancelled = true;
    };
  }, [id, item.relatedIds]);

  async function handleAddRelated() {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    setError(null);
    start(async () => {
      try {
        const res = await fetch("/api/related-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: id, relatedId: trimmed }),
        });
        const data = await res.json();
        if (data.ok) {
          setInputValue("");
          setShowPicker(false);
          const refreshRes = await fetch(`/api/related-tasks?taskId=${encodeURIComponent(id)}`);
          const refreshData = await refreshRes.json();
          if (refreshData.ok) {
            setRelatedIds(refreshData.relatedIds || []);
          }
        } else {
          setError(data.error || "Failed to add related task");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to add related task");
      }
    });
  }

  async function handleRemove(relatedId: string) {
    setError(null);
    start(async () => {
      try {
        const res = await fetch(
          `/api/related-tasks?taskId=${encodeURIComponent(id)}&relatedId=${encodeURIComponent(relatedId)}`,
          { method: "DELETE" }
        );
        const data = await res.json();
        if (data.ok) {
          const refreshRes = await fetch(`/api/related-tasks?taskId=${encodeURIComponent(id)}`);
          const refreshData = await refreshRes.json();
          if (refreshData.ok) {
            setRelatedIds(refreshData.relatedIds || []);
          }
        }
      } catch {
        // Silently ignore errors
      }
    });
  }

  async function handleShowPicker() {
    if (!relatedTasks) {
      try {
        const res = await fetch("/api/tasks-min");
        const data = await res.json();
        if (data.ok) setRelatedTasks(data.tasks || []);
      } catch {
        setError("Failed to load task list");
      }
    }
    setShowPicker(true);
  }

  const linkedIdSet = new Set(relatedIds);

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-[10px] uppercase tracking-wider text-white/45 mb-2">Related Tasks</div>

      {relatedIds.length > 0 && (
        <div className="mb-3 space-y-1">
          {relatedIds.map((relatedId) => (
            <div
              key={relatedId}
              className="flex items-center justify-between gap-2 text-xs text-white/70 bg-blue-500/10 border border-blue-500/20 rounded px-2 py-1"
            >
              {onOpenTask ? (
                <button
                  onClick={() => onOpenTask(relatedId)}
                  className="flex-1 min-w-0 truncate text-left hover:text-white hover:underline decoration-white/30"
                  title={`Open: ${relatedId}`}
                >
                  #{relatedId} <span className="text-white/35">↗</span>
                </button>
              ) : (
                <span className="flex-1 min-w-0 truncate">#{relatedId}</span>
              )}
              <button
                onClick={() => handleRemove(relatedId)}
                disabled={pending}
                className="text-blue-400/60 hover:text-blue-300 disabled:opacity-50 flex-shrink-0"
                aria-label="Remove relation"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        {showPicker ? (
          <div className="space-y-2">
            {error && <div className="text-xs text-red-300">{error}</div>}
            <div className="text-[9px] text-white/40 mb-1">Add by task number</div>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddRelated();
              }}
              placeholder="Enter task number (e.g., 123)"
              disabled={pending}
              className="w-full text-xs px-2 py-1.5 rounded bg-blue-500/10 border border-blue-500/30 text-white placeholder-white/30 focus:outline-none focus:border-blue-400/60 disabled:opacity-50"
              autoFocus
            />
            {relatedTasks && relatedTasks.length > 0 && inputValue && (
              <div className="max-h-32 overflow-y-auto space-y-1 border border-white/10 rounded p-1 bg-white/5">
                {relatedTasks
                  .filter((t) => {
                    const matches =
                      t.id.includes(inputValue) || t.title.toLowerCase().includes(inputValue.toLowerCase());
                    return matches && t.id !== taskId && !linkedIdSet.has(t.id);
                  })
                  .slice(0, 5)
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setInputValue(t.id);
                        handleAddRelated();
                      }}
                      className="w-full text-left text-xs px-2 py-0.5 rounded hover:bg-white/[0.06] text-white/70 hover:text-white transition truncate"
                    >
                      #{t.id} {t.title}
                    </button>
                  ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleAddRelated}
                disabled={pending || !inputValue.trim()}
                className="flex-1 text-xs text-white/70 hover:text-white py-1 px-2 rounded border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-50 transition"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowPicker(false);
                  setInputValue("");
                  setError(null);
                }}
                className="flex-1 text-xs text-white/50 hover:text-white/70 py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleShowPicker}
            className="text-xs text-blue-300 hover:text-blue-200 transition underline"
          >
            + add by number
          </button>
        )}
      </div>
    </div>
  );
}

function SubtasksBlock({
  item,
  allItems,
  onOpenTask,
}: {
  item: ActionItem;
  allItems?: ActionItem[];
  onOpenTask?: (appId: string) => void;
}) {
  const taskId = item.dbId;
  const [subtasks, setSubtasks] = useState<ActionItem[]>(item.subtasks || []);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!taskId) return null;

  const id = taskId; // Type-narrowed after guard

  const completedCount = subtasks.filter((s) => s.status === "DONE").length;
  const totalCount = subtasks.length;

  async function handleCreateSubtask() {
    if (!newTitle.trim()) return;
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("parentTaskId", id);
      fd.set("title", newTitle);
      const result = await createSubtask(fd);
      if (result.ok) {
        setNewTitle("");
        setShowCreateForm(false);
      } else {
        setError(result.error || "Failed to create subtask");
      }
    });
  }

  async function handleLinkSubtask(subtaskId: string) {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("parentTaskId", id);
      fd.set("subtaskId", subtaskId);
      const result = await linkSubtask(fd);
      if (result.ok) {
        setShowPicker(false);
      } else {
        setError(result.error || "Failed to link subtask");
      }
    });
  }

  async function handleUnlinkSubtask(subtaskId: string) {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("subtaskId", subtaskId);
      const result = await unlinkSubtask(fd);
      if (!result.ok) {
        setError(result.error || "Failed to unlink subtask");
      }
    });
  }

  const availableTasks = allItems?.filter(
    (t) => t.id !== id && !t.parentTaskId && !subtasks.some((s) => s.id === t.id),
  ) || [];

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-[10px] uppercase tracking-wider text-white/45 mb-2 flex items-center justify-between">
        <span>Subtasks</span>
        {totalCount > 0 && (
          <span className="text-[9px] text-white/35">
            {completedCount}/{totalCount} done
          </span>
        )}
      </div>

      {subtasks.length > 0 && (
        <div className="mb-3 space-y-1">
          {subtasks.map((subtask) => (
            <div
              key={subtask.id}
              className="flex items-center justify-between gap-2 text-xs text-white/70 bg-blue-500/10 border border-blue-500/20 rounded px-2 py-1.5"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span
                  className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                    subtask.status === "DONE"
                      ? "bg-emerald-400"
                      : subtask.status === "WIP"
                      ? "bg-amber-400"
                      : subtask.status === "BLOCKED"
                      ? "bg-red-400"
                      : "bg-slate-400"
                  }`}
                />
                {onOpenTask ? (
                  <button
                    onClick={() => onOpenTask(subtask.id)}
                    className="text-left truncate text-blue-300 hover:text-blue-200 hover:underline transition flex-1 min-w-0"
                    title={`Open: ${subtask.title}`}
                  >
                    {subtask.title}
                  </button>
                ) : (
                  <span className="truncate flex-1 min-w-0">{subtask.title}</span>
                )}
              </div>
              <button
                onClick={() => handleUnlinkSubtask(subtask.id)}
                disabled={pending}
                className="text-blue-400/60 hover:text-blue-300 disabled:opacity-50 flex-shrink-0"
                aria-label="Remove subtask"
                title="Remove from this task"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {error && <div className="text-xs text-red-300">{error}</div>}

        {showCreateForm ? (
          <div className="space-y-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New subtask title..."
              disabled={pending}
              className="w-full rounded-lg bg-[#0b1220] border border-white/10 px-2 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateSubtask();
                if (e.key === "Escape") setShowCreateForm(false);
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateSubtask}
                disabled={pending || !newTitle.trim()}
                className="flex-1 text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium transition disabled:opacity-50"
              >
                {pending ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="flex-1 text-xs px-2 py-1 rounded text-white/50 hover:text-white/70 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full text-xs text-blue-300 hover:text-blue-200 transition underline"
          >
            + add subtask
          </button>
        )}

        {showPicker && availableTasks.length > 0 ? (
          <div className="space-y-2">
            <div className="text-[9px] text-white/40 mb-1">Import existing task</div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {availableTasks.slice(0, 10).map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleLinkSubtask(t.id)}
                  disabled={pending}
                  className="w-full text-left text-xs px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50 truncate"
                >
                  {t.title}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowPicker(false)}
              className="w-full text-xs text-white/50 hover:text-white/70 py-1"
            >
              Cancel
            </button>
          </div>
        ) : (
          availableTasks.length > 0 && (
            <button
              onClick={() => setShowPicker(true)}
              className="w-full text-xs text-emerald-300 hover:text-emerald-200 transition underline"
            >
              + import existing todo
            </button>
          )
        )}
      </div>
    </div>
  );
}

// RelatedBlock: auto-suggested tasks that share a brand, owner, or category
// with the current one — relationships you never had to wire up by hand.
// Computed from the board's loaded items (so everything shown is openable),
// scored brand > owner > category, freshest first, capped. Excludes the task
// itself and archived/TRIAGE.
const STATUS_DOT: Record<string, string> = {
  TRIAGE: "bg-fuchsia-400",
  TODO: "bg-slate-400",
  WIP: "bg-amber-400",
  BLOCKED: "bg-red-400",
  DONE: "bg-emerald-400",
};

function RelatedBlock({
  item,
  allItems,
  onOpenTask,
}: {
  item: ActionItem;
  allItems: ActionItem[];
  onOpenTask: (appId: string) => void;
}) {
  const related = (() => {
    const myBrands = new Set((item.brands ?? []).filter(Boolean));
    const myOwner = String(item.owner ?? "").trim().toLowerCase();
    const ownerReal = myOwner && myOwner !== "open" && myOwner !== "both";

    const scored = allItems
      .filter((t) => t.id !== item.id && !t.archivedAt && t.status !== "TRIAGE")
      .map((t) => {
        const reasons: string[] = [];
        let score = 0;
        for (const b of t.brands ?? []) {
          if (myBrands.has(b)) {
            score += 3;
            reasons.push(b);
          }
        }
        if (ownerReal && String(t.owner ?? "").trim().toLowerCase() === myOwner) {
          score += 2;
          reasons.push(String(t.owner));
        }
        if (t.category && item.category && t.category === item.category) {
          score += 1;
          reasons.push(String(t.category));
        }
        // De-prioritize already-done tasks so live work surfaces first.
        if (t.status === "DONE") score -= 2;
        return { t, score, reason: reasons[0] ?? "" };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.t.updatedAt).getTime() - new Date(a.t.updatedAt).getTime();
      })
      .slice(0, 6);
    return scored;
  })();

  if (related.length === 0) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-[10px] uppercase tracking-wider text-white/45 mb-2">Related (by brand/owner/category)</div>
      <div className="space-y-1">
        {related.slice(0, 3).map(({ t, reason }) => (
          <button
            key={t.id}
            onClick={() => onOpenTask(t.id)}
            className="w-full flex items-center gap-2 text-left text-xs text-white/70 rounded px-2 py-1 hover:bg-white/[0.06] hover:text-white transition"
            title={`Open: ${t.title}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[t.status] ?? "bg-white/30"}`} />
            <span className="flex-1 min-w-0 truncate">{t.title}</span>
            {reason && (
              <span className="flex-shrink-0 text-[9px] text-white/35 truncate max-w-[40%]">{reason}</span>
            )}
          </button>
        ))}
        {related.length > 3 && (
          <p className="text-[9px] text-white/25 px-2 py-1 italic">+{related.length - 3} more</p>
        )}
      </div>
    </div>
  );
}

function OriginBlock({ item }: { item: ActionItem }) {
  const origin = resolveSource(item);

  // Hooks must run unconditionally (Rules of Hooks) — declare them BEFORE any
  // early return, or React crashes ("rendered more hooks…") if a task gains an
  // origin while the panel is open.
  const [liveStatus, setLiveStatus] = useState<{
    state: "open" | "closed" | "merged" | "unknown";
    title: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (origin.kind !== "pr" || !origin.needsLiveStatus || !origin.refId) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(`/api/source-status?pr=${encodeURIComponent(origin.refId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.ok && data.status) {
          setLiveStatus(data.status);
        }
      })
      .catch(() => {
        // Silently ignore fetch errors
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [origin.kind, origin.needsLiveStatus, origin.refId]);

  if (origin.kind === "none" || !origin.url) {
    return null;
  }

  const stateColors: Record<"open" | "closed" | "merged" | "unknown", string> = {
    open: "bg-sky-500/20 text-sky-200 border-sky-500/30",
    closed: "bg-zinc-500/20 text-zinc-200 border-zinc-500/30",
    merged: "bg-emerald-500/20 text-emerald-200 border-emerald-500/30",
    unknown: "hidden",
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-[10px] uppercase tracking-wider text-white/45 mb-2">Origin</div>
      <div className="flex items-center gap-2">
        <a
          href={origin.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-300 hover:text-blue-200 transition underline"
        >
          {origin.label}
          <span className="ml-1 inline">↗</span>
        </a>
        {origin.kind === "pr" && liveStatus && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
              stateColors[liveStatus.state]
            }`}
          >
            {liveStatus.state}
          </span>
        )}
        {origin.kind === "pr" && loading && (
          <span className="text-[10px] text-white/45">...</span>
        )}
      </div>
    </div>
  );
}

function DetailsPanel({
  item,
  currentUser,
  onClose,
  projects,
  onOpenTask,
  allItems,
}: {
  item: ActionItem;
  currentUser: string;
  onClose: () => void;
  projects?: Array<{ id: string; slug: string; name: string }>;
  onOpenTask?: (appId: string) => void;
  allItems?: ActionItem[];
}) {
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<"saved" | null>(null);
  // Optimistic status so the dropdown doesn't snap back to the old value while
  // the patch is in flight (revalidate can take a second or two). Re-syncs to
  // the server value once `item` refreshes (or on a blocked/failed change).
  const [statusValue, setStatusValue] = useState<ActionStatus>(item.status);
  useEffect(() => setStatusValue(item.status), [item.status]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Multi-assignee: live roster for the people checkboxes (active team_members),
  // with the hardcoded OWNERS as a fallback before the fetch lands. Optimistic
  // local selection so a tap doesn't wait on the round-trip.
  const [people, setPeople] = useState<Array<{ slug: string; name: string }>>(
    OWNERS.filter((o) => o !== "Both" && o !== "Open").map((o) => ({ slug: o.toLowerCase(), name: o })),
  );
  useEffect(() => {
    let cancelled = false;
    fetch("/api/team")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { people?: Array<{ slug: string; name: string }> } | null) => {
        if (!cancelled && d?.people && d.people.length > 0) setPeople(d.people);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const [assigneeList, setAssigneeList] = useState<string[]>(effectiveAssignees(item));
  useEffect(() => setAssigneeList(effectiveAssignees(item)), [item]);
  // Assignee modal state
  const [showAssigneeModal, setShowAssigneeModal] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  function toggleAssignee(slug: string) {
    const next = assigneeList.includes(slug)
      ? assigneeList.filter((s) => s !== slug)
      : [...assigneeList, slug];
    const fd = new FormData();
    fd.set("id", item.id);
    for (const s of next) fd.append("assignees", s);
    start(async () => {
      await setAssigneesAction(fd);
      // Only update optimistic state AFTER server confirms (item refresh syncs it)
      setFlash("saved");
      setTimeout(() => setFlash(null), 2000);
    });
  }
  // Notes autosave to localStorage so a crash/reload/background-refresh never
  // wipes a long write-up (Jose's lost feedback). commit() drops the draft on a
  // successful save without blanking the field.
  const notesDraft = useDraft(`zao-draft:notes:${item.id}`, item.notes ?? "");

  // Controlled state for every field so we can detect changes and auto-save.
  const [titleValue, setTitleValue] = useState(item.title);
  const [videoUrlValue, setVideoUrlValue] = useState(item.videoUrl ?? "");
  // Reset controlled fields when the item changes (e.g. another task opened).
  useEffect(() => {
    setTitleValue(item.title);
    setVideoUrlValue(item.videoUrl ?? "");
  }, [item.id, item.title, item.videoUrl]);

  // Debounce helper — fires the value only after `delay` ms of no changes.
  function useDebounce<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
      const t = setTimeout(() => setDebounced(value), delay);
      return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
  }

  const debouncedTitle = useDebounce(titleValue, 600);
  const debouncedVideoUrl = useDebounce(videoUrlValue, 600);
  const debouncedNotes = useDebounce(notesDraft.value, 800);

  // Track whether we've mounted yet so we don't fire on the initial render.
  const mountedRef = useRef(false);
  useEffect(() => { mountedRef.current = true; }, []);

  // Auto-save debounced fields to the server.
  useEffect(() => {
    if (!mountedRef.current) return;
    if (debouncedTitle && debouncedTitle !== item.title) quickPatch("title", debouncedTitle);
  }, [debouncedTitle]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mountedRef.current) return;
    if (debouncedVideoUrl !== (item.videoUrl ?? "")) quickPatch("videoUrl", debouncedVideoUrl);
  }, [debouncedVideoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mountedRef.current) return;
    if (debouncedNotes !== (item.notes ?? "")) {
      quickPatch("notes", debouncedNotes);
      notesDraft.commit();
    }
  }, [debouncedNotes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply a single field immediately — no Save button needed.
  function quickPatch(field: string, value: string) {
    const fd = new FormData();
    fd.set("id", item.id);
    fd.set("field", field);
    fd.set("value", value);
    start(async () => {
      await patchField(fd);
      setFlash("saved");
      setTimeout(() => setFlash(null), 2000);
    });
  }

  function handlePublicOverride(value: "inherit" | "show" | "hide") {
    if (!item.dbId) return;
    const fd = new FormData();
    fd.set("taskId", item.dbId);
    fd.set("value", value);
    start(async () => {
      const result = await setTaskPublicOverride(fd);
      if (!result.ok) {
        // Error handled server-side
      }
    });
  }

  return (
    <div className="p-5 space-y-5 flex-1">
      <OriginBlock item={item} />
      <DependenciesBlock item={item} onOpenTask={onOpenTask} />
      <RelatedTasksBlock item={item} onOpenTask={onOpenTask} />
      <SubtasksBlock item={item} allItems={allItems} onOpenTask={onOpenTask} />
      {onOpenTask && allItems && allItems.length > 0 && (
        <RelatedBlock item={item} allItems={allItems} onOpenTask={onOpenTask} />
      )}

      {/* Advanced section (collapsed by default) */}
      <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left text-[11px] uppercase tracking-wider text-white/45 hover:text-white/65 transition"
        >
          <span className={`inline-block transition ${showAdvanced ? "rotate-90" : ""}`}>▶</span>
          Advanced
        </button>
        {showAdvanced && (
          <div className="border-t border-white/10 p-4 space-y-3">
            <FormField label="Service class">
              <select
                defaultValue={item.serviceClass ?? "Standard"}
                onChange={(e) => quickPatch("serviceClass", e.target.value)}
                disabled={pending}
                className={selectCls}
              >
                {SERVICE_CLASSES.map((sc) => (
                  <option key={sc} value={sc}>
                    {SERVICE_CLASS_LABELS[sc]}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Task Type">
              <select
                defaultValue={item.taskType || "task"}
                onChange={(e) => quickPatch("taskType", e.target.value)}
                disabled={pending}
                className={selectCls}
              >
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TASK_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </FormField>

            {item.dbId && (
              <FormField label="Public visibility">
                <div className="flex gap-2">
                  {(["inherit", "show", "hide"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={pending}
                      onClick={() => handlePublicOverride(opt)}
                      className={`text-xs px-3 py-1.5 rounded border transition disabled:opacity-50 ${
                        item.publicOverride === null && opt === "inherit"
                          ? "bg-blue-500/20 text-blue-200 border-blue-500/40"
                          : item.publicOverride === true && opt === "show"
                            ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/40"
                            : item.publicOverride === false && opt === "hide"
                              ? "bg-red-500/20 text-red-200 border-red-500/40"
                              : "text-white/50 border-white/10 hover:text-white/75"
                      }`}
                    >
                      {opt === "inherit" ? "Inherit" : opt === "show" ? "Show" : "Hide"}
                    </button>
                  ))}
                </div>
              </FormField>
            )}
          </div>
        )}
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] text-white/45 mb-1 uppercase tracking-wider">Title</label>
          <input
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            disabled={pending}
            className="w-full rounded-lg bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition disabled:opacity-50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Status">
            <select
              value={statusValue}
              onChange={(e) => {
                setStatusValue(e.target.value as ActionStatus);
                quickPatch("status", e.target.value);
              }}
              disabled={pending}
              className={selectCls}
            >
              {BOARD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Priority">
            <select
              defaultValue={item.priority}
              onChange={(e) => quickPatch("priority", e.target.value)}
              disabled={pending}
              className={selectCls}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </FormField>

          {projects && projects.length > 0 && (
            <FormField label="Project">
              <select
                defaultValue={item.projectId ?? ""}
                onChange={(e) => quickPatch("projectId", e.target.value)}
                disabled={pending}
                className={selectCls}
              >
                <option value="">(none)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          <FormField label="Assignees">
            <div className="space-y-2">
              {/* Assigned pills */}
              <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                {assigneeList.length === 0 ? (
                  <span className="text-[11px] text-white/35 py-1">Unassigned</span>
                ) : (
                  assigneeList.map((slug) => {
                    const person = people.find((p) => p.slug === slug);
                    return (
                      <button
                        key={slug}
                        type="button"
                        disabled={pending}
                        onClick={() => toggleAssignee(slug)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-500/50 text-blue-100 text-xs hover:bg-blue-500/30 transition disabled:opacity-50"
                        title={`Click to remove ${person?.name ?? slug}`}
                      >
                        <span className="w-5 h-5 rounded-full bg-blue-600/40 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                          {(person?.name ?? slug).charAt(0).toUpperCase()}
                        </span>
                        <span>{person?.name ?? slug}</span>
                        <span className="ml-0.5 text-white/50">x</span>
                      </button>
                    );
                  })
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setShowAssigneeModal(true)}
                  className="px-2.5 py-1 rounded-full text-xs border border-white/20 text-white/60 hover:text-white/85 hover:border-white/40 transition disabled:opacity-50"
                >
                  + Add
                </button>
              </div>

              {/* Assignee modal */}
              {showAssigneeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                  <div className="bg-[#07111e] border border-white/10 rounded-xl w-80 max-h-80 flex flex-col">
                    <div className="p-4 border-b border-white/10">
                      <input
                        type="text"
                        value={assigneeSearch}
                        onChange={(e) => setAssigneeSearch(e.target.value.toLowerCase())}
                        placeholder="Search people..."
                        autoFocus
                        className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/25"
                      />
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1 p-2">
                      {people
                        .filter((p) => p.name.toLowerCase().includes(assigneeSearch) || p.slug.includes(assigneeSearch))
                        .map((p) => {
                          const checked = assigneeList.includes(p.slug);
                          return (
                            <button
                              key={p.slug}
                              type="button"
                              disabled={pending}
                              onClick={() => toggleAssignee(p.slug)}
                              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition disabled:opacity-50 ${
                                checked
                                  ? "bg-blue-500/20 border border-blue-500/50 text-blue-100"
                                  : "text-white/70 hover:bg-white/5"
                              }`}
                            >
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${checked ? "bg-blue-600/40" : "bg-white/10"}`}>
                                {p.name.charAt(0).toUpperCase()}
                              </span>
                              <span className="flex-1">{p.name}</span>
                              {checked && <span className="text-blue-300">✓</span>}
                            </button>
                          );
                        })}
                    </div>
                    <div className="p-3 border-t border-white/10 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAssigneeModal(false);
                          setAssigneeSearch("");
                        }}
                        className="flex-1 px-3 py-1.5 rounded-lg text-xs border border-white/20 text-white/60 hover:text-white/85 transition"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </FormField>

          <FormField label="DMAIC Phase">
            <select
              defaultValue={item.phase}
              onChange={(e) => quickPatch("phase", e.target.value)}
              disabled={pending}
              className={selectCls}
            >
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Category">
            <select
              defaultValue={String(item.category)}
              onChange={(e) => quickPatch("category", e.target.value)}
              disabled={pending}
              className={selectCls}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Due Date">
            <input
              type="date"
              defaultValue={item.due}
              onChange={(e) => quickPatch("due", e.target.value)}
              disabled={pending}
              className="w-full rounded-lg bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition disabled:opacity-50"
            />
          </FormField>

          <div className="col-span-2">
            <FormField label="Video walkthrough URL (Loom / YouTube / Vimeo)">
              <input
                value={videoUrlValue}
                onChange={(e) => setVideoUrlValue(e.target.value)}
                placeholder="https://loom.com/share/..."
                disabled={pending}
                className="w-full rounded-lg bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50 transition disabled:opacity-50"
              />
            </FormField>
            {item.videoUrl && (
              <div className="mt-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
                <div className="text-[10px] uppercase tracking-wider text-violet-300 mb-1">Current video</div>
                <a
                  href={item.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-violet-200 hover:text-white underline break-all"
                >
                  {item.videoUrl}
                </a>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2.5 pt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                defaultChecked={item.important}
                onChange={(e) => quickPatch("important", e.target.checked ? "1" : "0")}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm text-white/75">Important</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                defaultChecked={item.urgent}
                onChange={(e) => quickPatch("urgent", e.target.checked ? "1" : "0")}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm text-white/75">Urgent</span>
            </label>
          </div>
        </div>

        <FormField label="Notes (Customer / Success / Measurements)">
          <textarea
            value={notesDraft.value}
            onChange={(e) => notesDraft.update(e.target.value)}
            rows={5}
            className="w-full rounded-lg bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-blue-500/50 transition"
          />
        </FormField>

        {/* Approval workflow toggle */}
        <div className="flex items-center justify-between gap-3 rounded-xl bg-black/25 border border-white/10 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white/90">Require Approval</p>
            <p className="text-[11px] text-white/45 mt-0.5">
              Updates from workers must be reviewed before taking effect
            </p>
          </div>
          <input
            type="checkbox"
            defaultChecked={item.requiresApproval}
            onChange={(e) => quickPatch("requiresApproval", e.target.checked ? "1" : "0")}
            className="h-5 w-5 rounded flex-shrink-0"
          />
        </div>

        {/* Auto-save status indicator */}
        {(pending || flash === "saved") && (
          <p className="text-center text-xs text-white/40">
            {pending ? "Saving…" : "✓ Saved"}
          </p>
        )}
      </div>

      {/* Metadata + delete */}
      <div className="border-t border-white/10 pt-4 space-y-2">
        <div className="text-[11px] text-white/35 space-y-1">
          <div>Created {relativeTime(item.createdAt)}{item.createdBy ? ` by ${item.createdBy}` : ""}</div>
          {item.updatedAt && item.updatedAt !== item.createdAt && (
            <div>Last updated {relativeTime(item.updatedAt)}</div>
          )}
          {item.completedAt && (
            <div>
              Completed {relativeTime(item.completedAt)}
              {item.completedBy ? ` by ${item.completedBy}` : ""}
            </div>
          )}
        </div>
        <DeleteSection id={item.id} onDone={onClose} />
      </div>
    </div>
  );
}

function DeleteSection({ id, onDone }: { id: string; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);

  if (!confirm) {
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="text-xs text-red-400/70 hover:text-red-300 transition"
      >
        Delete task
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-red-300">Delete this task?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const fd = new FormData();
          fd.set("id", id);
          // Close only after the delete actually succeeds — closing first hid
          // failures and the task silently reappeared on next refresh (doc 766
          // finding #11).
          start(async () => {
            await deleteItem(fd);
            onDone();
          });
        }}
        className="rounded border border-red-500/40 text-red-300 hover:bg-red-500/15 px-2 py-1 transition disabled:opacity-50"
      >
        Yes, delete
      </button>
      <button
        type="button"
        onClick={() => setConfirm(false)}
        className="text-white/40 hover:text-white/70 transition"
      >
        cancel
      </button>
    </div>
  );
}

function LogPanel({ item, currentUser }: { item: ActionItem; currentUser: string }) {
  const comments = item.comments || [];
  const updates = item.updates || [];
  const activity = item.activity || [];
  const pendingUpdates = updates.filter((u) => u.reviewStatus === "pending");

  type TimelineEntry =
    | { type: "activity"; data: ActivityEvent }
    | { type: "update"; data: TaskUpdate };

  const timeline: TimelineEntry[] = [
    ...activity.map((a) => ({ type: "activity" as const, data: a })),
    ...updates.map((u) => ({ type: "update" as const, data: u })),
  ].sort(
    (a, b) => new Date(a.data.createdAt).getTime() - new Date(b.data.createdAt).getTime(),
  );

  return (
    <div className="p-5 space-y-7">
      {/* Unified Comment & Update Box */}
      <UnifiedUpdateBox item={item} currentUser={currentUser} />

      {/* Review Queue */}
      {pendingUpdates.length > 0 && (
        <ReviewQueue item={item} pendingUpdates={pendingUpdates} />
      )}

      {/* Activity Timeline */}
      <section>
        <h3 className="text-[10px] uppercase tracking-widest text-white/35 mb-3 font-semibold">
          Activity Timeline
        </h3>
        <div className="space-y-4 relative before:absolute before:left-3.5 before:top-1 before:bottom-1 before:w-px before:bg-white/[0.06]">
          {/* Creation */}
          <TimelineDot
            icon="+"
            text={`Task created${item.createdBy ? ` by ${item.createdBy}` : ""}`}
            time={item.createdAt}
          />
          {timeline.map((entry) => {
            if (entry.type === "activity") {
              const a = entry.data;
              return (
                <TimelineDot
                  key={a.id}
                  icon={activityIcon(a.action)}
                  text={formatActivity(a)}
                  time={a.createdAt}
                />
              );
            }
            if (entry.type === "update") {
              const u = entry.data;
              return (
                <UpdateCard key={u.id} update={u} />
              );
            }
            return null;
          })}

          {timeline.length === 0 && (
            <p className="pl-7 text-xs text-white/30 italic">No activity yet. Submit an update or leave a comment to get started.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function UnifiedUpdateBox({ item, currentUser }: { item: ActionItem; currentUser: string }) {
  const [pending, start] = useTransition();
  const { value: content, update: setContent, clear: clearContent } = useDraft(
    `zao-draft:comment:${item.id}`,
  );
  const [toStatus, setToStatus] = useState<ActionStatus | "">("");
  const [isUpdate, setIsUpdate] = useState(false); // false=comment, true=update+status
  const [isMac, setIsMac] = useState(false);
  const [silent, setSilent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const comments = item.comments || [];

  useEffect(() => {
    setIsMac(/Mac/i.test(navigator.platform || navigator.userAgent || ""));
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem("zao-comment-silent-default") === "1") {
      setSilent(true);
    }
  }, []);

  function handleSubmit() {
    if (!content.trim()) return;
    setError(null);
    if (isUpdate) {
      const fd = new FormData();
      fd.set("id", item.id);
      fd.set("content", content);
      if (toStatus) fd.set("toStatus", toStatus);
      start(async () => {
        await submitUpdate(fd);
        clearContent();
        setToStatus("");
        setIsUpdate(false);
      });
    } else {
      const fd = new FormData();
      fd.set("id", item.id);
      fd.set("content", content);
      fd.set("silent", silent ? "1" : "0");
      start(async () => {
        const res = await addComment(fd);
        if (res?.error) {
          setError(res.error);
          return;
        }
        clearContent();
      });
    }
  }

  return (
    <section>
      <h3 className="text-[10px] uppercase tracking-widest text-white/35 mb-3 font-semibold">
        Activity
      </h3>

      {/* Comments list */}
      {comments.length > 0 && (
        <div className="space-y-3 mb-4">
          {comments.map((c) => (
            <CommentCard key={c.id} comment={c} taskId={item.id} currentUser={currentUser} />
          ))}
        </div>
      )}

      {/* Unified input */}
      <div className="rounded-xl border border-white/10 bg-black/25 overflow-hidden">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={isUpdate ? "What progress have you made? What's next?" : `Leave a comment... tag with @name (${isMac ? "⌘" : "Ctrl"}+Enter to send)`}
          rows={3}
          className="w-full bg-transparent px-4 pt-4 pb-2 text-sm text-white/80 placeholder-white/25 resize-none focus:outline-none"
        />
        {error && (
          <p className="px-4 pb-1 text-[11px] text-red-300 break-words">{error}</p>
        )}
        <div className="flex items-center gap-2 px-4 pb-3">
          {!isUpdate && (
            <label className="flex items-center gap-1.5 text-[11px] text-white/45 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={silent}
                onChange={(e) => setSilent(e.target.checked)}
                className="h-3.5 w-3.5 rounded"
              />
              Silent
            </label>
          )}
          {isUpdate && (
            <select
              value={toStatus}
              onChange={(e) => setToStatus(e.target.value as ActionStatus | "")}
              className="flex-1 rounded-lg bg-[#0b1220] border border-white/10 px-2.5 py-1.5 text-xs text-white/80 focus:outline-none"
            >
              <option value="">Move to (optional)</option>
              {BOARD_STATUSES.filter((s) => s !== item.status).map((s) => (
                <option key={s} value={s}>
                  → {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-1.5 ml-auto">
            {!isUpdate && (
              <button
                type="button"
                onClick={() => setIsUpdate(true)}
                disabled={!content.trim()}
                className="px-2.5 py-1.5 rounded-lg text-xs border border-white/10 text-white/60 hover:text-white/85 transition disabled:opacity-50"
                title="Switch to update mode"
              >
                Update
              </button>
            )}
            {isUpdate && (
              <button
                type="button"
                onClick={() => setIsUpdate(false)}
                disabled={!content.trim()}
                className="px-2.5 py-1.5 rounded-lg text-xs border border-white/10 text-white/60 hover:text-white/85 transition disabled:opacity-50"
                title="Switch to comment mode"
              >
                Comment
              </button>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending || !content.trim()}
              className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-1.5 text-xs font-semibold transition disabled:opacity-40 whitespace-nowrap"
            >
              {pending
                ? isUpdate ? "Submitting..." : "Sending…"
                : isUpdate
                ? item.requiresApproval ? "Submit for Review" : "Submit Update"
                : "Send"}
            </button>
          </div>
        </div>
        {item.requiresApproval && isUpdate && (
          <p className="px-4 pb-3 text-[10px] text-amber-300/60">
            This task requires lead approval — status changes take effect once approved.
          </p>
        )}
      </div>
    </section>
  );
}

function ReviewQueue({
  item,
  pendingUpdates,
}: {
  item: ActionItem;
  pendingUpdates: TaskUpdate[];
}) {
  return (
    <section>
      <h3 className="text-[10px] uppercase tracking-widest text-amber-400/60 mb-3 font-semibold">
        Review Queue ({pendingUpdates.length})
      </h3>
      <div className="space-y-3">
        {pendingUpdates.map((u) => (
          <ReviewCard key={u.id} item={item} update={u} />
        ))}
      </div>
    </section>
  );
}

function ReviewCard({ item, update }: { item: ActionItem; update: TaskUpdate }) {
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState("");

  function decide(decision: "approved" | "rejected" | "changes_requested") {
    const fd = new FormData();
    fd.set("id", item.id);
    fd.set("updateId", update.id);
    fd.set("decision", decision);
    if (notes.trim()) fd.set("reviewNotes", notes.trim());
    start(() => reviewUpdate(fd));
  }

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        {userAvatar(update.submittedBy, update.displayName, "h-6 w-6 text-[10px]")}
        <div className="flex-1 min-w-0">
          <span className="text-xs text-white/80 font-medium">{update.displayName}</span>
          {update.toStatus && (
            <span className="ml-1.5 text-[10px] text-white/45">
              requesting → {STATUS_LABEL[update.toStatus]}
            </span>
          )}
          <div className="text-[10px] text-white/30 mt-0.5">{relativeTime(update.createdAt)}</div>
        </div>
      </div>
      <p className="text-sm text-white/75 whitespace-pre-wrap leading-relaxed">{update.content}</p>
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Review note (optional)"
        className="w-full rounded-lg bg-[#0b1220] border border-white/10 px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/25"
      />
      <div className="flex gap-2">
        <button
          onClick={() => decide("approved")}
          disabled={pending}
          className="flex-1 rounded-lg bg-emerald-700/60 hover:bg-emerald-600/80 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40"
        >
          Approve
        </button>
        <button
          onClick={() => decide("changes_requested")}
          disabled={pending}
          className="flex-1 rounded-lg bg-orange-700/60 hover:bg-orange-600/80 border border-orange-500/30 px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40"
        >
          Needs Changes
        </button>
        <button
          onClick={() => decide("rejected")}
          disabled={pending}
          className="flex-1 rounded-lg bg-red-800/60 hover:bg-red-700/80 border border-red-500/30 px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

function UpdateCard({ update }: { update: TaskUpdate }) {
  return (
    <div
      className={`pl-1 flex gap-3`}
    >
      {userAvatar(update.submittedBy, update.displayName)}
      <div className="flex-1 min-w-0">
        <div
          className={`rounded-xl border p-3 ${
            update.reviewStatus === "pending"
              ? "border-amber-500/20 bg-amber-500/5"
              : update.reviewStatus === "approved"
              ? "border-emerald-500/20 bg-emerald-500/5"
              : "border-red-500/20 bg-red-500/5"
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[11px] text-white/50">
              <span className="text-white/80 font-medium">{update.displayName}</span>
              {" submitted update"}
              {update.toStatus && (
                <span className="ml-1 text-white/40">→ {STATUS_LABEL[update.toStatus]}</span>
              )}
              {" · "}
              {relativeTime(update.createdAt)}
            </div>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium whitespace-nowrap ${REVIEW_BADGE[update.reviewStatus] ?? ""}`}
            >
              {(update.reviewStatus ?? "pending").replace("_", " ")}
            </span>
          </div>
          <p className="text-sm text-white/75 whitespace-pre-wrap leading-relaxed">{update.content}</p>
          {update.reviewNotes && (
            <p className="mt-2 text-[11px] text-white/40 italic border-t border-white/10 pt-2">
              Review: {update.reviewNotes}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function CommentCard({
  comment: c,
  taskId,
  currentUser,
}: {
  comment: Comment;
  taskId: string;
  currentUser: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.content);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isOwn = c.userId === currentUser;

  function save() {
    if (!draft.trim() || draft === c.content) { setEditing(false); return; }
    setError(null);
    const fd = new FormData();
    fd.set("taskId", taskId);
    fd.set("commentId", c.id);
    fd.set("content", draft);
    startSave(async () => {
      const res = await editComment(fd);
      if (res?.error) { setError(res.error); return; }
      setEditing(false);
    });
  }

  return (
    <div className="flex gap-3">
      {userAvatar(c.userId, c.displayName)}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] text-white/75 font-medium">{c.displayName}</span>
          <span className="text-[11px] text-white/35">{relativeTime(c.createdAt)}</span>
          {c.editedAt && <span className="text-[10px] text-white/25 italic">(edited)</span>}
          {isOwn && !editing && (
            <button
              onClick={() => { setDraft(c.content); setEditing(true); }}
              className="text-white/30 hover:text-white/70 transition ml-1"
              title="Edit comment"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}
        </div>
        {editing ? (
          <div className="space-y-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
                if (e.key === "Escape") setEditing(false);
              }}
              rows={3}
              autoFocus
              className="w-full rounded-lg bg-[#0b1220] border border-white/15 px-3 py-2 text-sm text-white/85 resize-none focus:outline-none focus:border-zao-accent/60"
            />
            {error && <p className="text-[11px] text-red-300">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="px-3 py-1 text-xs font-medium rounded-md bg-zao-accent/20 border border-zao-accent/40 text-zao-accent hover:bg-zao-accent/30 transition disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1 text-xs text-white/45 hover:text-white/70 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{c.content}</p>
        )}
      </div>
    </div>
  );
}

function TimelineDot({ icon, text, time }: { icon: string; text: string; time: string }) {
  return (
    <div className="flex items-start gap-3 pl-1">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-[10px] text-white/50">
        {icon}
      </div>
      <div className="flex-1 min-w-0 pt-1">
        <span className="text-xs text-white/55">{text}</span>
        <span className="ml-2 text-[10px] text-white/25">{relativeTime(time)}</span>
      </div>
    </div>
  );
}

function activityIcon(action: string): string {
  if (action === "created") return "+";
  if (action === "status_changed") return "↔";
  if (action === "commented") return "💬";
  if (action === "update_submitted") return "↑";
  if (action === "review_approved") return "✓";
  if (action === "review_rejected") return "✕";
  if (action === "review_changes_requested") return "~";
  return "·";
}

function formatActivity(a: ActivityEvent): string {
  const dn = a.displayName;
  if (a.action === "status_changed") return `${dn} changed status${a.detail ? ` (${a.detail})` : ""}`;
  if (a.action === "commented") return `${dn} commented`;
  if (a.action === "update_submitted") return `${dn} ${a.detail || "submitted an update"}`;
  if (a.action === "review_approved") return `${dn} approved the update`;
  if (a.action === "review_rejected") return `${dn} rejected the update`;
  if (a.action === "review_changes_requested") return `${dn} requested changes`;
  if (a.action === "created") return `Task created by ${dn}`;
  return `${dn}: ${a.action}`;
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-white/45 mb-1 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

// CopyLinkButton (Phase H): builds the /todo/<id> permalink against the
// current origin and copies to clipboard. Toast confirmation via local
// state, decays after 2 seconds. Falls back to selecting the URL in a
// prompt() if clipboard API is unavailable (rare, but possible in
// older browsers or http-only contexts).
function CopyLinkButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  function onCopy() {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/todo/${encodeURIComponent(id)}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        window.prompt("Copy this URL", url);
      });
    } else {
      window.prompt("Copy this URL", url);
    }
  }
  return (
    <button
      type="button"
      onClick={onCopy}
      className={`text-[11px] rounded-md border px-2.5 py-1.5 transition whitespace-nowrap ${
        copied
          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
          : "border-white/15 text-white/65 hover:text-white hover:bg-white/5"
      }`}
      title={`Copy /todo/${id} link to clipboard`}
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

const selectCls =
  "w-full rounded-lg bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition";
