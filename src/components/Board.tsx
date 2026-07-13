"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { ViewAsBanner } from "./ViewAsBanner";
import { ViewAsSwitcher } from "./ViewAsSwitcher";
import {
  BOARD_STATUSES,
  type BoardStatus,
  PRIORITIES,
  PHASES,
  CATEGORIES,
  OWNERS,
  SERVICE_CLASSES,
  SERVICE_CLASS_COLORS,
  SERVICE_CLASS_LABELS,
  TASK_SOURCE_COLORS,
  TASK_SOURCE_LABELS,
  COLUMN_DOD,
  ageDays,
  cycleDays,
  isStale,
  isAssignedTo,
  type ActionItem,
  type ActionStatus,
  type Owner,
  type Priority,
  type ServiceClass,
} from "@/lib/types";
import { BRANDS, brandColor } from "@/lib/brands";
import { resolveSource } from "@/lib/source-resolver";
import { patchField, claimTask } from "@/app/actions";
import { TaskRoom } from "./TaskRoom";
import { TodoPanel, TodoTrigger } from "./TodoPanel";
import { NotificationBell } from "./NotificationBell";
import { QuickAdd } from "./quickadd/QuickAdd";
import { BulkActionBar } from "./BulkActionBar";
import { InsightsPanel } from "./InsightsPanel";
import { DailyView } from "./DailyView";

const STATUS_LABEL: Record<ActionStatus, string> = {
  TRIAGE: "TRIAGE",
  TODO: "TO DO",
  WIP: "IN PROGRESS",
  BLOCKED: "BLOCKED",
  DONE: "DONE",
};

const STATUS_HEAD: Record<ActionStatus, string> = {
  TRIAGE: "border-fuchsia-500/40 text-fuchsia-300",
  TODO: "border-slate-500/40 text-slate-300",
  WIP: "border-amber-500/50 text-amber-300",
  BLOCKED: "border-red-500/50 text-red-300",
  DONE: "border-emerald-500/50 text-emerald-300",
};

const PRIORITY_DOT: Record<Priority, string> = {
  P1: "bg-red-500",
  P2: "bg-amber-400",
  P3: "bg-emerald-400",
};

const OWNER_BADGE: Record<string, string> = {
  Zaal: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  Iman: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  ThyRev: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  Samantha: "bg-pink-500/20 text-pink-300 border-pink-500/40",
  Tyler: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  Shawn: "bg-teal-500/20 text-teal-300 border-teal-500/40",
  Both: "bg-slate-500/20 text-slate-200 border-slate-500/40",
  Open: "bg-amber-500/20 text-amber-300 border-amber-500/40",
};
// Neutral fallback for unknown owners — was reusing Both's slate, mislabeling
// new/unlisted users as co-owned (doc 766 finding #10).
const OWNER_BADGE_FALLBACK = "bg-gray-500/20 text-gray-300 border-gray-500/40";

const CATEGORY_COLOR: Record<string, string> = {
  "ZAO Devz": "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  "Site / Tech": "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  Ops: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  Bounty: "bg-lime-500/15 text-lime-300 border-lime-500/30",
  Other: "bg-gray-500/15 text-gray-300 border-gray-500/30",
  "WaveWarZ Zambia": "bg-violet-500/15 text-violet-300 border-violet-500/30",
  Recording: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  Distribution: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  Release: "bg-pink-500/15 text-pink-300 border-pink-500/30",
  "Artist Onboarding": "bg-rose-500/15 text-rose-300 border-rose-500/30",
  Social: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  Brand: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Content: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  Campaigns: "bg-red-500/15 text-red-300 border-red-500/30",
};

function ownerInitial(o: string): string {
  if (!o) return "?";
  if (o === "Both") return "Z+I";
  if (o === "Open") return "?";
  if (o === "ThyRev") return "TR";
  if (o === "Samantha") return "SM";
  return o.slice(0, 1).toUpperCase();
}

type Filters = {
  search: string;
  owner: string;
  category: string;
  priority: string;
  phase: string;
  // Multi-select brand filter. Matches any task whose `brands` overlaps.
  // Empty array = no brand constraint. Schema already supports tags via
  // tasks.brands text[] (doc 713 follow-up).
  brands: string[];
  // Doc 983: cross-cutting theme (single-select) + judgment-routing owner.
  theme: string;
  nextOwner: string;
  mineOnly: boolean;
  agingOnly: boolean;
};

// Doc 983 taxonomy - keep in sync with the auto-tagger (metadata.themes /
// metadata.next_owner).
const THEME_OPTIONS = ["web3", "ai", "music", "events", "growth", "governance", "research", "ops"];
const NEXT_OWNER_OPTIONS = ["me", "agent", "review", "blocked"];

const EMPTY_FILTERS: Filters = {
  search: "",
  owner: "",
  category: "",
  priority: "",
  phase: "",
  brands: [],
  theme: "",
  nextOwner: "",
  mineOnly: true,
  agingOnly: false,
};

// Backward-compat: localStorage from before this PR stored `brand: string`.
// Migrate to `brands: string[]` so persisted filters still apply.
function migrateFilters(raw: Partial<Filters> & { brand?: string }): Partial<Filters> {
  if (!raw || typeof raw !== "object") return raw;
  if ("brand" in raw && typeof raw.brand === "string") {
    const { brand, ...rest } = raw;
    return { ...rest, brands: brand ? [brand] : [] };
  }
  return raw;
}

function parseDueDate(raw: string): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

// Urgency/importance sort bucket. Module-scope (pure, no deps) so it's a stable
// reference and doesn't invalidate the byStatus useMemo every render.
function tagBucket(it: ActionItem): number {
  if (it.important && it.urgent) return 0;
  if (it.urgent) return 1;
  if (it.important) return 2;
  return 3;
}

// Saved views: one-click filter presets + user-saved combos. Built-ins cover the
// common asks; custom views snapshot the current filter bar to localStorage.
type SavedView = { name: string; filters: Partial<Filters> };

const VIEW_PRESETS: SavedView[] = [
  { name: "My tasks", filters: { mineOnly: true } },
  { name: "Everyone", filters: { mineOnly: false } },
  { name: "My P1s", filters: { mineOnly: true, priority: "P1" } },
  { name: "All P1s", filters: { mineOnly: false, priority: "P1" } },
  { name: "Aging", filters: { mineOnly: false, agingOnly: true } },
  // Doc 983: judgment-routing views - the real question with parallel agents.
  { name: "Needs me", filters: { mineOnly: false, nextOwner: "me" } },
  { name: "Agent working", filters: { mineOnly: false, nextOwner: "agent" } },
  { name: "Ready to review", filters: { mineOnly: false, nextOwner: "review" } },
];

function viewMatches(current: Filters, view: Partial<Filters>): boolean {
  const target: Filters = { ...EMPTY_FILTERS, ...view };
  return JSON.stringify(current) === JSON.stringify(target);
}

function SavedViews({
  filters,
  onApply,
  userKey,
}: {
  filters: Filters;
  onApply: (f: Filters) => void;
  userKey: string;
}) {
  const storageKey = `cowork-board-views:${userKey || "anon"}`;
  const [custom, setCustom] = useState<SavedView[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setCustom(JSON.parse(raw));
    } catch {
      /* ignore corrupt */
    }
  }, [storageKey]);

  function persist(next: SavedView[]) {
    setCustom(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    }
  }

  function saveCurrent() {
    const name = window.prompt("Name this view (e.g. 'Site P1s')")?.trim();
    if (!name) return;
    const next = [...custom.filter((v) => v.name !== name), { name, filters: { ...filters } }];
    persist(next);
  }

  function remove(name: string) {
    persist(custom.filter((v) => v.name !== name));
  }

  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-lg text-[11px] font-medium border transition whitespace-nowrap ${
      active
        ? "bg-blue-500/20 text-blue-200 border-blue-500/40"
        : "border-white/10 text-white/55 hover:text-white/85 hover:bg-white/[0.06]"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-widest text-white/30 mr-0.5">Views</span>
      {VIEW_PRESETS.map((v) => (
        <button
          key={v.name}
          type="button"
          onClick={() => onApply({ ...EMPTY_FILTERS, ...v.filters })}
          className={chip(viewMatches(filters, v.filters))}
        >
          {v.name}
        </button>
      ))}
      {custom.map((v) => {
        const active = JSON.stringify(filters) === JSON.stringify({ ...EMPTY_FILTERS, ...v.filters });
        return (
          <span key={v.name} className="inline-flex items-center">
            <button
              type="button"
              onClick={() => onApply({ ...EMPTY_FILTERS, ...v.filters })}
              className={chip(active)}
              title="Apply saved view"
            >
              ★ {v.name}
            </button>
            <button
              type="button"
              onClick={() => remove(v.name)}
              title="Delete view"
              className="ml-0.5 text-white/30 hover:text-red-300 text-xs px-1"
            >
              ×
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={saveCurrent}
        className="px-2.5 py-1 rounded-lg text-[11px] border border-dashed border-white/15 text-white/45 hover:text-white/80 hover:border-white/30 transition"
        title="Save the current filters as a view"
      >
        ＋ Save view
      </button>
    </div>
  );
}


const TOUR_STEPS: Array<{ title: string; lines: string[] }> = [
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

// Due-date urgency for the card's "due" badge. Makes a date preattentive:
// overdue reads red, due within 2 days reads amber, otherwise neutral.
// DONE tasks never flag — a shipped task's due date is history.
function dueUrgency(due: string | undefined, status: string): "overdue" | "soon" | "none" {
  if (!due || status === "DONE") return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${due}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "none";
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 2) return "soon";
  return "none";
}

// CSV export of the currently-filtered items. Kept dependency-free: builds the
// text in-browser and downloads via a Blob URL. RFC-4180 quoting (wrap in
// quotes, double any embedded quotes) so titles/notes with commas survive.
const CSV_COLUMNS: { header: string; get: (it: ActionItem) => string }[] = [
  { header: "id", get: (it) => String(it.id ?? "") },
  { header: "title", get: (it) => it.title ?? "" },
  { header: "status", get: (it) => it.status ?? "" },
  { header: "owner", get: (it) => String(it.owner ?? "") },
  { header: "priority", get: (it) => it.priority ?? "" },
  { header: "category", get: (it) => it.category ?? "" },
  { header: "brands", get: (it) => (it.brands ?? []).join("; ") },
  { header: "due", get: (it) => it.due ?? "" },
  { header: "createdAt", get: (it) => it.createdAt ?? "" },
  { header: "updatedAt", get: (it) => it.updatedAt ?? "" },
  { header: "completedAt", get: (it) => it.completedAt ?? "" },
];

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function exportItemsCsv(items: ActionItem[]) {
  const header = CSV_COLUMNS.map((c) => c.header).join(",");
  const rows = items.map((it) => CSV_COLUMNS.map((c) => csvCell(c.get(it))).join(","));
  const csv = [header, ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `zao-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function Board({
  items,
  currentUser,
  portalCategories,
  defaultCategory,
  urlBrand,
  urlProjectId,
  urlProjectSlug,
  urlProjectName,
  projects,
  depCounts,
}: {
  items: ActionItem[];
  currentUser: string;
  portalCategories: string[];
  defaultCategory: string;
  // When set, the brand filter is locked to this single brand from the URL
  // (?brand=X driven by the top-tab nav). The in-board BrandPills row hides
  // because the nav is the source of truth. null/undefined = General tab,
  // no brand constraint, BrandPills row stays visible as a fallback.
  urlBrand?: string | null;
  // Doc 765 Phase I: project scope from ?project=slug. urlProjectId is
  // the resolved UUID used for the actual filter; the slug + name are
  // rendered in the header chip. Null = no project scope ("All projects").
  urlProjectId?: string | null;
  urlProjectSlug?: string | null;
  urlProjectName?: string | null;
  projects?: Array<{ id: string; slug: string; name: string; color: string }>;
  depCounts?: Record<string, { blockedByOpen: number; blocks: number }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewAsParam = searchParams.get("viewAs");
  // effectiveUser is the user we're viewing as (may differ from currentUser when
  // admin uses view-as feature). Defaults to currentUser. Read-only impersonation:
  // filtering/display uses effectiveUser, but all writes stay attributed to currentUser.
  const [effectiveUser, setEffectiveUser] = useState<string>(() => {
    if (viewAsParam && currentUser === "zaal") {
      return viewAsParam;
    }
    return currentUser;
  });
  useEffect(() => {
    if (viewAsParam && currentUser === "zaal") {
      setEffectiveUser(viewAsParam);
    } else {
      setEffectiveUser(currentUser);
    }
  }, [viewAsParam, currentUser]);

  // Land on "my open work" by default, not the full firehose. Subsequent
  // visits restore the last filter state from localStorage so the board picks
  // up where you left off (per-user key so teammates do not share state).
  const filterStorageKey = `cowork-board-filters:${effectiveUser || "anon"}`;
  // First render uses the SSR-safe default so server + client match (no
  // hydration mismatch). Saved filters are hydrated after mount.
  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY_FILTERS, mineOnly: true }));
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(filterStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Filters> & { brand?: string };
      setFilters({ ...EMPTY_FILTERS, ...migrateFilters(parsed) });
    } catch {
      /* ignore corrupt/blocked storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStorageKey]);
  // Skip the first persist so the mount-time default doesn't overwrite saved
  // filters before they hydrate.
  const skipFirstPersist = useRef(true);
  useEffect(() => {
    if (skipFirstPersist.current) {
      skipFirstPersist.current = false;
      return;
    }
    try {
      window.localStorage.setItem(filterStorageKey, JSON.stringify(filters));
    } catch {
      // localStorage full / disabled - silently ignore, view just will not persist.
    }
  }, [filters, filterStorageKey]);
  const [activeMobileStatus, setActiveMobileStatus] = useState<BoardStatus>("TODO");
  // View density: light = minimal filters, mid = standard, power = all controls.
  // Persisted per browser. Default is "mid" (the current experience).
  const [density, setDensity] = useState<"light" | "mid" | "power">("mid");
  useEffect(() => {
    try {
      const d = window.localStorage.getItem("zao-board-density");
      if (d === "light" || d === "mid" || d === "power") setDensity(d);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem("zao-board-density", density); } catch { /* ignore */ }
  }, [density]);
  // Board vs Table view (research roadmap Phase A/B). Cards are bad at
  // multivariate comparison/bulk-scan (NN/g); a table is the standard second
  // layout in mature PM tools. Persisted so the choice sticks per browser.
  const [view, setView] = useState<"board" | "table">("board");
  const [showInsights, setShowInsights] = useState(false);
  // Grouping axis for the Table view (research roadmap A): switchable grouping
  // is the standard way to re-slice the same items by owner/priority/brand.
  const [groupBy, setGroupBy] = useState<GroupKey>("none");
  useEffect(() => {
    try {
      const v = window.localStorage.getItem("zao-board-view");
      if (v === "table" || v === "board") setView(v);
      const g = window.localStorage.getItem("zao-board-group");
      if (g === "none" || g === "status" || g === "owner" || g === "priority" || g === "brand") {
        setGroupBy(g);
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("zao-board-view", view);
    } catch {
      /* ignore */
    }
  }, [view]);
  useEffect(() => {
    try {
      window.localStorage.setItem("zao-board-group", groupBy);
    } catch {
      /* ignore */
    }
  }, [groupBy]);
  // Phase H: TaskRoom can be opened via the ?task=<id> URL param so a
  // /todo/N permalink lands the user directly on the task. We sync both
  // ways - state -> URL (history.replaceState so back button works) and
  // URL -> state (initial load + back/forward navigation).
  const urlTaskParam = searchParams.get("task");
  const [taskRoomId, setTaskRoomId] = useState<string | null>(urlTaskParam);
  useEffect(() => {
    // When URL param changes (back/forward, link click) -> open that task.
    if (urlTaskParam !== taskRoomId) setTaskRoomId(urlTaskParam ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTaskParam]);
  useEffect(() => {
    // When state changes -> rewrite URL without a full nav.
    const url = new URL(window.location.href);
    if (taskRoomId) {
      if (url.searchParams.get("task") !== taskRoomId) {
        url.searchParams.set("task", taskRoomId);
        window.history.replaceState(null, "", url.toString());
      }
    } else if (url.searchParams.has("task")) {
      url.searchParams.delete("task");
      window.history.replaceState(null, "", url.toString());
    }
  }, [taskRoomId]);
  const [todoOpen, setTodoOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Phase C: bulk-select. Off by default to keep the day-to-day UX unchanged;
  // user toggles "Select" in the FilterBar to opt in. Selection clears on
  // every items[] refresh (router.refresh after a bulk action) so the bar
  // doesn't show stale IDs after rows get deleted/moved.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  useEffect(() => {
    if (!selectMode && selectedIds.size > 0) setSelectedIds(new Set());
  }, [selectMode, selectedIds.size]);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [dailyViewOpen, setDailyViewOpen] = useState(false);
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);
  const prevById = useRef<Map<string, ActionItem>>(new Map());

  // Hardcoded ternary used to default any unknown session user (Shawn,
  // Tyler, future admin-added users) to "Samantha", which made the
  // welcome modal greet a freshly-added Shawn as "Hi Samantha". Use the
  // same KNOWN_LABELS + capitalize fallback as the server-side
  // userLabel() in @/lib/auth.
  const KNOWN_LABELS: Record<string, string> = {
    zaal: "Zaal",
    iman: "Iman",
    thyrev: "ThyRev",
    samantha: "Samantha",
    tyler: "Tyler",
    shawn: "Shawn",
  };
  const lowered = effectiveUser.trim().toLowerCase();
  const userLabel = KNOWN_LABELS[lowered] ?? (lowered ? lowered.charAt(0).toUpperCase() + lowered.slice(1) : "User");
  const storageUserKey = userLabel.trim().toLowerCase() || "user";
  const todayKey = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const id = window.setInterval(() => {
      // Don't auto-refresh while someone is typing or has a task panel open —
      // a refresh can wipe in-progress text (Jose's lost feedback). Resume once
      // they're idle and back on the board.
      const el = document.activeElement as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing || taskRoomId) return;
      router.refresh();
    }, 120_000);
    return () => window.clearInterval(id);
  }, [router, taskRoomId]);

  useEffect(() => {
    const key = `zao-cowork-welcome-v2:${storageUserKey}`;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(key) === "1") return;
    setWelcomeOpen(true);
  }, [storageUserKey]);

  useEffect(() => {
    const lastSeenKey = `zao-cowork-last-seen:${storageUserKey}`;
    const lastSeenRaw =
      typeof window === "undefined" ? "" : window.localStorage.getItem(lastSeenKey) || "";
    const lastSeenMs = lastSeenRaw ? new Date(lastSeenRaw).getTime() : 0;
    const viewingUser = effectiveUser.trim().toLowerCase();
    const openMine = items.filter((it) => {
      if (it.status === "DONE") return false;
      return isAssignedTo(it, viewingUser);
    });
    const overdueMine = openMine.filter((it) => {
      const due = parseDueDate(it.due);
      if (!due) return false;
      return due.toISOString().slice(0, 10) < todayKey;
    });
    const completedByCoworker = items.filter((it) => {
      if (it.status !== "DONE") return false;
      if (!it.completedAt) return false;
      const doneMs = new Date(it.completedAt).getTime();
      if (!Number.isFinite(doneMs) || doneMs <= lastSeenMs) return false;
      const created = String(it.createdBy || "").toLowerCase();
      const completedBy = String(it.completedBy || "").toLowerCase();
      return created === viewingUser && completedBy && completedBy !== viewingUser;
    });
    const dailyKey = `zao-cowork-daily-v1:${storageUserKey}`;
    const shownFor =
      typeof window === "undefined" ? "" : window.localStorage.getItem(dailyKey) || "";
    if (
      shownFor !== todayKey &&
      (openMine.length > 0 || overdueMine.length > 0 || completedByCoworker.length > 0)
    ) {
      setDailyOpen(true);
      window.localStorage.setItem(dailyKey, todayKey);
    }
    window.localStorage.setItem(lastSeenKey, new Date().toISOString());
  }, [items, storageUserKey, todayKey]);

  useEffect(() => {
    const prev = prevById.current;
    const next = new Map<string, ActionItem>();
    for (const it of items) {
      next.set(it.id, it);
      const before = prev.get(it.id);
      if (!before) continue;
      if (before.status !== "DONE" && it.status === "DONE") {
        const mine = storageUserKey;
        const created = String(it.createdBy || "").toLowerCase();
        const completedBy = String(it.completedBy || "").toLowerCase();
        if (created === mine && completedBy && completedBy !== mine) {
          setToast({ title: "Task completed", message: `${it.owner} completed: ${it.title}` });
        }
      }
    }
    prevById.current = next;
  }, [items, storageUserKey]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return items.filter((it) => {
      if (q) {
        const hay = `${it.title} ${it.notes} ${it.category} ${it.owner}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Match the raw owner (covers Both/Open) OR membership in the assignee
      // set (covers multi-assignee + people who share a Both/derived task).
      if (filters.owner && it.owner !== filters.owner && !isAssignedTo(it, filters.owner))
        return false;
      if (filters.category && it.category !== filters.category) return false;
      if (filters.priority && it.priority !== filters.priority) return false;
      if (filters.phase && it.phase !== filters.phase) return false;
      // Doc 983: theme (metadata.themes overlap) + next-owner (judgment routing).
      if (filters.theme && !(it.themes ?? []).includes(filters.theme)) return false;
      if (filters.nextOwner && (it.nextOwner ?? "") !== filters.nextOwner) return false;
      // URL-driven brand tab takes precedence over localStorage filters.brands.
      // Single-brand match - a task whose `brands` array contains urlBrand.
      if (urlBrand) {
        if (!(it.brands ?? []).includes(urlBrand)) return false;
      } else if (filters.brands.length && !filters.brands.some((b) => (it.brands ?? []).includes(b))) {
        return false;
      }
      // Doc 765 Phase I: project scope from ?project=slug. If set, only
      // tasks with that project_id pass. Null = no project filter.
      if (urlProjectId) {
        if (it.projectId !== urlProjectId) return false;
      }
      if (filters.mineOnly) {
        const o = String(it.owner).toLowerCase();
        const isOpenTask = it.claimable || o === "open";
        if (!isAssignedTo(it, effectiveUser) && !isOpenTask) return false;
      }
      if (filters.agingOnly && it.status !== "DONE") {
        if (ageDays(it.createdAt) <= 14) return false;
      } else if (filters.agingOnly && it.status === "DONE") {
        return false;
      }
      return true;
    });
  }, [items, filters, effectiveUser, urlBrand, urlProjectId]);

  const byStatus = useMemo(() => {
    const map: Record<BoardStatus, ActionItem[]> = {
      TODO: [],
      WIP: [],
      BLOCKED: [],
      DONE: [],
    };
    // TRIAGE items don't render on the main board - they live on /admin/triage
    // until a lead routes them. Same for archived (auto-archived >30d DONE).
    for (const it of filtered) {
      if (it.status === "TRIAGE") continue;
      if (it.archivedAt) continue;
      if (it.status in map) map[it.status as BoardStatus].push(it);
    }
    for (const s of BOARD_STATUSES) {
      map[s].sort((a, b) => {
        // Doc 763 F1: stale items (no activity 5+ days) bubble up.
        // Then Eisenhower matrix bucket, then priority, then age desc.
        const sa = isStale(a) ? 0 : 1;
        const sb = isStale(b) ? 0 : 1;
        if (sa !== sb) return sa - sb;
        const tb = tagBucket(a) - tagBucket(b);
        if (tb !== 0) return tb;
        const pr = PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
        if (pr !== 0) return pr;
        return ageDays(b.createdAt) - ageDays(a.createdAt);
      });
    }
    return map;
  }, [filtered]);

  const taskRoomItem = taskRoomId ? items.find((x) => x.id === taskRoomId) : null;
  const claimableCount = items.filter((it) => it.claimable).length;
  // Doc 763 F2: Expedite swimlane. Only active (non-DONE, non-archived) items
  // count. 1-card cap is workspace-wide; UI warns when >1 but doesn't block.
  const expediteActive = items.filter(
    (it) =>
      it.serviceClass === "Expedite" &&
      it.status !== "DONE" &&
      it.status !== "TRIAGE" &&
      !it.archivedAt,
  );
  const isWorker = ["thyrev", "samantha"].includes(currentUser.trim().toLowerCase());
  const filtersActive =
    filters.search ||
    filters.owner ||
    filters.category ||
    filters.priority ||
    filters.phase ||
    filters.brands.length > 0 ||
    filters.theme ||
    filters.nextOwner ||
    filters.mineOnly ||
    filters.agingOnly ||
    !!urlBrand;

  return (
    <div className="space-y-4">
      {currentUser === "zaal" && <ViewAsSwitcher currentUser={currentUser} isAdmin={true} />}
      <ViewAsBanner effectiveUser={effectiveUser} currentUser={currentUser} />

      {welcomeOpen && (
        <WelcomeModal
          userLabel={userLabel}
          onClose={() => {
            window.localStorage.setItem(`zao-cowork-welcome-v2:${storageUserKey}`, "1");
            setWelcomeOpen(false);
          }}
          onTour={() => {
            window.localStorage.setItem(`zao-cowork-welcome-v2:${storageUserKey}`, "1");
            setWelcomeOpen(false);
            setTourStep(0);
            setTourOpen(true);
          }}
        />
      )}
      {!welcomeOpen && tourOpen && (
        <TourModal
          step={tourStep}
          onClose={() => setTourOpen(false)}
          onBack={() => setTourStep((s) => Math.max(0, s - 1))}
          onNext={() => setTourStep((s) => Math.min(TOUR_STEPS.length - 1, s + 1))}
        />
      )}
      {!welcomeOpen && !tourOpen && dailyOpen && (
        <DailyReminderModal
          userLabel={userLabel}
          items={items}
          todayKey={todayKey}
          storageUserKey={storageUserKey}
          onClose={() => setDailyOpen(false)}
        />
      )}
      {toast && (
        <Toast title={toast.title} message={toast.message} onClose={() => setToast(null)} />
      )}

      <QuickAdd
        currentUser={currentUser}
        defaultCategory={defaultCategory}
        tabBrand={urlBrand ?? null}
        items={items}
        onOpenTask={setTaskRoomId}
      />

      {projects && projects.length > 0 && (
        <ProjectPickerBar
          projects={projects}
          activeId={urlProjectId ?? null}
          activeSlug={urlProjectSlug ?? null}
          activeName={urlProjectName ?? null}
        />
      )}

      <FilterBar
        filters={filters}
        onChange={setFilters}
        currentUser={currentUser}
        onHelp={() => setHelpOpen(true)}
        portalCategories={portalCategories}
        items={items}
        isLeadUser={!isWorker}
        onOpenTask={setTaskRoomId}
        urlBrand={urlBrand ?? null}
        selectMode={selectMode}
        onToggleSelectMode={() => setSelectMode((v) => !v)}
        density={density}
        onDensityChange={(d) => {
          if (d !== "power" && view === "table") setView("board");
          setDensity(d);
        }}
      />

      <SavedViews filters={filters} onApply={setFilters} userKey={effectiveUser} />

      <PortfolioRollup items={items} />

      <div className="flex items-center justify-between gap-3">
        {filtersActive ? (
          <div className="text-xs text-white/50">
            showing {filtered.length} of {items.length} items
            <button
              onClick={() => setFilters({ ...EMPTY_FILTERS, mineOnly: true })}
              className="ml-3 underline hover:text-white/80"
            >
              clear filters
            </button>
          </div>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          {density !== "light" && (
            <button
              onClick={() => setShowInsights((v) => !v)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md border transition ${
                showInsights
                  ? "bg-violet-500/15 border-violet-500/40 text-violet-200"
                  : "bg-zao-ink border-white/10 text-white/55 hover:text-white/85"
              }`}
              aria-pressed={showInsights}
            >
              Insights
            </button>
          )}
          {density !== "light" && (
            <button
              onClick={() => setDailyViewOpen((v) => !v)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md border transition ${
                dailyViewOpen
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                  : "bg-zao-ink border-white/10 text-white/55 hover:text-white/85"
              }`}
              aria-pressed={dailyViewOpen}
              title="One-click daily standup by person"
            >
              Daily
            </button>
          )}
          {density === "power" && (
            <button
              onClick={() => exportItemsCsv(filtered)}
              disabled={filtered.length === 0}
              title={`Export ${filtered.length} shown task${filtered.length === 1 ? "" : "s"} as CSV`}
              className="px-2.5 py-1 text-xs font-medium rounded-md border bg-zao-ink border-white/10 text-white/55 hover:text-white/85 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Export
            </button>
          )}
          {/* Group-by selector — only meaningful in table view, power only */}
          {density === "power" && view === "table" && (
            <label className="flex items-center gap-1.5 text-xs text-white/50">
              <span className="hidden sm:inline">Group</span>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupKey)}
                className="rounded-md bg-[#0b1220] border border-white/10 px-2 py-1 text-xs text-white/80 focus:outline-none focus:border-zao-accent/60"
              >
                <option value="none">No grouping</option>
                <option value="status">Status</option>
                <option value="owner">Owner</option>
                <option value="priority">Priority</option>
                <option value="brand">Brand</option>
              </select>
            </label>
          )}
          {/* View switcher: Board vs Table — only in power mode */}
          {density === "power" && (
            <div className="flex items-center gap-0.5 rounded-lg bg-zao-ink border border-white/10 p-0.5">
              {(["board", "table"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                    view === v ? "bg-white/10 text-white" : "text-white/55 hover:text-white/85"
                  }`}
                  aria-pressed={view === v}
                >
                  {v === "board" ? "▦ Board" : "▤ Table"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showInsights && density !== "light" && <InsightsPanel items={filtered} />}

      {dailyViewOpen && density !== "light" && (
        <DailyView items={items} currentUser={currentUser} onOpenTask={setTaskRoomId} />
      )}

      {density === "power" && view === "table" && (
        <TableView items={filtered} onOpenRoom={setTaskRoomId} groupBy={groupBy} />
      )}

      {/* Mobile: status tabs + single column */}
      <div className={density === "power" && view === "table" ? "hidden" : "md:hidden"}>
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-zao-ink p-1 border border-white/10">
          {BOARD_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setActiveMobileStatus(s)}
              className={`px-2 py-1.5 text-xs rounded-md transition ${
                activeMobileStatus === s
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:text-white/90"
              }`}
            >
              {STATUS_LABEL[s]}
              <span className="ml-1 opacity-60">({byStatus[s].length})</span>
            </button>
          ))}
        </div>
        <div className="mt-3">
          <Column
            status={activeMobileStatus}
            items={byStatus[activeMobileStatus]}
            onOpenRoom={setTaskRoomId}
            currentUser={currentUser}
            defaultCategory={defaultCategory}
            isWorker={isWorker}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            depCounts={depCounts}
            defaultCollapsed={activeMobileStatus === "DONE"}
          />
        </div>
      </div>

      {view === "board" && expediteActive.length > 0 && (
        <ExpediteSwimlane
          items={expediteActive}
          onOpenRoom={setTaskRoomId}
          isWorker={isWorker}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          depCounts={depCounts}
        />
      )}

      {/* Empty state — filters match nothing (board view only) */}
      {!(density === "power" && view === "table") && filtered.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] py-16 px-6 text-center">
          <p className="text-3xl mb-3">🗂️</p>
          <p className="text-sm text-white/60 mb-1">No tasks match your filters.</p>
          <p className="text-xs text-white/35 mb-4">
            {items.length === 0
              ? "This board has no tasks yet — add one above."
              : `${items.length} task${items.length === 1 ? "" : "s"} are hidden by the current filters.`}
          </p>
          {filtersActive && (
            <button
              onClick={() => setFilters({ ...EMPTY_FILTERS, mineOnly: true })}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-white/15 text-white/70 hover:bg-white/5 transition"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Desktop: 4 columns */}
      <div className={`${(density === "power" && view === "table") || filtered.length === 0 ? "hidden" : "hidden md:grid"} md:grid-cols-2 lg:grid-cols-4 gap-4`}>
        {BOARD_STATUSES.map((s) => (
          <Column
            key={s}
            status={s}
            items={byStatus[s]}
            onOpenRoom={setTaskRoomId}
            currentUser={currentUser}
            defaultCategory={defaultCategory}
            isWorker={isWorker}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            depCounts={depCounts}
            defaultCollapsed={s === "DONE"}
          />
        ))}
      </div>

      {/* Task Room */}
      {taskRoomItem && (
        <TaskRoom
          item={taskRoomItem}
          currentUser={currentUser}
          onClose={() => setTaskRoomId(null)}
          projects={projects}
          onOpenTask={setTaskRoomId}
          allItems={items}
        />
      )}

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      <TodoPanel
        items={items}
        open={todoOpen}
        onClose={() => setTodoOpen(false)}
      />
      <TodoTrigger
        onClick={() => setTodoOpen(true)}
        claimableCount={claimableCount}
      />

      <BulkActionBar
        selectedIds={Array.from(selectedIds)}
        onClear={() => {
          setSelectedIds(new Set());
          setSelectMode(false);
        }}
      />
    </div>
  );
}

const DENSITY_LABELS: Record<"light" | "mid" | "power", string> = {
  light: "Light",
  mid: "Mid",
  power: "Power",
};

function FilterBar({
  filters,
  onChange,
  currentUser,
  onHelp,
  portalCategories,
  items,
  isLeadUser,
  onOpenTask,
  urlBrand,
  selectMode,
  onToggleSelectMode,
  density,
  onDensityChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  currentUser: string;
  onHelp: () => void;
  portalCategories: string[];
  items: ActionItem[];
  isLeadUser: boolean;
  onOpenTask: (id: string) => void;
  urlBrand: string | null;
  selectMode: boolean;
  onToggleSelectMode: () => void;
  density: "light" | "mid" | "power";
  onDensityChange: (d: "light" | "mid" | "power") => void;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  return (
    <div className="space-y-2 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-3">
      <div className="flex gap-2">
        <input
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Search tasks..."
          className="flex-1 rounded-xl bg-[#0b1220] border border-white/10 px-3 py-2 text-sm placeholder-white/30 focus:outline-none focus:border-zao-accent text-white"
        />
        <NotificationBell items={items} currentUser={currentUser} isLeadUser={isLeadUser} onOpenTask={onOpenTask} />
        {density === "power" && (
          <button
            onClick={onToggleSelectMode}
            className={`rounded-xl border px-3 py-2 text-sm transition ${
              selectMode
                ? "border-zao-accent/50 bg-zao-accent/15 text-zao-accent"
                : "border-white/10 text-white/70 hover:bg-white/5"
            }`}
            aria-label={selectMode ? "Exit select mode" : "Enter select mode"}
            title={selectMode ? "Exit multi-select" : "Multi-select for bulk actions"}
          >
            {selectMode ? "✓ Select" : "Select"}
          </button>
        )}
        {/* Density toggle — Light / Mid / Power */}
        <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-[#0b1220] p-0.5" title="View density">
          {(["light", "mid", "power"] as const).map((d) => (
            <button
              key={d}
              onClick={() => onDensityChange(d)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition ${
                density === d
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/70"
              }`}
              title={
                d === "light"
                  ? "Light — search + my tasks only"
                  : d === "mid"
                  ? "Mid — standard filters"
                  : "Power — all controls + table view"
              }
            >
              {DENSITY_LABELS[d]}
            </button>
          ))}
        </div>
        <button
          onClick={onHelp}
          className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5"
          aria-label="Help"
          title="How to use"
        >
          ?
        </button>
      </div>

      {/* Light: just My Tasks / All Tasks toggle */}
      {density === "light" && (
        <div className="flex flex-wrap gap-1.5">
          <Pill
            active={filters.mineOnly}
            onClick={() => set({ mineOnly: !filters.mineOnly })}
            label={filters.mineOnly ? "My Tasks" : "All Tasks"}
          />
        </div>
      )}

      {/* Mid: My Tasks + Aging + Owner + Category + Priority */}
      {density === "mid" && (
        <div className="flex flex-wrap gap-1.5">
          <Pill
            active={filters.mineOnly}
            onClick={() => set({ mineOnly: !filters.mineOnly })}
            label={filters.mineOnly ? "My Tasks" : "All Tasks"}
          />
          <Pill
            active={filters.agingOnly}
            onClick={() => set({ agingOnly: !filters.agingOnly })}
            label="Aging > 14d"
            tone="red"
          />
          <Divider />
          <SelectPill
            value={filters.owner}
            onChange={(v) => set({ owner: v })}
            options={["", ...OWNERS]}
            placeholder="Owner"
          />
          <SelectPill
            value={filters.category}
            onChange={(v) => set({ category: v })}
            options={["", ...portalCategories]}
            placeholder="Category"
          />
          <SelectPill
            value={filters.priority}
            onChange={(v) => set({ priority: v })}
            options={["", ...PRIORITIES]}
            placeholder="Priority"
          />
        </div>
      )}

      {/* Power: all filters */}
      {density === "power" && (
        <div className="flex flex-wrap gap-1.5">
          <Pill
            active={filters.mineOnly}
            onClick={() => set({ mineOnly: !filters.mineOnly })}
            label={filters.mineOnly ? "My Tasks" : "All Tasks"}
          />
          <Pill
            active={filters.agingOnly}
            onClick={() => set({ agingOnly: !filters.agingOnly })}
            label="Aging > 14d"
            tone="red"
          />
          <Divider />
          <SelectPill
            value={filters.owner}
            onChange={(v) => set({ owner: v })}
            options={["", ...OWNERS]}
            placeholder="Owner"
          />
          <SelectPill
            value={filters.category}
            onChange={(v) => set({ category: v })}
            options={["", ...portalCategories]}
            placeholder="Category"
          />
          <SelectPill
            value={filters.priority}
            onChange={(v) => set({ priority: v })}
            options={["", ...PRIORITIES]}
            placeholder="Priority"
          />
          <SelectPill
            value={filters.phase}
            onChange={(v) => set({ phase: v })}
            options={["", ...PHASES]}
            placeholder="DMAIC phase"
          />
          <SelectPill
            value={filters.nextOwner}
            onChange={(v) => set({ nextOwner: v })}
            options={["", ...NEXT_OWNER_OPTIONS]}
            placeholder="Needs"
          />
          <SelectPill
            value={filters.theme}
            onChange={(v) => set({ theme: v })}
            options={["", ...THEME_OPTIONS]}
            placeholder="Theme"
          />
        </div>
      )}

      {/* Brand pills: mid + power, only when not locked to a single brand via URL */}
      {density !== "light" && !urlBrand && (
        <BrandPills
          items={items}
          active={filters.brands}
          onToggle={(b) => {
            const next = filters.brands.includes(b)
              ? filters.brands.filter((x) => x !== b)
              : [...filters.brands, b];
            set({ brands: next });
          }}
          onClear={() => set({ brands: [] })}
        />
      )}
    </div>
  );
}

// BrandPills renders one toggle pill per brand actually present on the
// current task set. Multi-select: clicking adds to filters.brands, clicking
// again removes. "Clear" wipes the multi-select. Brands that never appear on
// any task stay hidden so the row is small (4 today, grows as meetings tag
// new brands).
function BrandPills({
  items,
  active,
  onToggle,
  onClear,
}: {
  items: ActionItem[];
  active: string[];
  onToggle: (brand: string) => void;
  onClear: () => void;
}) {
  const used = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) for (const b of it.brands ?? []) if (b) set.add(b);
    return Array.from(set).sort();
  }, [items]);
  if (used.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
      <span className="text-[10px] uppercase tracking-wider text-white/40 pr-1">Brands</span>
      {used.map((b) => {
        const on = active.includes(b);
        return (
          <button
            key={b}
            onClick={() => onToggle(b)}
            className={`px-2 py-0.5 rounded-full text-[11px] border transition whitespace-nowrap ${
              on ? brandColor(b) : "border-white/10 text-white/50 hover:text-white hover:bg-white/5"
            }`}
            title={on ? `Click to remove ${b} from filter` : `Click to add ${b} to filter`}
          >
            {on ? "✓ " : ""}{b}
          </button>
        );
      })}
      {active.length > 0 && (
        <button
          onClick={onClear}
          className="ml-1 text-[10px] uppercase tracking-wider text-white/40 hover:text-white/70 px-1"
          title="Clear all brand filters"
        >
          clear
        </button>
      )}
    </div>
  );
}

function Pill({
  active,
  onClick,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: "red";
}) {
  const base = "px-3 py-1 rounded-full text-xs border transition whitespace-nowrap";
  const off = "border-white/10 text-white/60 hover:text-white hover:bg-white/5";
  const onBlue = "border-zao-accent/60 bg-zao-accent/15 text-blue-200";
  const onRed = "border-red-500/60 bg-red-500/15 text-red-200";
  const cls = active ? (tone === "red" ? onRed : onBlue) : off;
  return (
    <button onClick={onClick} className={`${base} ${cls}`}>
      {label}
    </button>
  );
}

function Divider() {
  return <span className="text-white/15 px-1 select-none">|</span>;
}

function SelectPill({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-full text-xs px-3 py-1 border whitespace-nowrap ${
        value
          ? "border-zao-accent/60 bg-[#0d2040] text-blue-200"
          : "border-white/10 bg-[#0b1625] text-white/60"
      }`}
    >
      <option value="">{placeholder}</option>
      {options
        .filter((o) => o !== "")
        .map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
    </select>
  );
}

// ExpediteSwimlane caps visible cards (default 6) with an expander so a
// post-migration backlog of 41 P1-tagged tasks doesn't push the kanban
// columns off the page. Once the backlog is burned down to 1-3 real
// expedites, the cap is invisible (collapse threshold = 6).
const EXPEDITE_VISIBLE_DEFAULT = 6;

function ExpediteSwimlane({
  items,
  onOpenRoom,
  isWorker,
  selectMode,
  selectedIds,
  onToggleSelect,
  depCounts,
}: {
  items: ActionItem[];
  onOpenRoom: (id: string) => void;
  isWorker: boolean;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  depCounts?: Record<string, { blockedByOpen: number; blocks: number }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const overCap = items.length > EXPEDITE_VISIBLE_DEFAULT;
  const visible = expanded || !overCap ? items : items.slice(0, EXPEDITE_VISIBLE_DEFAULT);
  const hiddenCount = items.length - visible.length;

  let message: string;
  if (items.length === 1) {
    message = "Production-critical work in flight - everything else pauses until this clears.";
  } else if (items.length <= 3) {
    message = `${items.length} expedite items in flight - workspace cap is 1. Resolve or downgrade.`;
  } else {
    // 4+ expedites = the post-migration backlog. Different tone since it's
    // a working queue, not an incident.
    message = `${items.length} P1 items tagged Expedite (post-migration backlog). Work through, or downgrade to Standard via the task editor.`;
  }

  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-md bg-red-500 text-white text-[10px] font-bold tracking-wider px-2 py-0.5 flex-shrink-0">EXPEDITE</span>
          <span className="text-xs text-red-200/90 truncate">{message}</span>
        </div>
        {overCap && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] text-red-200 hover:text-white border border-red-500/40 hover:border-red-400 rounded-md px-2 py-0.5 flex-shrink-0 transition"
          >
            {expanded ? `Collapse to ${EXPEDITE_VISIBLE_DEFAULT}` : `Show all ${items.length}`}
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {visible.map((it) => (
          <Card
            key={`expedite-${it.id}`}
            item={it}
            onOpenRoom={onOpenRoom}
            isWorker={isWorker}
            selectMode={selectMode}
            selected={selectedIds.has(it.id)}
            onToggleSelect={onToggleSelect}
            depCounts={depCounts}
          />
        ))}
      </div>
      {hiddenCount > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 w-full rounded-lg border border-red-500/30 hover:bg-red-500/10 text-[11px] font-medium text-red-200/90 py-1.5 transition"
        >
          + {hiddenCount} more expedite item{hiddenCount === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}

// TableView (research roadmap): a sortable, scannable table layout — the
// standard "compare + bulk-scan" complement to the Kanban board. Reuses the
// same filtered items and opens the TaskRoom on row click. Read-only here;
// editing still happens in the card/TaskRoom (keeps this slice low-risk).
type SortKey = "id" | "title" | "status" | "owner" | "priority" | "age" | "due";
type GroupKey = "none" | "status" | "owner" | "priority" | "brand";

// PortfolioRollup (research roadmap B): one row per brand with open/WIP/blocked/
// aging counts + a RAG health pill, for an at-a-glance ecosystem view above the
// board. Derived purely from the visible items, so it always matches the
// current filter scope. RAG logic is explicit + conservative (research: never
// average real problems into invisible green):
//   RED   = any blocked OR any aging>14d open item
//   AMBER = WIP over a soft per-brand cap (>5) but nothing blocked/aging
//   GREEN = otherwise
function PortfolioRollup({
  items,
  onPickBrand,
}: {
  items: ActionItem[];
  onPickBrand?: (brand: string) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem("zao-rollup-open") === "1");
    } catch {
      /* ignore */
    }
  }, []);
  function toggle() {
    setOpen((v) => {
      const next = !v;
      try {
        window.localStorage.setItem("zao-rollup-open", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const rows = useMemo(() => {
    const map = new Map<
      string,
      { brand: string; open: number; wip: number; blocked: number; aging: number; total: number }
    >();
    for (const it of items) {
      if (it.archivedAt || it.status === "TRIAGE") continue;
      const brands = (it.brands ?? []).length ? (it.brands as string[]) : ["(unbranded)"];
      for (const b of brands) {
        const r = map.get(b) ?? { brand: b, open: 0, wip: 0, blocked: 0, aging: 0, total: 0 };
        r.total += 1;
        if (it.status !== "DONE") r.open += 1;
        if (it.status === "WIP") r.wip += 1;
        if (it.status === "BLOCKED") r.blocked += 1;
        if (it.status !== "DONE" && ageDays(it.createdAt) > 14) r.aging += 1;
        map.set(b, r);
      }
    }
    return Array.from(map.values())
      .filter((r) => r.open > 0)
      .sort((a, b) => b.open - a.open);
  }, [items]);

  function rag(r: { blocked: number; aging: number; wip: number }): "red" | "amber" | "green" {
    if (r.blocked > 0 || r.aging > 0) return "red";
    if (r.wip > 5) return "amber";
    return "green";
  }
  const ragCls = {
    red: "bg-red-500/15 text-red-300 border-red-500/40",
    amber: "bg-amber-500/15 text-amber-200 border-amber-500/40",
    green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  } as const;

  if (rows.length === 0) return null;

  const redCount = rows.filter((r) => rag(r) === "red").length;

  return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/10 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.03] transition"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-white/80">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          Ecosystem health
          <span className="text-xs font-normal text-white/40">
            {rows.length} brand{rows.length === 1 ? "" : "s"}
            {redCount > 0 && <span className="text-red-300"> · {redCount} need attention</span>}
          </span>
        </span>
        <span className="text-white/40 text-xs">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-white/10">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-white/40">
                <th className="px-4 py-1.5 text-left font-medium">Brand</th>
                <th className="px-3 py-1.5 text-center font-medium w-20">Health</th>
                <th className="px-3 py-1.5 text-right font-medium w-16">Open</th>
                <th className="px-3 py-1.5 text-right font-medium w-16">WIP</th>
                <th className="px-3 py-1.5 text-right font-medium w-20">Blocked</th>
                <th className="px-3 py-1.5 text-right font-medium w-20">Aging</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const status = rag(r);
                return (
                  <tr
                    key={r.brand}
                    onClick={() => onPickBrand?.(r.brand)}
                    className={`border-t border-white/[0.06] ${onPickBrand ? "cursor-pointer hover:bg-white/[0.04]" : ""} transition`}
                  >
                    <td className="px-4 py-2 text-white/85">{r.brand}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${ragCls[status]}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-white/70">{r.open}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-white/70">{r.wip}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.blocked > 0 ? "text-red-300" : "text-white/40"}`}>
                      {r.blocked}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.aging > 0 ? "text-red-300" : "text-white/40"}`}>
                      {r.aging}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TableView({
  items,
  onOpenRoom,
  groupBy,
}: {
  items: ActionItem[];
  onOpenRoom: (id: string) => void;
  groupBy: GroupKey;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  function toggleSort(k: SortKey) {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setDir("asc");
    }
  }

  const statusRank: Record<string, number> = { TRIAGE: 0, TODO: 1, WIP: 2, BLOCKED: 3, DONE: 4 };
  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "id":
          cmp = (Number(a.id) || 0) - (Number(b.id) || 0);
          break;
        case "title":
          cmp = (a.title || "").localeCompare(b.title || "");
          break;
        case "status":
          cmp = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
          break;
        case "owner":
          cmp = String(a.owner).localeCompare(String(b.owner));
          break;
        case "priority":
          cmp = (a.priority || "P3").localeCompare(b.priority || "P3");
          break;
        case "age":
          cmp = ageDays(a.createdAt) - ageDays(b.createdAt);
          break;
        case "due":
          cmp = (a.due || "~").localeCompare(b.due || "~");
          break;
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sortKey, dir]);

  const headers: Array<{ k: SortKey; label: string; cls?: string }> = [
    { k: "id", label: "#", cls: "w-12 text-right" },
    { k: "priority", label: "Pri", cls: "w-14" },
    { k: "title", label: "Title" },
    { k: "status", label: "Status", cls: "w-28" },
    { k: "owner", label: "Owner", cls: "w-24" },
    { k: "age", label: "Age", cls: "w-16 text-right" },
    { k: "due", label: "Due", cls: "w-28" },
  ];

  // Group the (already sorted) rows. Order group headers sensibly per axis.
  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "", label: "", rows: sorted }];
    const map = new Map<string, ActionItem[]>();
    for (const it of sorted) {
      let keys: string[];
      if (groupBy === "status") keys = [it.status];
      else if (groupBy === "owner") keys = [String(it.owner) || "Open"];
      else if (groupBy === "priority") keys = [it.priority];
      else keys = (it.brands ?? []).length ? (it.brands as string[]) : ["(no brand)"];
      for (const k of keys) {
        const arr = map.get(k) ?? [];
        arr.push(it);
        map.set(k, arr);
      }
    }
    let keys = Array.from(map.keys());
    if (groupBy === "status") keys.sort((a, b) => (statusRank[a] ?? 9) - (statusRank[b] ?? 9));
    else keys = keys.sort((a, b) => a.localeCompare(b));
    return keys.map((k) => ({
      key: k,
      label: groupBy === "status" ? STATUS_LABEL[k as ActionStatus] ?? k : k,
      rows: map.get(k)!,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, groupBy]);

  if (items.length === 0) {
    return <div className="text-xs text-white/30 italic px-1 py-6">No items match the current filters.</div>;
  }

  const colCount = headers.length;

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-white/45">
            {headers.map((h) => (
              <th
                key={h.k}
                onClick={() => toggleSort(h.k)}
                className={`px-3 py-2 font-medium text-left cursor-pointer select-none hover:text-white/80 ${h.cls ?? ""}`}
              >
                {h.label}
                {sortKey === h.k && <span className="ml-1 text-white/70">{dir === "asc" ? "↑" : "↓"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.key || "all"}>
              {groupBy !== "none" && (
                <tr className="bg-white/[0.04]">
                  <td colSpan={colCount} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/60">
                    {g.label} <span className="text-white/35">· {g.rows.length}</span>
                  </td>
                </tr>
              )}
              {g.rows.map((it) => {
                const age = ageDays(it.createdAt);
                const ownerStr = String(it.owner);
                const isOpen = it.claimable || ownerStr.toLowerCase() === "open";
                return (
                  <tr
                    key={`${g.key}-${it.id}`}
                    onClick={() => onOpenRoom(it.id)}
                    className={`border-b border-white/[0.06] cursor-pointer hover:bg-white/[0.04] transition ${
                      it.status === "DONE" ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-3 py-2 text-right text-white/40 tabular-nums">{it.id}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-black/80 ${PRIORITY_DOT[it.priority]}`}
                        title={`Priority ${it.priority}`}
                      >
                        {it.priority.slice(1)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-white/90 max-w-0">
                      <div className="truncate">{it.title}</div>
                      {(it.brands ?? []).length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {(it.brands ?? []).map((b) => (
                            <span key={b} className={`px-1 rounded text-[9px] border ${brandColor(b)}`}>{b}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] border ${STATUS_HEAD[it.status]}`}>
                        {STATUS_LABEL[it.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {isOpen ? (
                        <span className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">Claim</span>
                      ) : (
                        <span className="text-white/70 text-xs">{ownerStr}</span>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums text-xs ${
                        it.status !== "DONE" && age > 14 ? "text-red-300" : "text-white/50"
                      }`}
                    >
                      {age}d
                    </td>
                    <td className="px-3 py-2 text-white/50 text-xs">{it.due || "—"}</td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Column({
  status,
  items,
  onOpenRoom,
  currentUser,
  defaultCategory,
  isWorker,
  selectMode,
  selectedIds,
  onToggleSelect,
  depCounts,
  defaultCollapsed,
}: {
  status: BoardStatus;
  items: ActionItem[];
  onOpenRoom: (id: string) => void;
  currentUser: string;
  defaultCategory: string;
  isWorker: boolean;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  depCounts?: Record<string, { blockedByOpen: number; blocks: number }>;
  defaultCollapsed?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  // Doc 983 / UX cleanup: DONE is an archive, not active work - collapse it by
  // default so it stops burying the board (347+ done rows). One click reveals it.
  const [collapsed, setCollapsed] = useState(Boolean(defaultCollapsed));
  const visible = collapsed ? [] : expanded ? items : items.slice(0, 25);
  const hiddenCount = collapsed ? 0 : items.length - visible.length;
  const pendingCount = items.reduce(
    (n, it) => n + ((it.updates || []).filter((u) => u.reviewStatus === "pending").length),
    0,
  );
  // Phase A (research roadmap): surface a soft WIP limit on the in-progress
  // column. Flow research says high WIP is the lever that inflates cycle time;
  // 5 active items per person is the team's stated target (see HelpModal).
  // Only WIP gets a limit — TODO is a backlog, DONE is an archive.
  const WIP_LIMIT = status === "WIP" ? 5 : null;
  const overWip = WIP_LIMIT !== null && items.length > WIP_LIMIT;
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className={`flex items-baseline justify-between border-b pb-1 ${STATUS_HEAD[status]}`}>
        <h3
          className="text-xs font-bold uppercase tracking-wider cursor-help"
          title={COLUMN_DOD[status]}
        >
          {STATUS_LABEL[status]}
          <span className="ml-1 text-[9px] opacity-50">ⓘ</span>
        </h3>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 rounded-full">
              {pendingCount} review
            </span>
          )}
          {WIP_LIMIT !== null ? (
            <span
              className={`text-xs font-medium ${overWip ? "text-red-300" : "text-white/40"}`}
              title={overWip
                ? `Over WIP limit — ${items.length} active vs target ${WIP_LIMIT}. High WIP slows cycle time.`
                : `WIP ${items.length} of target ${WIP_LIMIT}`}
            >
              {items.length}/{WIP_LIMIT}
              {overWip && <span className="ml-1" aria-hidden>⚠</span>}
            </span>
          ) : defaultCollapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="text-xs text-white/50 hover:text-white/90 transition flex items-center gap-1"
              title={collapsed ? "Show completed" : "Hide completed"}
            >
              {items.length}
              <span className="text-[9px]" aria-hidden>{collapsed ? "▸" : "▾"}</span>
            </button>
          ) : (
            <span className="text-xs text-white/40">{items.length}</span>
          )}
        </div>
      </div>

      {/* Per-column "+ add item" removed in favor of a single QuickAdd at the
          top of the board (Cmd+K modal + inline bar + voice + NL parse). */}

      {collapsed ? (
        items.length > 0 ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-white/45 hover:bg-white/5 hover:text-white/80 transition text-left"
          >
            {items.length} completed - hidden. Show
          </button>
        ) : (
          <div className="text-xs text-white/25 italic px-1 py-2">Nothing done yet.</div>
        )
      ) : (
      <div className="flex flex-col gap-2">
        {visible.map((it) => (
          <Card
            key={it.id}
            item={it}
            onOpenRoom={onOpenRoom}
            isWorker={isWorker}
            selectMode={selectMode}
            selected={selectedIds.has(it.id)}
            onToggleSelect={onToggleSelect}
            depCounts={depCounts}
          />
        ))}
        {hiddenCount > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-white/55 hover:bg-white/5 hover:text-white/90 transition"
          >
            Show {hiddenCount} more
          </button>
        )}
        {items.length === 0 && (
          <div className="text-xs text-white/30 italic px-1 py-2">No items.</div>
        )}
      </div>
      )}
    </div>
  );
}

function Card({
  item,
  onOpenRoom,
  isWorker,
  selectMode,
  selected,
  onToggleSelect,
  depCounts,
}: {
  item: ActionItem;
  onOpenRoom: (id: string) => void;
  isWorker: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  depCounts?: Record<string, { blockedByOpen: number; blocks: number }>;
}) {
  const [pending, start] = useTransition();
  const age = ageDays(item.createdAt);
  const cyc = cycleDays(item.createdAt, item.completedAt, item.status, item.updatedAt);
  const aging = item.status !== "DONE" && age > 14;
  // Doc 763 F1: stale = WIP/BLOCKED with no activity 5+ days. Distinct from
  // aging (raw age >14) so a fresh-but-stuck task still gets flagged.
  const stale = isStale(item);
  const serviceClass = item.serviceClass ?? "Standard";
  const ownerStr = String(item.owner);
  // Explicit multi-assignee list (lowercase slugs). When present it drives the
  // card's people badge instead of the single derived owner (so a 3-person task
  // doesn't misleadingly read "Z+I").
  const assigneeSlugs = item.assignees ?? [];
  const commentCount = (item.comments || []).length;
  const pendingReviews = (item.updates || []).filter((u) => u.reviewStatus === "pending").length;

  function setField(field: string, value: string) {
    const fd = new FormData();
    fd.set("id", item.id);
    fd.set("field", field);
    fd.set("value", value);
    start(() => patchField(fd));
  }

  function handleClaim() {
    const fd = new FormData();
    fd.set("id", item.id);
    start(() => claimTask(fd));
  }

  // Phase A (research roadmap): make work-item age preattentive. A left-edge
  // accent warms from transparent -> amber -> orange -> red as an active card
  // ages, so "this has been sitting too long" reads without parsing a badge.
  // Only active cards age; DONE is excluded. Paired with the existing day-count
  // badge so it's never color-alone.
  const ageAccent =
    item.status === "DONE"
      ? "transparent"
      : age > 21
      ? "rgba(239,68,68,0.9)" // red — past two SLE-ish windows
      : age > 14
      ? "rgba(249,115,22,0.85)" // orange — aging
      : age > 7
      ? "rgba(245,158,11,0.7)" // amber — getting old
      : "transparent";

  return (
    <div
      style={{ borderLeftColor: ageAccent, borderLeftWidth: ageAccent === "transparent" ? undefined : "3px" }}
      className={`group relative rounded-lg bg-zao-ink border p-3 text-sm transition ${
        selected
          ? "border-zao-accent/60 ring-2 ring-zao-accent/20"
          : stale
          ? "border-red-500/40 ring-1 ring-red-500/20"
          : serviceClass === "Expedite"
          ? "border-red-500/50"
          : "border-white/10 hover:border-white/20"
      } ${pending ? "opacity-60" : ""} ${item.status === "DONE" ? "opacity-60" : ""}`}
    >
      {(stale || serviceClass === "Expedite" || item.prUrl || item.videoUrl) && (
        <div className="absolute -top-1.5 -right-1.5 flex gap-1">
          {serviceClass === "Expedite" && (
            <span
              className="rounded-full bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 shadow-md shadow-red-500/40"
              title="Expedite class — workspace-wide 1-card cap"
            >
              EXPEDITE
            </span>
          )}
          {stale && serviceClass !== "Expedite" && (
            <span
              className="rounded-full bg-red-500/80 text-white text-[9px] font-bold px-1.5 py-0.5 shadow-md shadow-red-500/30"
              title="No activity 5+ days — investigate the blocker"
            >
              STALE
            </span>
          )}
          {item.videoUrl && (
            <a
              href={item.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-violet-500/80 text-white text-[9px] font-bold px-1.5 py-0.5 shadow-md shadow-violet-500/30 hover:bg-violet-500"
              title={`Video walkthrough: ${item.videoUrl}`}
              onClick={(e) => e.stopPropagation()}
            >
              ▶ VIDEO
            </a>
          )}
          {item.prUrl && (
            <a
              href={item.prUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-emerald-500/80 text-white text-[9px] font-bold px-1.5 py-0.5 shadow-md shadow-emerald-500/30 hover:bg-emerald-500"
              title={`PR ${item.prState ?? "open"}: ${item.prUrl}`}
              onClick={(e) => e.stopPropagation()}
            >
              PR{item.prNumber ? `#${item.prNumber}` : ""}
            </a>
          )}
        </div>
      )}
      <div className="flex items-start gap-2">
        {selectMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(item.id)}
            aria-label={`Select task #${item.id}`}
            className="mt-1 h-4 w-4 flex-shrink-0 rounded border-white/30 bg-[#0b1220] accent-zao-accent cursor-pointer"
          />
        )}
        <button
          aria-label={`Priority ${item.priority} — click to cycle`}
          title={`Priority ${item.priority} — click to cycle`}
          onClick={() => {
            const next =
              item.priority === "P1" ? "P2" : item.priority === "P2" ? "P3" : "P1";
            setField("priority", next);
          }}
          className={`mt-0.5 h-4 w-4 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-bold text-black/80 ${PRIORITY_DOT[item.priority]} hover:ring-2 ring-white/30`}
        >
          {/* a11y: never encode meaning by color alone — show the level (1/2/3) */}
          {item.priority.slice(1)}
        </button>
        <button
          onClick={() => onOpenRoom(item.id)}
          className="flex-1 text-left font-medium leading-snug hover:underline decoration-white/30"
        >
          {item.title}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {(item.claimable || ownerStr.toLowerCase() === "open") ? (
          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border border-amber-500/50 bg-amber-500/15 text-amber-300 font-bold">
            CLAIM
          </span>
        ) : assigneeSlugs.length > 0 ? (
          <span
            className="flex items-center gap-0.5"
            title={`Assigned: ${assigneeSlugs.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(", ")}`}
          >
            {assigneeSlugs.slice(0, 3).map((s) => (
              <span
                key={s}
                className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border border-white/15 bg-white/5 text-white/75"
              >
                {s.slice(0, 2).toUpperCase()}
              </span>
            ))}
            {assigneeSlugs.length > 3 && (
              <span className="text-[10px] text-white/40">+{assigneeSlugs.length - 3}</span>
            )}
          </span>
        ) : (
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border ${OWNER_BADGE[ownerStr] || OWNER_BADGE_FALLBACK}`}
            title={`Owner: ${ownerStr}`}
          >
            {ownerInitial(ownerStr)}
          </span>
        )}
        {item.urgent && (
          <span className="px-1.5 py-0.5 rounded text-[10px] border border-red-500/40 text-red-300 bg-red-500/10">
            URGENT
          </span>
        )}
        {item.important && (
          <span className="px-1.5 py-0.5 rounded text-[10px] border border-yellow-500/40 text-yellow-200 bg-yellow-500/10">
            IMPORTANT
          </span>
        )}
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] border ${CATEGORY_COLOR[String(item.category)] || CATEGORY_COLOR.Other}`}
        >
          {item.category}
        </span>
        {item.source && item.source !== "human-web" && (
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] border ${TASK_SOURCE_COLORS[item.source]}`}
            title={`Created via ${TASK_SOURCE_LABELS[item.source]}`}
          >
            {TASK_SOURCE_LABELS[item.source]}
          </span>
        )}
        {(() => {
          const origin = resolveSource({ legacyId: item.legacyId, legacySource: item.legacySource });
          if (origin.kind === "none" || !origin.url) return null;
          return (
            <a
              href={origin.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[10px] text-sky-300/80 hover:text-sky-200"
              title={`Origin: ${origin.label}`}
              onClick={(e) => e.stopPropagation()}
            >
              ↗ {origin.label}
            </a>
          );
        })()}
        {depCounts?.[item.dbId ?? ""]?.blockedByOpen ? (
          <span className="text-[10px] text-amber-300/80" title="blocked by open tasks">
            ↔ {depCounts[item.dbId!].blockedByOpen}
          </span>
        ) : null}
        {depCounts?.[item.dbId ?? ""]?.blocks ? (
          <span className="text-[10px] text-white/50" title="blocks other tasks">
            → {depCounts[item.dbId!].blocks}
          </span>
        ) : null}
        {(item.brands ?? []).map((b) => (
          <span
            key={b}
            className={`px-1.5 py-0.5 rounded text-[10px] border ${brandColor(b)}`}
            title={`Brand: ${b}`}
          >
            {b}
          </span>
        ))}
        <span
          className="px-1.5 py-0.5 rounded text-[10px] border border-white/10 text-white/60"
          title="DMAIC phase"
        >
          {item.phase}
        </span>
        {item.due && (() => {
          const u = dueUrgency(item.due, item.status);
          const cls =
            u === "overdue"
              ? "border-red-500/50 text-red-200 bg-red-500/15 font-semibold"
              : u === "soon"
              ? "border-amber-500/50 text-amber-200 bg-amber-500/10"
              : "border-white/10 text-white/60";
          return (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] border ${cls}`}
              title={u === "overdue" ? "Overdue" : u === "soon" ? "Due soon" : `Due ${item.due}`}
            >
              {u === "overdue" ? "⚠ " : ""}due {item.due}
            </span>
          );
        })()}
        {aging && (
          <span className="px-1.5 py-0.5 rounded text-[10px] border border-red-500/40 text-red-300 bg-red-500/10">
            {age}d old
          </span>
        )}
        {cyc !== null && (
          <span className="px-1.5 py-0.5 rounded text-[10px] border border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
            cycle {cyc}d
          </span>
        )}
      </div>

      {item.notes && (
        <p className="mt-2 text-xs text-white/55 line-clamp-2 whitespace-pre-wrap">{item.notes}</p>
      )}

      <div className="mt-2 flex gap-1 items-center">
        <select
          value={item.status}
          onChange={(e) => setField("status", e.target.value)}
          className="flex-1 text-[11px] rounded bg-[#0b1220] border border-white/10 px-1.5 py-1 text-white/80"
          disabled={pending}
        >
          {BOARD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          onClick={() => onOpenRoom(item.id)}
          className="text-[11px] rounded border border-white/10 px-2 py-1 text-white/70 hover:bg-white/5 whitespace-nowrap"
        >
          open
        </button>
        {/* Indicators */}
        {(item.claimable || ownerStr.toLowerCase() === "open") && (
          <button
            onClick={handleClaim}
            disabled={pending}
            className="text-[11px] rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 px-2 py-1 whitespace-nowrap transition disabled:opacity-50 font-medium"
          >
            Claim
          </button>
        )}
        {pendingReviews > 0 && (
          <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full">
            {pendingReviews}
          </span>
        )}
        {commentCount > 0 && (
          <span className="text-[10px] text-white/35" title={`${commentCount} comment${commentCount > 1 ? "s" : ""}`}>
            💬{commentCount}
          </span>
        )}
      </div>
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
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
function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

function WelcomeModal({
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

function TourModal({
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

function DailyReminderModal({
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

function Toast({
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
function ProjectPickerBar({
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
