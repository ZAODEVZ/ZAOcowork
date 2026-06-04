"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
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
  type ActionItem,
  type ActionStatus,
  type Owner,
  type Priority,
  type ServiceClass,
} from "@/lib/types";
import { BRANDS, brandColor } from "@/lib/brands";
import { patchField, claimTask } from "@/app/actions";
import { TaskRoom } from "./TaskRoom";
import { TodoPanel, TodoTrigger } from "./TodoPanel";
import { NotificationBell } from "./NotificationBell";
import { QuickAdd } from "./quickadd/QuickAdd";
import { BulkActionBar } from "./BulkActionBar";

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
  Both: "bg-slate-500/20 text-slate-200 border-slate-500/40",
  Open: "bg-amber-500/20 text-amber-300 border-amber-500/40",
};

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
  mineOnly: boolean;
  agingOnly: boolean;
};

const EMPTY_FILTERS: Filters = {
  search: "",
  owner: "",
  category: "",
  priority: "",
  phase: "",
  brands: [],
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
];

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
}) {
  const router = useRouter();
  // Land on "my open work" by default, not the full firehose. Subsequent
  // visits restore the last filter state from localStorage so the board picks
  // up where you left off (per-user key so teammates do not share state).
  const filterStorageKey = `cowork-board-filters:${currentUser || "anon"}`;
  const [filters, setFilters] = useState<Filters>(() => {
    if (typeof window === "undefined") return { ...EMPTY_FILTERS, mineOnly: true };
    try {
      const raw = window.localStorage.getItem(filterStorageKey);
      if (!raw) return { ...EMPTY_FILTERS, mineOnly: true };
      const parsed = JSON.parse(raw) as Partial<Filters> & { brand?: string };
      return { ...EMPTY_FILTERS, ...migrateFilters(parsed) };
    } catch {
      return { ...EMPTY_FILTERS, mineOnly: true };
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(filterStorageKey, JSON.stringify(filters));
    } catch {
      // localStorage full / disabled - silently ignore, view just will not persist.
    }
  }, [filters, filterStorageKey]);
  const [activeMobileStatus, setActiveMobileStatus] = useState<BoardStatus>("TODO");
  // Board vs Table view (research roadmap Phase A/B). Cards are bad at
  // multivariate comparison/bulk-scan (NN/g); a table is the standard second
  // layout in mature PM tools. Persisted so the choice sticks per browser.
  const [view, setView] = useState<"board" | "table">("board");
  useEffect(() => {
    try {
      const v = window.localStorage.getItem("zao-board-view");
      if (v === "table" || v === "board") setView(v);
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
  // Phase H: TaskRoom can be opened via the ?task=<id> URL param so a
  // /todo/N permalink lands the user directly on the task. We sync both
  // ways - state -> URL (history.replaceState so back button works) and
  // URL -> state (initial load + back/forward navigation).
  const searchParams = useSearchParams();
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
  const lowered = currentUser.trim().toLowerCase();
  const userLabel = KNOWN_LABELS[lowered] ?? (lowered ? lowered.charAt(0).toUpperCase() + lowered.slice(1) : "User");
  const storageUserKey = userLabel.trim().toLowerCase() || "user";
  const todayKey = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), 120_000);
    return () => window.clearInterval(id);
  }, [router]);

  useEffect(() => {
    const key = `zao-cowork-welcome-v1:${storageUserKey}`;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(key) === "1") return;
    setWelcomeOpen(true);
  }, [storageUserKey]);

  useEffect(() => {
    const lastSeenKey = `zao-cowork-last-seen:${storageUserKey}`;
    const lastSeenRaw =
      typeof window === "undefined" ? "" : window.localStorage.getItem(lastSeenKey) || "";
    const lastSeenMs = lastSeenRaw ? new Date(lastSeenRaw).getTime() : 0;
    const mine = storageUserKey;
    const openMine = items.filter((it) => {
      if (it.status === "DONE") return false;
      const o = String(it.owner).toLowerCase();
      return o === mine || o === "both";
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
      return created === mine && completedBy && completedBy !== mine;
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

  const tagBucket = (it: ActionItem): number => {
    if (it.important && it.urgent) return 0;
    if (it.urgent) return 1;
    if (it.important) return 2;
    return 3;
  };

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return items.filter((it) => {
      if (q) {
        const hay = `${it.title} ${it.notes} ${it.category} ${it.owner}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.owner && it.owner !== filters.owner) return false;
      if (filters.category && it.category !== filters.category) return false;
      if (filters.priority && it.priority !== filters.priority) return false;
      if (filters.phase && it.phase !== filters.phase) return false;
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
        const mine = currentUser.toLowerCase();
        const o = String(it.owner).toLowerCase();
        const isOpenTask = it.claimable || o === "open";
        if (o !== mine && o !== "both" && !isOpenTask) return false;
      }
      if (filters.agingOnly && it.status !== "DONE") {
        if (ageDays(it.createdAt) <= 14) return false;
      } else if (filters.agingOnly && it.status === "DONE") {
        return false;
      }
      return true;
    });
  }, [items, filters, currentUser, urlBrand, urlProjectId]);

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
  }, [filtered, tagBucket]);

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
    filters.mineOnly ||
    filters.agingOnly ||
    !!urlBrand;

  return (
    <div className="space-y-4">
      {welcomeOpen && (
        <WelcomeModal
          userLabel={userLabel}
          onClose={() => {
            window.localStorage.setItem(`zao-cowork-welcome-v1:${storageUserKey}`, "1");
            setWelcomeOpen(false);
          }}
          onTour={() => {
            window.localStorage.setItem(`zao-cowork-welcome-v1:${storageUserKey}`, "1");
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
      />

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
        {/* View switcher: Board (Kanban) vs Table (compare/bulk-scan) */}
        <div className="flex items-center gap-0.5 rounded-lg bg-zao-ink border border-white/10 p-0.5 flex-shrink-0">
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
      </div>

      {view === "table" && (
        <TableView items={filtered} onOpenRoom={setTaskRoomId} />
      )}

      {/* Mobile: status tabs + single column */}
      <div className={view === "table" ? "hidden" : "md:hidden"}>
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
        />
      )}

      {/* Desktop: 4 columns */}
      <div className={`${view === "table" ? "hidden" : "hidden md:grid"} md:grid-cols-2 lg:grid-cols-4 gap-4`}>
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
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const me = currentUser.charAt(0).toUpperCase() + currentUser.slice(1);
  return (
    <div className="space-y-2 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-3">
      <div className="flex gap-2">
        <input
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Search title, notes, owner..."
          className="flex-1 rounded-xl bg-[#0b1220] border border-white/10 px-3 py-2 text-sm placeholder-white/30 focus:outline-none focus:border-zao-accent text-white"
        />
        <NotificationBell items={items} currentUser={currentUser} isLeadUser={isLeadUser} onOpenTask={onOpenTask} />
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
        <button
          onClick={onHelp}
          className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5"
          aria-label="Help"
          title="How to use"
        >
          ?
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Pill
          active={filters.mineOnly}
          onClick={() => set({ mineOnly: !filters.mineOnly })}
          label={filters.mineOnly ? `My Tasks` : `All Tasks`}
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
      </div>
      {!urlBrand && (
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
}: {
  items: ActionItem[];
  onOpenRoom: (id: string) => void;
  isWorker: boolean;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
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

function TableView({
  items,
  onOpenRoom,
}: {
  items: ActionItem[];
  onOpenRoom: (id: string) => void;
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

  if (items.length === 0) {
    return <div className="text-xs text-white/30 italic px-1 py-6">No items match the current filters.</div>;
  }

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
          {sorted.map((it) => {
            const age = ageDays(it.createdAt);
            const ownerStr = String(it.owner);
            const isOpen = it.claimable || ownerStr.toLowerCase() === "open";
            return (
              <tr
                key={it.id}
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
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 25);
  const hiddenCount = items.length - visible.length;
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
          ) : (
            <span className="text-xs text-white/40">{items.length}</span>
          )}
        </div>
      </div>

      {/* Per-column "+ add item" removed in favor of a single QuickAdd at the
          top of the board (Cmd+K modal + inline bar + voice + NL parse). */}

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
}: {
  item: ActionItem;
  onOpenRoom: (id: string) => void;
  isWorker: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const [pending, start] = useTransition();
  const age = ageDays(item.createdAt);
  const cyc = cycleDays(item.createdAt, item.updatedAt, item.status);
  const aging = item.status !== "DONE" && age > 14;
  // Doc 763 F1: stale = WIP/BLOCKED with no activity 5+ days. Distinct from
  // aging (raw age >14) so a fresh-but-stuck task still gets flagged.
  const stale = isStale(item);
  const serviceClass = item.serviceClass ?? "Standard";
  const ownerStr = String(item.owner);
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
        ) : (
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border ${OWNER_BADGE[ownerStr] || OWNER_BADGE.Both}`}
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
        {item.due && (
          <span className="px-1.5 py-0.5 rounded text-[10px] border border-white/10 text-white/60">
            due {item.due}
          </span>
        )}
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
          {BOARD_STATUSES.filter((s) => !(isWorker && s === "DONE")).map((s) => (
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
    const o = String(it.owner).toLowerCase();
    return o === mine || o === "both";
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
          href="/"
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
