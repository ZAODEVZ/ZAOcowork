"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/types";
import type { ActionItem } from "@/lib/types";

type NotifType =
  | "assigned"
  | "approval_needed"
  | "open_task"
  | "claimed"
  | "comment"
  | "mention"
  | "review_done";

interface Notification {
  id: string;
  type: NotifType;
  itemId: string;
  message: string;
  read: boolean;
  createdAt: string;
}

interface Snapshot {
  assignedIds: string[];
  openIds: string[];
  pendingUpdateIds: string[];
  // Highest comment id seen per task I care about, so we only notify on NEW
  // comments (not the whole backlog) after the first snapshot.
  commentIds?: string[];
  // Update ids that had already been reviewed last time we looked.
  reviewedUpdateIds?: string[];
}

const TYPE_DOT: Record<NotifType, string> = {
  assigned: "bg-blue-400",
  approval_needed: "bg-amber-400",
  open_task: "bg-emerald-400",
  claimed: "bg-purple-400",
  comment: "bg-sky-400",
  mention: "bg-pink-400",
  review_done: "bg-teal-400",
};

function genId(): string {
  return `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function NotificationBell({
  items,
  currentUser,
  isLeadUser,
  onOpenTask,
}: {
  items: ActionItem[];
  currentUser: string;
  isLeadUser: boolean;
  onOpenTask: (id: string) => void;
}) {
  const userKey = currentUser.trim().toLowerCase() || "user";
  const notifsKey = `zao-notifs-v1:${userKey}`;
  const snapKey = `zao-notif-snap-v1:${userKey}`;
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);

  // Load persisted notifications on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(notifsKey);
    if (raw) {
      try { setNotifs(JSON.parse(raw)); } catch {}
    }
  }, [notifsKey]);

  // Escape closes the dropdown (keyboard users).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Diff items against snapshot and generate new notifications
  useEffect(() => {
    if (typeof window === "undefined") return;

    const snapRaw = window.localStorage.getItem(snapKey);
    let snap: Snapshot | null = null;
    if (snapRaw) {
      try { snap = JSON.parse(snapRaw); } catch {}
    }

    // Compute current state
    const assignedIds = items
      .filter((it) => it.status !== "DONE" && String(it.owner).toLowerCase() === userKey)
      .map((it) => it.id);

    const openIds = items
      .filter((it) => it.status !== "DONE" && (it.claimable || String(it.owner).toLowerCase() === "open"))
      .map((it) => it.id);

    const pendingUpdateIds: string[] = [];
    if (isLeadUser) {
      for (const it of items) {
        for (const u of it.updates || []) {
          if (u.reviewStatus === "pending") pendingUpdateIds.push(u.id);
        }
      }
    }

    // "My tasks" = owned by me OR I commented on them OR I submitted an update.
    // We watch these for new comments + @mentions of me.
    const mentionToken = `@${userKey}`;
    const isMine = (it: ActionItem) =>
      String(it.owner).toLowerCase() === userKey ||
      (it.comments || []).some((c) => (c.userId || "").toLowerCase() === userKey) ||
      (it.updates || []).some((u) => (u.submittedBy || "").toLowerCase() === userKey);

    // Comment ids on tasks I'm involved in, plus any comment that @mentions me
    // anywhere. Track ids so we only fire on genuinely new comments.
    const commentIds: string[] = [];
    for (const it of items) {
      const mine = isMine(it);
      for (const c of it.comments || []) {
        const mentionsMe = (c.content || "").toLowerCase().includes(mentionToken);
        const fromMe = (c.userId || "").toLowerCase() === userKey;
        if ((mine || mentionsMe) && !fromMe) commentIds.push(c.id);
      }
    }

    // Updates I submitted that now have a review decision (approved/rejected/
    // changes_requested) — so the worker learns their submission was actioned.
    const reviewedUpdateIds: string[] = [];
    for (const it of items) {
      for (const u of it.updates || []) {
        if (
          (u.submittedBy || "").toLowerCase() === userKey &&
          u.reviewStatus &&
          u.reviewStatus !== "pending"
        ) {
          reviewedUpdateIds.push(u.id);
        }
      }
    }

    // Persist updated snapshot
    window.localStorage.setItem(
      snapKey,
      JSON.stringify({ assignedIds, openIds, pendingUpdateIds, commentIds, reviewedUpdateIds }),
    );

    // No previous snapshot = first ever visit, initialize only
    if (!snap) return;

    const now = new Date().toISOString();
    const newNotifs: Notification[] = [];

    const prevAssigned = new Set(snap.assignedIds);
    const prevOpen = new Set(snap.openIds);
    const prevPending = new Set(snap.pendingUpdateIds);
    const curOpenSet = new Set(openIds);

    // Tasks newly assigned to me
    for (const id of assignedIds) {
      if (!prevAssigned.has(id)) {
        const it = items.find((x) => x.id === id);
        if (it) {
          newNotifs.push({
            id: genId(), type: "assigned", itemId: id,
            message: `Task assigned to you: ${it.title}`,
            read: false, createdAt: now,
          });
        }
      }
    }

    // New open/claimable tasks
    for (const id of openIds) {
      if (!prevOpen.has(id)) {
        const it = items.find((x) => x.id === id);
        if (it) {
          newNotifs.push({
            id: genId(), type: "open_task", itemId: id,
            message: `Open task available to claim: ${it.title}`,
            read: false, createdAt: now,
          });
        }
      }
    }

    // Tasks that were open and got claimed
    for (const id of snap.openIds) {
      if (!curOpenSet.has(id)) {
        const it = items.find((x) => x.id === id);
        if (it && it.status !== "DONE" && !it.claimable && String(it.owner).toLowerCase() !== "open") {
          newNotifs.push({
            id: genId(), type: "claimed", itemId: id,
            message: `${it.owner} is working on: ${it.title}`,
            read: false, createdAt: now,
          });
        }
      }
    }

    // New pending reviews (leads only)
    if (isLeadUser) {
      for (const uid of pendingUpdateIds) {
        if (!prevPending.has(uid)) {
          for (const it of items) {
            const u = (it.updates || []).find((x) => x.id === uid);
            if (u) {
              newNotifs.push({
                id: genId(), type: "approval_needed", itemId: it.id,
                message: `${u.displayName} submitted for review: ${it.title}`,
                read: false, createdAt: now,
              });
              break;
            }
          }
        }
      }
    }

    // New comments on tasks I'm involved in, and @mentions of me
    const prevComments = new Set(snap.commentIds ?? []);
    for (const it of items) {
      for (const c of it.comments || []) {
        if (!commentIds.includes(c.id) || prevComments.has(c.id)) continue;
        const mentionsMe = (c.content || "").toLowerCase().includes(mentionToken);
        const who = c.displayName || c.userId || "Someone";
        newNotifs.push({
          id: genId(),
          type: mentionsMe ? "mention" : "comment",
          itemId: it.id,
          message: mentionsMe
            ? `${who} mentioned you on: ${it.title}`
            : `${who} commented on: ${it.title}`,
          read: false,
          createdAt: now,
        });
      }
    }

    // My submitted update got a review decision
    const prevReviewed = new Set(snap.reviewedUpdateIds ?? []);
    for (const it of items) {
      for (const u of it.updates || []) {
        if (!reviewedUpdateIds.includes(u.id) || prevReviewed.has(u.id)) continue;
        const verb =
          u.reviewStatus === "approved"
            ? "approved"
            : u.reviewStatus === "rejected"
            ? "rejected"
            : "requested changes on";
        newNotifs.push({
          id: genId(),
          type: "review_done",
          itemId: it.id,
          message: `Your update was ${verb}: ${it.title}`,
          read: false,
          createdAt: now,
        });
      }
    }

    if (newNotifs.length === 0) return;

    setNotifs((prev) => {
      const updated = [...newNotifs, ...prev].slice(0, 50);
      window.localStorage.setItem(notifsKey, JSON.stringify(updated));
      return updated;
    });
  }, [items, userKey, isLeadUser, snapKey, notifsKey]);

  const unread = notifs.filter((n) => !n.read).length;

  function handleNotifClick(n: Notification) {
    setNotifs((prev) => {
      const updated = prev.map((x) => (x.id === n.id ? { ...x, read: true } : x));
      window.localStorage.setItem(notifsKey, JSON.stringify(updated));
      return updated;
    });
    setOpen(false);
    onOpenTask(n.itemId);
  }

  function markAllRead() {
    setNotifs((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      window.localStorage.setItem(notifsKey, JSON.stringify(updated));
      return updated;
    });
  }

  function clearAll() {
    setNotifs([]);
    window.localStorage.removeItem(notifsKey);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative rounded-xl border border-white/10 px-3 py-2 text-sm transition ${
          open ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5"
        }`}
        aria-label="Notifications"
        title="Notifications"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[9px] font-bold flex items-center justify-center leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-80 max-w-[calc(100vw-2rem)] max-h-96 overflow-y-auto rounded-2xl bg-[#0d1f35] border border-white/10 shadow-2xl">
            <div className="sticky top-0 bg-[#0d1f35] border-b border-white/10 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold">
                Notifications
                {unread > 0 && (
                  <span className="ml-2 text-[10px] rounded-full bg-red-500/20 text-red-300 border border-red-500/30 px-1.5 py-0.5">
                    {unread} new
                  </span>
                )}
              </span>
              <div className="flex gap-3">
                {unread > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[11px] text-white/50 hover:text-white/80 transition"
                  >
                    Mark read
                  </button>
                )}
                {notifs.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="text-[11px] text-white/50 hover:text-white/80 transition"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {notifs.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="text-2xl mb-2">🔔</div>
                <p className="text-sm text-white/40">No notifications yet</p>
                <p className="text-[11px] text-white/25 mt-1">
                  You&apos;ll see assignments, comments, @mentions, reviews, and open tasks here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {notifs.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => handleNotifClick(n)}
                      className={`w-full text-left px-4 py-3 flex items-start gap-3 transition ${
                        n.read
                          ? "opacity-50 hover:opacity-80 hover:bg-white/[0.02]"
                          : "hover:bg-white/[0.06]"
                      }`}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${TYPE_DOT[n.type]}`}
                      />
                      <div className="flex-1 min-w-0 text-left">
                        <p
                          className={`text-sm leading-snug ${
                            n.read ? "text-white/60" : "text-white/90"
                          }`}
                        >
                          {n.message}
                        </p>
                        <p className="mt-0.5 text-[11px] text-white/35">
                          {relativeTime(n.createdAt)} · tap to open task
                        </p>
                      </div>
                      {!n.read && (
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
