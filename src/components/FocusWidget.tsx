"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { reasonLabel, reasonColor, type FocusEntry } from "@/lib/focus";
import { relativeTime } from "@/lib/types";

// FocusWidget renders the Top-5 "do these now" list on the home page
// (Phase J, doc 768). Collapsible header so the user can tuck it away;
// the open/closed state persists in localStorage per-user so each
// teammate's preference sticks.
//
// Defaults to OPEN on first visit. localStorage key:
//   zao-cowork-focus-collapsed:<user>
//
// Tap any entry -> /todo/<id> permalink (Phase H) opens the TaskRoom
// in the slide-in panel, no page reload. Same surface the bot links to.

export function FocusWidget({
  entries,
  user,
}: {
  entries: FocusEntry[];
  user: string;
}) {
  const storageKey = `zao-cowork-focus-collapsed:${user || "anon"}`;
  // Optimistic default: open. The useEffect below corrects from
  // localStorage once we know what the user chose previously.
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-emerald-200">Nothing urgent</div>
          <span className="text-[10px] text-emerald-200/60">No expedite, stale, overdue, or P1 work</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-rose-500/10 to-orange-500/10 border border-rose-500/30 overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-rose-500 text-white text-[10px] font-bold tracking-wider px-2 py-0.5">
            DO NOW
          </span>
          <span className="text-sm font-semibold text-white">
            Top {entries.length} for you
          </span>
        </div>
        <span className="text-xs text-white/55">
          {collapsed && mounted ? "expand" : "collapse"} {collapsed && mounted ? "▾" : "▴"}
        </span>
      </button>

      {!collapsed && (
        <ul className="divide-y divide-white/[0.06]">
          {entries.map((e, i) => (
            <li key={e.task.id}>
              <Link
                href={`/?task=${encodeURIComponent(e.task.id)}`}
                className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition"
              >
                <span className="mt-0.5 text-[10px] font-mono text-white/45 w-4 text-right flex-shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-sm text-white/90 truncate">{e.task.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {e.reasons.map((r) => (
                      <span
                        key={r}
                        className={`text-[9px] uppercase tracking-wider rounded px-1.5 py-0.5 border ${reasonColor(r)}`}
                      >
                        {reasonLabel(r)}
                      </span>
                    ))}
                    <span className="text-[10px] text-white/40 ml-1">
                      #{e.task.id} · {e.task.status} · {relativeTime(e.task.updatedAt)}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
