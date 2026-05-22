"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  STATUSES,
  PRIORITIES,
  PHASES,
  CATEGORIES,
  OWNERS,
  ageDays,
  cycleDays,
  type ActionItem,
  type ActionStatus,
  type Owner,
  type Priority,
} from "@/lib/types";
import { quickCreate, patchField, claimTask } from "@/app/actions";
import { TaskRoom } from "./TaskRoom";
import { TodoPanel, TodoTrigger } from "./TodoPanel";
import { NotificationBell } from "./NotificationBell";

const STATUS_LABEL: Record<ActionStatus, string> = {
  TODO: "TO DO",
  WIP: "IN PROGRESS",
  BLOCKED: "BLOCKED",
  DONE: "DONE",
};

const STATUS_HEAD: Record<ActionStatus, string> = {
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
  mineOnly: boolean;
  agingOnly: boolean;
};

const EMPTY_FILTERS: Filters = {
  search: "",
  owner: "",
  category: "",
  priority: "",
  phase: "",
  mineOnly: true,
  agingOnly: false,
};

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
}: {
  items: ActionItem[];
  currentUser: string;
  portalCategories: string[];
  defaultCategory: string;
}) {
  const router = useRouter();
  // Land on "my open work" by default, not the full firehose.
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS, mineOnly: true });
  const [activeMobileStatus, setActiveMobileStatus] = useState<ActionStatus>("TODO");
  const [taskRoomId, setTaskRoomId] = useState<string | null>(null);
  const [todoOpen, setTodoOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);
  const prevById = useRef<Map<string, ActionItem>>(new Map());

  const userLabel =
    currentUser.trim().toLowerCase() === "zaal"
      ? "Zaal"
      : currentUser.trim().toLowerCase() === "iman"
      ? "Iman"
      : currentUser.trim().toLowerCase() === "thyrev"
      ? "ThyRev"
      : "Samantha";
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
  }, [items, filters, currentUser]);

  const byStatus = useMemo(() => {
    const map: Record<ActionStatus, ActionItem[]> = {
      TODO: [],
      WIP: [],
      BLOCKED: [],
      DONE: [],
    };
    for (const it of filtered) map[it.status].push(it);
    for (const s of STATUSES) {
      map[s].sort((a, b) => {
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
  const isWorker = ["thyrev", "samantha"].includes(currentUser.trim().toLowerCase());
  const filtersActive =
    filters.search ||
    filters.owner ||
    filters.category ||
    filters.priority ||
    filters.phase ||
    filters.mineOnly ||
    filters.agingOnly;

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

      <FilterBar
        filters={filters}
        onChange={setFilters}
        currentUser={currentUser}
        onHelp={() => setHelpOpen(true)}
        portalCategories={portalCategories}
        items={items}
        isLeadUser={!isWorker}
        onOpenTask={setTaskRoomId}
      />

      {filtersActive && (
        <div className="text-xs text-white/50">
          showing {filtered.length} of {items.length} items
          <button
            onClick={() => setFilters({ ...EMPTY_FILTERS, mineOnly: true })}
            className="ml-3 underline hover:text-white/80"
          >
            clear filters
          </button>
        </div>
      )}

      {/* Mobile: status tabs + single column */}
      <div className="md:hidden">
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-zao-ink p-1 border border-white/10">
          {STATUSES.map((s) => (
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
          />
        </div>
      </div>

      {/* Desktop: 4 columns */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {STATUSES.map((s) => (
          <Column
            key={s}
            status={s}
            items={byStatus[s]}
            onOpenRoom={setTaskRoomId}
            currentUser={currentUser}
            defaultCategory={defaultCategory}
            isWorker={isWorker}
          />
        ))}
      </div>

      {/* Task Room */}
      {taskRoomItem && (
        <TaskRoom
          item={taskRoomItem}
          currentUser={currentUser}
          onClose={() => setTaskRoomId(null)}
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
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  currentUser: string;
  onHelp: () => void;
  portalCategories: string[];
  items: ActionItem[];
  isLeadUser: boolean;
  onOpenTask: (id: string) => void;
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

function Column({
  status,
  items,
  onOpenRoom,
  currentUser,
  defaultCategory,
  isWorker,
}: {
  status: ActionStatus;
  items: ActionItem[];
  onOpenRoom: (id: string) => void;
  currentUser: string;
  defaultCategory: string;
  isWorker: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 25);
  const hiddenCount = items.length - visible.length;
  const pendingCount = items.reduce(
    (n, it) => n + ((it.updates || []).filter((u) => u.reviewStatus === "pending").length),
    0,
  );
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className={`flex items-baseline justify-between border-b pb-1 ${STATUS_HEAD[status]}`}>
        <h3 className="text-xs font-bold uppercase tracking-wider">
          {STATUS_LABEL[status]}
        </h3>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 rounded-full">
              {pendingCount} review
            </span>
          )}
          <span className="text-xs text-white/40">{items.length}</span>
        </div>
      </div>

      <QuickAddForm
        status={status}
        currentUser={currentUser}
        defaultCategory={defaultCategory}
        isWorker={isWorker}
      />

      <div className="flex flex-col gap-2">
        {visible.map((it) => (
          <Card key={it.id} item={it} onOpenRoom={onOpenRoom} isWorker={isWorker} />
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

function QuickAddForm({
  status,
  currentUser,
  defaultCategory,
  isWorker,
}: {
  status: ActionStatus;
  currentUser: string;
  defaultCategory: string;
  isWorker: boolean;
}) {
  const [pending, start] = useTransition();
  const defaultOwner = ((): Owner => {
    const me = currentUser.trim().toLowerCase();
    if (me === "zaal") return "Zaal";
    if (me === "iman") return "Iman";
    if (me === "thyrev") return "ThyRev";
    if (me === "samantha") return "Samantha";
    return "Open";
  })();
  const [important, setImportant] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [priority, setPriority] = useState<Priority>("P2");
  const [owner, setOwner] = useState<Owner>(defaultOwner);

  return (
    <form
      action={(fd) => {
        fd.set("status", status);
        if (!fd.get("category")) fd.set("category", defaultCategory);
        fd.set("owner", owner);
        fd.set("priority", priority);
        if (important) fd.set("important", "1");
        if (urgent) fd.set("urgent", "1");
        start(() => quickCreate(fd));
        const titleEl = document.querySelector<HTMLInputElement>(
          `input[data-quick-add="${status}"]`,
        );
        if (titleEl) titleEl.value = "";
        setImportant(false);
        setUrgent(false);
        setPriority("P2");
        setOwner(defaultOwner);
      }}
      className="rounded-xl bg-black/20 border border-white/10 p-2"
    >
      <div className="grid grid-cols-12 gap-2">
        <input
          name="title"
          data-quick-add={status}
          placeholder="+ add item"
          className="col-span-12 lg:col-span-6 rounded-lg bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-zao-accent/60"
          disabled={pending}
          required
        />
        <select
          value={owner}
          onChange={(e) => setOwner(e.target.value as Owner)}
          className="col-span-6 lg:col-span-2 rounded-lg bg-[#0b1220] border border-white/10 px-2 py-2 text-sm text-white/80"
          disabled={pending}
          aria-label="Responsible"
        >
          {OWNERS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="col-span-6 lg:col-span-1 rounded-lg bg-[#0b1220] border border-white/10 px-2 py-2 text-sm text-white/80"
          disabled={pending}
          aria-label="Priority"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="col-span-12 lg:col-span-3 rounded-lg bg-zao-accent hover:bg-blue-500 px-3 py-2 text-sm font-medium transition disabled:opacity-60"
          disabled={pending}
        >
          Enter task
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setImportant((v) => !v)}
          className={`px-2 py-1 rounded-md text-[11px] border transition ${
            important
              ? "border-yellow-400/60 bg-yellow-500/15 text-yellow-200"
              : "border-white/10 text-white/55 hover:text-white/80 hover:bg-white/5"
          }`}
          disabled={pending}
        >
          Important
        </button>
        <button
          type="button"
          onClick={() => setUrgent((v) => !v)}
          className={`px-2 py-1 rounded-md text-[11px] border transition ${
            urgent
              ? "border-red-400/60 bg-red-500/15 text-red-200"
              : "border-white/10 text-white/55 hover:text-white/80 hover:bg-white/5"
          }`}
          disabled={pending}
        >
          Urgent
        </button>
      </div>
    </form>
  );
}

function Card({
  item,
  onOpenRoom,
  isWorker,
}: {
  item: ActionItem;
  onOpenRoom: (id: string) => void;
  isWorker: boolean;
}) {
  const [pending, start] = useTransition();
  const age = ageDays(item.createdAt);
  const cyc = cycleDays(item.createdAt, item.updatedAt, item.status);
  const aging = item.status !== "DONE" && age > 14;
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

  return (
    <div
      className={`group relative rounded-lg bg-zao-ink border border-white/10 hover:border-white/20 p-3 text-sm transition ${
        pending ? "opacity-60" : ""
      } ${item.status === "DONE" ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button
          aria-label="Cycle priority"
          title={`Priority ${item.priority} — click to cycle`}
          onClick={() => {
            const next =
              item.priority === "P1" ? "P2" : item.priority === "P2" ? "P3" : "P1";
            setField("priority", next);
          }}
          className={`mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[item.priority]} hover:ring-2 ring-white/30`}
        />
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
          {STATUSES.filter((s) => !(isWorker && s === "DONE")).map((s) => (
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
