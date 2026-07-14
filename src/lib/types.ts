// TRIAGE added 2026-05-26 (doc 763 F6) as the inbox for external writers
// (NL /todo parser, Telegram bot, /meeting skill, research-dispatcher).
// Leads route TRIAGE -> TODO via the /admin/triage UI before work begins.
// Kept at the front of STATUSES so the Board's column rendering picks it
// up first; UI code conditionally hides the TRIAGE column on the main
// board (only admins see it) since regular workers shouldn't be triaging.
export type ActionStatus = "TRIAGE" | "TODO" | "WIP" | "BLOCKED" | "DONE";
export const STATUSES: ActionStatus[] = ["TRIAGE", "TODO", "WIP", "BLOCKED", "DONE"];
// Statuses rendered on the main Board (TRIAGE lives in /admin/triage only).
// Typed narrowly so the columns map in Board.tsx stays type-safe; the four
// values are a subset of ActionStatus and the constant assertion lets
// the byStatus Record type include exactly these four keys.
export type BoardStatus = "TODO" | "WIP" | "BLOCKED" | "DONE";
export const BOARD_STATUSES: BoardStatus[] = ["TODO", "WIP", "BLOCKED", "DONE"];

export type Priority = "P1" | "P2" | "P3";
export const PRIORITIES: Priority[] = ["P1", "P2", "P3"];

// Service classes (doc 763 F2). Layer above priority that captures the
// shape-of-cost-of-delay. Standard = linear, FixedDate = step function,
// Expedite = immediate (1 card max workspace-wide), Intangible =
// accelerating (tech debt). Mapped to colors + rules in the UI.
export type ServiceClass = "Standard" | "FixedDate" | "Expedite" | "Intangible";
export const SERVICE_CLASSES: ServiceClass[] = ["Standard", "FixedDate", "Expedite", "Intangible"];
export const SERVICE_CLASS_LABELS: Record<ServiceClass, string> = {
  Standard: "Standard",
  FixedDate: "Fixed date",
  Expedite: "Expedite",
  Intangible: "Intangible",
};

export type Phase = "Define" | "Measure" | "Analyze" | "Improve" | "Control";
export const PHASES: Phase[] = ["Define", "Measure", "Analyze", "Improve", "Control"];

export type TaskType =
  | "task"
  | "work_order"
  | "incident"
  | "approval_request"
  | "goal"
  | "maintenance";
export const TASK_TYPES: TaskType[] = [
  "task", "work_order", "incident", "approval_request", "goal", "maintenance",
];
export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  task: "Task",
  work_order: "Work Order",
  incident: "Incident",
  approval_request: "Approval Request",
  goal: "Goal",
  maintenance: "Maintenance",
};

export type ReviewStatus = "pending" | "approved" | "rejected" | "changes_requested";

export type Category =
  | "ZAO Devz"
  | "Site / Tech"
  | "Ops"
  | "Bounty"
  | "Other"
  | "WaveWarZ Zambia"
  | "Recording"
  | "Distribution"
  | "Release"
  | "Artist Onboarding"
  | "Social"
  | "Brand"
  | "Content"
  | "Campaigns"
  | "Infrastructure"
  | "Security";

export const CATEGORIES: Category[] = [
  "ZAO Devz", "Site / Tech", "Ops", "Bounty", "Other",
  "WaveWarZ Zambia", "Recording", "Distribution", "Release", "Artist Onboarding",
  "Social", "Brand", "Content", "Campaigns", "Infrastructure", "Security",
];

export const DEV_CATEGORIES: string[] = [
  "ZAO Devz", "Site / Tech", "Ops", "Bounty", "Infrastructure", "Security", "Other",
];
export const MUSIC_CATEGORIES: string[] = ["WaveWarZ Zambia", "Recording", "Distribution", "Release", "Artist Onboarding"];
export const MARKETING_CATEGORIES: string[] = ["Social", "Brand", "Content", "Campaigns"];

// Tyler joined 2026-05-23 (PR #13). Shawn joined 2026-05-27 as ZAOstock
// lead (via /admin Users panel). Jose joined 2026-07-12 as testing teammate.
// Real long-term fix: populate OWNERS at runtime from team_members so adding
// via /admin reflects without a code change. For now we manually mirror new
// users here so they appear in dropdowns + parse-task + bulk reassign.
export type Owner = "Zaal" | "Iman" | "Jose" | "Both" | "ThyRev" | "Samantha" | "Tyler" | "Shawn" | "Open";
export const OWNERS: Owner[] = ["Zaal", "Iman", "Jose", "Both", "ThyRev", "Samantha", "Tyler", "Shawn", "Open"];

// Resolve the set of people (lowercase login slugs) effectively assigned to a
// task. The explicit `assignees` list wins when present; otherwise we derive it
// from the legacy `owner` field. Crucially, "Both" maps to ZAAL + IMAN only —
// NOT "whoever is logged in" (the old `owner === "both"` checks made every new
// teammate inherit all ~80 Both tasks). "Open"/blank = nobody.
export function effectiveAssignees(it: { owner?: Owner | string; assignees?: string[] }): string[] {
  if (it.assignees && it.assignees.length > 0) {
    return it.assignees.map((a) => String(a).trim().toLowerCase()).filter(Boolean);
  }
  const o = String(it.owner ?? "").trim().toLowerCase();
  if (o === "both") return ["zaal", "iman"];
  if (!o || o === "open") return [];
  return [o];
}

// Is `userSlug` one of the task's effective assignees? The single source of
// truth for "is this mine?" across My Work, the board My-Tasks filter, counts,
// and the personal digest.
export function isAssignedTo(
  it: { owner?: Owner | string; assignees?: string[] },
  userSlug: string,
): boolean {
  return effectiveAssignees(it).includes(String(userSlug).trim().toLowerCase());
}

export interface Comment {
  id: string;
  userId: string;
  displayName: string;
  content: string;
  createdAt: string;
  editedAt?: string;
}

export interface TaskUpdate {
  id: string;
  submittedBy: string;
  displayName: string;
  content: string;
  fromStatus?: ActionStatus;
  toStatus?: ActionStatus;
  reviewStatus: ReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  userId: string;
  displayName: string;
  action: string;
  detail?: string;
  createdAt: string;
}

export type ActionItem = {
  // Supabase row UUID - the real primary key. Used to scope writes so update/
  // delete works for any task regardless of legacy_source (meeting captures,
  // PR-test tasks, bug-fix tasks, etc all live alongside the cowork-actions
  // ones). Missing only for newly-built items before their first insert.
  dbId?: string;
  id: string;
  title: string;
  createdBy: string;
  owner: Owner | string;
  // Multi-assignee: lowercase login slugs of everyone assigned (the per-todo
  // people checkboxes). When present it's the source of truth for "who owns
  // this"; `owner` is kept derived for back-compat (badges, legacy filters).
  assignees?: string[];
  status: ActionStatus;
  category: Category | string;
  priority: Priority;
  important: boolean;
  urgent: boolean;
  completedAt: string;
  completedBy: string;
  phase: Phase;
  due: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  // Ecosystem brand tags - empty array = no brand assigned. Multiple brands
  // allowed for cross-brand tasks. Canonical names defined in lib/brands.ts.
  brands: string[];
  // Cross-cutting theme tags (web3/ai/music/events/growth/governance/research)
  // from the auto-tagger, stored in metadata.themes. Doc 983.
  themes?: string[];
  // Judgment-routing axis: who the next move belongs to. me = Zaal's hands-on,
  // agent = a terminal/agent is working it, review = agent output awaiting Zaal,
  // blocked = waiting on an external. From metadata.next_owner. Doc 983.
  nextOwner?: "me" | "agent" | "review" | "blocked";
  // Operational workspace extensions
  taskType?: TaskType;
  requiresApproval?: boolean;
  assignedTo?: string;
  claimable?: boolean;
  comments?: Comment[];
  updates?: TaskUpdate[];
  activity?: ActivityEvent[];
  // Service class layer above priority (doc 763 F2). Default "Standard"
  // on items created before the 004 migration; backfill seeded P1 -> Expedite,
  // due-set rows -> FixedDate, refactor/cleanup -> Intangible.
  serviceClass?: ServiceClass;
  // Set when the row is auto-archived (DONE + completedAt older than 30d)
  // or manually archived by an admin. Hidden from the default Board view
  // (doc 763 F4); a "Show archived" toggle exposes them.
  archivedAt?: string | null;
  // GitHub PR linkage (doc 763 F3). Auto-populated by the /api/github/webhook
  // handler when a PR title mentions `cowork#<id>`. UI renders a link icon
  // on cards. Null = no PR yet.
  prUrl?: string | null;
  prNumber?: number | null;
  prState?: "open" | "merged" | "closed" | null;
  // Video walkthrough URL (doc 764 F5). Pasted by user, supports Loom /
  // YouTube / Vimeo. UI renders a small purple play icon + embed in TaskRoom.
  videoUrl?: string | null;
  // Doc 765 Phase I: project layer. Nullable - tasks without a project
  // appear under the "General" bucket on the board. Set via TaskRoom
  // picker, NL parser (`^slug` prefix), or bot `/add #project-slug ...`.
  projectId?: string | null;
  // Doc 765 decision 2: source taxonomy. Who wrote this row? Set at
  // creation time by the writer, never re-set after. Defaults to
  // 'human-web' for the existing web QuickAdd path.
  source?: TaskSource;
  // Legacy identity fields - track origin (GitHub PR, research doc, meeting,
  // or cowork-actions.json). Used by source-resolver to build origin links.
  // These are sourced from the database columns during read; immutable per
  // (legacy_source, legacy_id) unique constraint.
  legacyId?: string | null;
  legacySource?: string;
  // Doc 009 public layer: null=inherit from project, true=show, false=hide
  publicOverride?: boolean | null;
  // Subtasks: parent_task_id enables hierarchical task organization
  // Used for daily tasks rolling up work items and import-to-daily flow
  parentTaskId?: string | null;
  // Child tasks for this parent (populated on read)
  subtasks?: ActionItem[];
  // Explicit related tasks: bidirectional informational links. Array of task IDs
  // (app-facing legacy_id or UUID). Stored in metadata.relatedIds for persistence.
  relatedIds?: string[];
};

// Provenance taxonomy (doc 765 decision 2). Every task carries exactly
// one. Used by the activity feed filter + audit log + future analytics
// ("how many tasks per week come from the Telegram bot?").
export type TaskSource =
  | "human-web"
  | "human-bot"
  | "meeting-capture"
  | "research-dispatch"
  | "pr-test-task"
  | "ai-proposal"
  | "system-cleanup"
  | "external-api";

export const TASK_SOURCES: TaskSource[] = [
  "human-web",
  "human-bot",
  "meeting-capture",
  "research-dispatch",
  "pr-test-task",
  "ai-proposal",
  "system-cleanup",
  "external-api",
];

export const TASK_SOURCE_LABELS: Record<TaskSource, string> = {
  "human-web": "Web",
  "human-bot": "Telegram",
  "meeting-capture": "Meeting",
  "research-dispatch": "Research",
  "pr-test-task": "PR test",
  "ai-proposal": "AI proposal",
  "system-cleanup": "Cleanup",
  "external-api": "External",
};

// Tailwind chip colors per source. Picked so writer types are visually
// distinct on the cards + feed.
export const TASK_SOURCE_COLORS: Record<TaskSource, string> = {
  "human-web": "bg-blue-500/15 text-blue-200 border-blue-500/30",
  "human-bot": "bg-cyan-500/15 text-cyan-200 border-cyan-500/30",
  "meeting-capture": "bg-amber-500/15 text-amber-200 border-amber-500/30",
  "research-dispatch": "bg-violet-500/15 text-violet-200 border-violet-500/30",
  "pr-test-task": "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
  "ai-proposal": "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-500/30",
  "system-cleanup": "bg-slate-500/15 text-slate-200 border-slate-500/30",
  "external-api": "bg-pink-500/15 text-pink-200 border-pink-500/30",
};

// Project type (doc 765 Phase I). Cross-task grouping for time-bounded
// initiatives. Sits between brand and task in the conceptual hierarchy.
export type ProjectStatus = "active" | "paused" | "completed" | "cancelled";
export const PROJECT_STATUSES: ProjectStatus[] = ["active", "paused", "completed", "cancelled"];

export interface Project {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  brandDefault: string | null;
  startedAt: string | null;
  targetDate: string | null;
  closedAt: string | null;
  closedBy: string | null;
  color: string;
  sortOrder: number;
  createdAt: string;
  createdBy: string | null;
  isPublic: boolean;
}

export type ActionDoc = {
  updatedAt: string;
  items: ActionItem[];
  // Pristine snapshot of `items` at read time, set by getActions(). saveActions
  // diffs against this instead of re-reading, to avoid clobbering rows other
  // requests created concurrently. Optional so hand-built docs still work.
  before?: ActionItem[];
};

export function ageDays(createdAt: string): number {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function cycleDays(
  createdAt: string,
  completedAt: string,
  status: ActionStatus,
  updatedAt?: string,
): number | null {
  if (status !== "DONE") return null;
  // Cycle time = created -> completed. Was using updatedAt, which advances every
  // time a DONE task is touched (comment, brand edit), inflating the metric
  // (doc 766 finding #8). Fall back to updatedAt only when completedAt is empty.
  const end = completedAt || updatedAt;
  if (!end) return null;
  const ms = new Date(end).getTime() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function isAging(it: ActionItem): boolean {
  if (it.status === "DONE") return false;
  return ageDays(it.createdAt) > 14;
}

// Stale: WIP or BLOCKED with no activity in 5+ days. Surfaces "started but
// forgotten" work that aging alone misses (a card that's only 3 days old
// but has zero activity since creation is also worth flagging).
export function isStale(it: ActionItem): boolean {
  if (it.status === "DONE" || it.status === "TRIAGE") return false;
  const acts = it.activity ?? [];
  // Use the freshest of: last activity, last update, last comment, updatedAt.
  const latest = Math.max(
    acts.length ? new Date(acts[acts.length - 1].createdAt).getTime() : 0,
    (it.updates ?? []).reduce((m, u) => Math.max(m, new Date(u.createdAt).getTime()), 0),
    (it.comments ?? []).reduce((m, c) => Math.max(m, new Date(c.createdAt).getTime()), 0),
    new Date(it.updatedAt).getTime(),
  );
  const days = (Date.now() - latest) / (1000 * 60 * 60 * 24);
  return days > 5;
}

// Service-class color tokens (Tailwind class strings) so cards + chips
// pull from a single source of truth. Used by Board.tsx + ServiceClassChip.
export const SERVICE_CLASS_COLORS: Record<ServiceClass, string> = {
  Standard: "bg-slate-500/15 text-slate-200 border-slate-500/30",
  FixedDate: "bg-amber-500/15 text-amber-200 border-amber-500/40",
  Expedite: "bg-red-500/20 text-red-200 border-red-500/50",
  Intangible: "bg-violet-500/15 text-violet-200 border-violet-500/30",
};

// Definition-of-Done text per column. Surfaced as tooltips on column
// headers (doc 763 F5). Edit here; the Board reads from this object.
export const COLUMN_DOD: Record<ActionStatus, string> = {
  TRIAGE: "External writers land here. Lead routes: set owner + brand + priority + service class, then push to TODO.",
  TODO: "Has owner + priority + service class. Not yet started. Pull when free.",
  WIP: "Actively being worked on. PR open or work in flight. Owner committed within last 3 days.",
  BLOCKED: "Cannot progress without external input. Has a comment naming the blocker. Owner pings the blocker daily.",
  DONE: "Lead approved (or workflow auto-approved). PR merged + deployed. Acceptance verified. Auto-archives after 30 days.",
};

export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
