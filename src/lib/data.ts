// Supabase-backed store for the unified `tasks` table (doc 692 unification).
// Replaces the GitHub Contents API. Server-side only (uses the service key).
// getActions / saveActions / newId / normalizeItem keep their signatures so
// route handlers and server components are unchanged.

import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  ActionDoc,
  ActionItem,
  ActionStatus,
  ActivityEvent,
  Comment,
  Phase,
  Priority,
  ServiceClass,
  TaskSource,
  TaskType,
  TaskUpdate,
} from "./types";
import { compareIds } from "./sort";
import { applyTaskDefaults, describeDefaults } from "./task-defaults";

export type {
  ActionStatus,
  Priority,
  Phase,
  Category,
  Owner,
  ActionItem,
  ActionDoc,
  TaskType,
  ReviewStatus,
  Comment,
  TaskUpdate,
  ActivityEvent,
} from "./types";

export {
  STATUSES,
  BOARD_STATUSES,
  PRIORITIES,
  PHASES,
  CATEGORIES,
  OWNERS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  SERVICE_CLASSES,
  SERVICE_CLASS_LABELS,
  SERVICE_CLASS_COLORS,
  COLUMN_DOD,
  TASK_SOURCES,
  TASK_SOURCE_LABELS,
  TASK_SOURCE_COLORS,
  PROJECT_STATUSES,
  ageDays,
  cycleDays,
  isAging,
  isStale,
  relativeTime,
} from "./types";

export type { ServiceClass, TaskSource, Project, ProjectStatus } from "./types";

// Cowork-sourced rows are this tracker's view of the unified table.
const LEGACY_SOURCE = "cowork-actions.json";

const STATUS_TO_DB: Record<ActionStatus, string> = {
  TRIAGE: "triage",
  TODO: "todo",
  WIP: "in_progress",
  BLOCKED: "blocked",
  DONE: "done",
};
const STATUS_FROM_DB: Record<string, ActionStatus> = {
  triage: "TRIAGE",
  todo: "TODO",
  in_progress: "WIP",
  blocked: "BLOCKED",
  done: "DONE",
};


function nowIso(): string {
  return new Date().toISOString();
}

let cachedClient: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY missing - cannot reach the tasks table");
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

// The set of columns every task read selects.
//
// This used to be built dynamically behind detectParentTaskIdColumn(), which
// probed information_schema on every cold request to find out whether migration
// 020 had been applied. That migration has been applied in production since it
// shipped, so the probe was a guaranteed-outcome round-trip on the hot path
// (the board's first query of every request). Removed: the column is part of
// the schema now, exactly like every other column here.
const TASK_COLUMNS =
  "id, legacy_id, legacy_source, title, status, owner_id, created_by, completed_by, category, " +
  "priority, phase, important, urgent, due, notes, completed_at, created_at, " +
  "updated_at, metadata, brands, service_class, archived_at, project_id, source, public_override, " +
  "parent_task_id";

interface TaskRow {
  id: string;
  legacy_id: string | null;
  legacy_source: string | null;
  title: string;
  status: string;
  owner_id: string | null;
  created_by: string | null;
  completed_by: string | null;
  category: string | null;
  priority: string | null;
  phase: string | null;
  important: boolean | null;
  urgent: boolean | null;
  due: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
  brands: string[] | null;
  service_class: string | null;
  archived_at: string | null;
  project_id: string | null;
  source: string | null;
  public_override: boolean | null;
  parent_task_id: string | null;
}

interface TeamMaps {
  idToOwner: Map<string, string>;
  ownerToId: Map<string, string>;
}

let cachedTeam: TeamMaps | null = null;
let cachedTeamExpiry = 0;
// Short TTL so a member added via /admin shows up within a minute without a
// process restart. Was a permanent module singleton (doc 766 finding #4 /
// agent A2): new members' UUIDs mapped to undefined -> owner rendered "Both".
const TEAM_CACHE_TTL_MS = 60_000;

/** Clear the team cache immediately (call after team_members mutations). */
export function invalidateTeamCache(): void {
  cachedTeam = null;
  cachedTeamExpiry = 0;
}

async function teamMaps(): Promise<TeamMaps> {
  if (cachedTeam && Date.now() < cachedTeamExpiry) return cachedTeam;
  const { data, error } = await db().from("team_members").select("id, legacy_owner");
  if (error) throw new Error(`team_members read failed: ${error.message}`);
  const idToOwner = new Map<string, string>();
  const ownerToId = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; legacy_owner: string | null }>) {
    if (!row.legacy_owner) continue;
    idToOwner.set(row.id, row.legacy_owner);
    ownerToId.set(row.legacy_owner.toLowerCase(), row.id);
  }
  cachedTeam = { idToOwner, ownerToId };
  cachedTeamExpiry = Date.now() + TEAM_CACHE_TTL_MS;
  return cachedTeam;
}

export function normalizeItem(
  raw: Partial<ActionItem> & { id: string; title: string },
): ActionItem {
  const created = raw.createdAt || nowIso();
  const base: ActionItem = {
    dbId: raw.dbId,
    id: raw.id,
    title: raw.title,
    createdBy: (raw.createdBy as string) || "",
    owner: (raw.owner as string) || "Open",
    status: (raw.status as ActionStatus) || "TODO",
    category: (raw.category as string) || "Other",
    priority: (raw.priority as Priority) || "P2",
    important: Boolean(raw.important),
    urgent: Boolean(raw.urgent),
    completedAt: (raw.completedAt as string) || "",
    completedBy: (raw.completedBy as string) || "",
    phase: (raw.phase as Phase) || "Define",
    due: raw.due || "",
    notes: raw.notes || "",
    createdAt: created,
    updatedAt: raw.updatedAt || created,
    brands: Array.isArray(raw.brands) ? raw.brands : [],
  };
  // Preserve optional operational workspace fields
  if (raw.taskType !== undefined) base.taskType = raw.taskType as TaskType;
  if (raw.requiresApproval !== undefined) base.requiresApproval = raw.requiresApproval;
  if (raw.assignedTo !== undefined) base.assignedTo = raw.assignedTo;
  if (raw.claimable !== undefined) base.claimable = raw.claimable;
  if (Array.isArray(raw.assignees)) base.assignees = raw.assignees.map(String);
  if (raw.comments !== undefined) base.comments = raw.comments;
  if (raw.updates !== undefined) base.updates = raw.updates;
  if (raw.activity !== undefined) base.activity = raw.activity;
  // Doc 763 additions
  if (raw.serviceClass !== undefined) base.serviceClass = raw.serviceClass as ServiceClass;
  if (raw.archivedAt !== undefined) base.archivedAt = raw.archivedAt;
  if (raw.prUrl !== undefined) base.prUrl = raw.prUrl;
  if (raw.prNumber !== undefined) base.prNumber = raw.prNumber;
  if (raw.prState !== undefined) base.prState = raw.prState;
  // Doc 764 F5
  if (raw.videoUrl !== undefined) base.videoUrl = raw.videoUrl;
  // Doc 765 Phase I
  if (raw.projectId !== undefined) base.projectId = raw.projectId;
  if (raw.source !== undefined) base.source = raw.source as TaskSource;
  // Doc 009 public layer
  if (raw.publicOverride !== undefined) base.publicOverride = raw.publicOverride;
  // Subtasks
  if (raw.parentTaskId !== undefined) base.parentTaskId = raw.parentTaskId;
  if (Array.isArray(raw.subtasks)) base.subtasks = raw.subtasks;
  // Explicit related tasks
  if (Array.isArray(raw.relatedIds)) base.relatedIds = raw.relatedIds;
  // Event fields
  if (raw.isEvent !== undefined) base.isEvent = raw.isEvent;
  if (raw.eventAt !== undefined) base.eventAt = raw.eventAt;
  if (raw.eventLocation !== undefined) base.eventLocation = raw.eventLocation;
  if (raw.eventUrl !== undefined) base.eventUrl = raw.eventUrl;
  return base;
}

function rowToItem(row: TaskRow, team: TeamMaps): ActionItem {
  const meta = row.metadata ?? {};
  const ownerName = row.owner_id ? team.idToOwner.get(row.owner_id) : null;
  const createdByName = row.created_by ? team.idToOwner.get(row.created_by) : null;
  const completedByName = row.completed_by ? team.idToOwner.get(row.completed_by) : null;
  const dueMeta = typeof meta.due === "string" ? meta.due : null;
  const item: ActionItem = {
    dbId: row.id,
    id: row.legacy_id ?? row.id,
    title: row.title,
    createdBy: createdByName ?? "",
    owner: ownerName ?? "Open",
    status: STATUS_FROM_DB[row.status] ?? "TODO",
    category: row.category ?? "Other",
    priority: (row.priority as Priority) ?? "P2",
    important: Boolean(row.important),
    urgent: Boolean(row.urgent),
    completedAt: row.completed_at ?? "",
    completedBy: completedByName ?? "",
    phase: (row.phase as Phase) ?? "Define",
    // Prefer the dedicated column (queryable, authoritative) over the metadata
    // copy; metadata only holds free-text dues now (doc 766 finding #7).
    due: row.due ?? dueMeta ?? "",
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    brands: Array.isArray(row.brands) ? row.brands : [],
  };
  // Operational workspace fields live in the metadata jsonb column
  if (typeof meta.taskType === "string") item.taskType = meta.taskType as TaskType;
  if (typeof meta.requiresApproval === "boolean") item.requiresApproval = meta.requiresApproval;
  if (typeof meta.assignedTo === "string") item.assignedTo = meta.assignedTo;
  if (typeof meta.claimable === "boolean") item.claimable = meta.claimable;
  if (Array.isArray(meta.assignees)) item.assignees = (meta.assignees as unknown[]).map(String);
  if (Array.isArray(meta.comments)) item.comments = meta.comments as Comment[];
  if (Array.isArray(meta.updates)) item.updates = meta.updates as TaskUpdate[];
  if (Array.isArray(meta.activity)) item.activity = meta.activity as ActivityEvent[];
  // Doc 763 dedicated columns (preferred over metadata for queryability)
  if (row.service_class) item.serviceClass = row.service_class as ServiceClass;
  if (row.archived_at) item.archivedAt = row.archived_at;
  // Doc 765 Phase I columns
  if (row.project_id) item.projectId = row.project_id;
  if (row.source) item.source = row.source as TaskSource;
  // Legacy identity fields for source resolver (origin link generation)
  if (row.legacy_id) item.legacyId = row.legacy_id;
  if (row.legacy_source) item.legacySource = row.legacy_source;
  // PR linkage still lives in metadata for now (no dedicated column yet)
  if (typeof meta.prUrl === "string") item.prUrl = meta.prUrl;
  if (typeof meta.prNumber === "number") item.prNumber = meta.prNumber;
  if (typeof meta.prState === "string") item.prState = meta.prState as "open" | "merged" | "closed";
  // Doc 764 F5: videoUrl stored in metadata jsonb (no dedicated column)
  if (typeof meta.videoUrl === "string") item.videoUrl = meta.videoUrl;
  // Doc 009 public layer: public_override (null=inherit, true=show, false=hide)
  if (row.public_override !== undefined) item.publicOverride = row.public_override;
  // Doc 983: theme tags + judgment-routing owner (auto-tagger, metadata jsonb)
  if (Array.isArray(meta.themes)) item.themes = (meta.themes as string[]).filter((t) => typeof t === "string");
  if (meta.next_owner === "me" || meta.next_owner === "agent" || meta.next_owner === "review" || meta.next_owner === "blocked") {
    item.nextOwner = meta.next_owner;
  }
  // Subtasks: parent_task_id for hierarchical organization
  if (row.parent_task_id) item.parentTaskId = row.parent_task_id;
  // Explicit related tasks: bidirectional informational links
  if (Array.isArray(meta.relatedIds)) item.relatedIds = (meta.relatedIds as string[]).filter((id) => typeof id === "string");
  // Event fields: tasks flagged as events with scheduled date/time (stored in metadata)
  if (typeof meta.isEvent === "boolean") item.isEvent = meta.isEvent;
  if (typeof meta.eventAt === "string") item.eventAt = meta.eventAt;
  if (typeof meta.eventLocation === "string") item.eventLocation = meta.eventLocation;
  if (typeof meta.eventUrl === "string") item.eventUrl = meta.eventUrl;
  return item;
}

function buildMetadata(item: ActionItem): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  // Only stash a free-text due (e.g. "end of Q2") in metadata. ISO dates live
  // in the dedicated `due` column; storing them here too let the metadata copy
  // shadow a column update forever (doc 766 finding #7).
  if (item.due && !/^\d{4}-\d{2}-\d{2}$/.test(item.due)) meta.due = item.due;
  if (item.taskType !== undefined) meta.taskType = item.taskType;
  if (item.requiresApproval !== undefined) meta.requiresApproval = item.requiresApproval;
  if (item.assignedTo !== undefined) meta.assignedTo = item.assignedTo;
  if (item.claimable !== undefined) meta.claimable = item.claimable;
  if (item.assignees !== undefined) meta.assignees = item.assignees;
  if (item.comments !== undefined) meta.comments = item.comments;
  if (item.updates !== undefined) meta.updates = item.updates;
  if (item.activity !== undefined) meta.activity = item.activity;
  if (item.prUrl !== undefined && item.prUrl !== null) meta.prUrl = item.prUrl;
  if (item.prNumber !== undefined && item.prNumber !== null) meta.prNumber = item.prNumber;
  if (item.prState !== undefined && item.prState !== null) meta.prState = item.prState;
  if (item.videoUrl !== undefined && item.videoUrl !== null) meta.videoUrl = item.videoUrl;
  if (Array.isArray(item.relatedIds) && item.relatedIds.length > 0) meta.relatedIds = item.relatedIds;
  // Event fields: stored in metadata jsonb (no dedicated columns)
  if (item.isEvent !== undefined) meta.isEvent = item.isEvent;
  if (item.eventAt !== undefined && item.eventAt !== null) meta.eventAt = item.eventAt;
  if (item.eventLocation !== undefined && item.eventLocation !== null) meta.eventLocation = item.eventLocation;
  if (item.eventUrl !== undefined && item.eventUrl !== null) meta.eventUrl = item.eventUrl;
  return meta;
}

function itemToRow(item: ActionItem, team: TeamMaps): Record<string, unknown> {
  const ownerStr = String(item.owner ?? "");
  const ownerKey =
    ownerStr && ownerStr !== "Both" && ownerStr !== "Open" ? ownerStr.toLowerCase() : null;
  const dueIsDate = /^\d{4}-\d{2}-\d{2}$/.test(item.due);
  const row: Record<string, unknown> = {
    legacy_source: LEGACY_SOURCE,
    legacy_id: item.id,
    kind: "task",
    project: /wavewarz/i.test(String(item.category)) ? "wavewarz" : "zaodevz",
    title: item.title,
    status: STATUS_TO_DB[item.status] ?? "todo",
    owner_id: ownerKey ? (team.ownerToId.get(ownerKey) ?? null) : null,
    created_by: item.createdBy
      ? (team.ownerToId.get(item.createdBy.toLowerCase()) ?? null)
      : null,
    completed_by: item.completedBy
      ? (team.ownerToId.get(item.completedBy.toLowerCase()) ?? null)
      : null,
    category: item.category || null,
    priority: item.priority || null,
    phase: item.phase || null,
    important: Boolean(item.important),
    urgent: Boolean(item.urgent),
    due: dueIsDate ? item.due : null,
    notes: item.notes || null,
    completed_at: item.completedAt || null,
    created_at: item.createdAt || nowIso(),
    updated_at: nowIso(),
    metadata: buildMetadata(item),
    brands: Array.isArray(item.brands) ? item.brands : [],
    service_class: item.serviceClass ?? "Standard",
    archived_at: item.archivedAt ?? null,
    // Doc 765 Phase I
    project_id: item.projectId ?? null,
    source: item.source ?? "human-web",
  };
  row.parent_task_id = item.parentTaskId ?? null;
  // Event fields are stored in metadata (no dedicated columns)
  // buildMetadata() handles including them in the metadata object above
  return row;
}

// The expensive part of getActions — the full paginated table read + archive
// pass — memoized per request via React cache(). Multiple getActions() calls in
// one render (a page + its child widgets all load the board) previously each ran
// the whole thing; now the DB work happens once and callers share the result.
// Returns the canonical items; getActions() hands each caller an independent
// deep copy so one caller's in-memory mutations can't leak through the cache.
const loadBoard = cache(async (): Promise<ActionItem[]> => {
  const team = await teamMaps();

  // Read EVERY task regardless of legacy_source. Pre-unification the read was
  // scoped to legacy_source='cowork-actions.json' which hid meeting-captured
  // and bug-fix tasks from the board. Now they all show; writes target the
  // row by UUID (dbId), so cross-source tasks are fully editable.
  //
  // Paginate explicitly: PostgREST caps a select at 1000 rows by default, so a
  // plain .select() silently truncated the board once it passed 1000 tasks —
  // dropping whole tasks (and all their comments/updates/activity) from every
  // view, which is why some users' posts went missing from the activity feed.
  // We page by the UUID primary key (stable total order) until a short page.
  const PAGE = 1000;
  const rows: TaskRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db()
      .from("tasks")
      .select(TASK_COLUMNS)
      // The board is private to the cowork team roster (team_members login), so
      // Zaal's personal (project=zaal-personal) items are folded into the shared
      // board + my-work rather than a separate /agentic-todos surface. They open
      // in the regular TaskRoom like any other task.
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`tasks read failed: ${error.message}`);
    const batch = (data ?? []) as unknown as TaskRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  const items = rows
    .map((row) => normalizeItem(rowToItem(row, team)))
    .sort((a, b) => compareIds(a.id, b.id));

  // Auto-archive (DONE older than 30 days, doc 763 F4) used to run HERE, which
  // meant every board render issued a DB *write* from inside a read path - on a
  // page already marked `force-dynamic`, so it fired on every request from
  // every user. It is a housekeeping sweep, not a read concern.
  //
  // Split in two: the *decision* stays on the read (pure, in-memory, so the UI
  // hides the same rows it always did, with zero behaviour change and zero
  // writes), and the *persistence* moves to the existing 15-minute auto-close
  // cron via sweepAutoArchive(). Without the in-memory half, DONE rows older
  // than 30 days would pop back onto the board until the next cron tick.
  return markArchivable(items);
});

export async function getActions(): Promise<ActionDoc> {
  const items = structuredClone(await loadBoard());
  // Snapshot the items as the caller sees them. saveActions diffs against THIS
  // (the read-time state) rather than re-reading at write time, so a task another
  // request created in the meantime isn't seen as "deleted" and clobbered
  // (doc 766 finding #1, the concurrent-save data-loss bug).
  return { updatedAt: nowIso(), items, before: structuredClone(items) };
}

/** A legacy_id is always numeric; this distinguishes it from a UUID primary key. */
export function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Read a single task by its app-facing id (legacy_id, the #N) or its UUID.
 * The targeted alternative to getActions() for the hot "patch one field on one
 * task" path, which otherwise loads the entire table just to find one row.
 * Querying the uuid `id` column with a non-uuid value errors in Postgres, so we
 * route by shape: UUID → `id`, otherwise → `legacy_id`.
 */
export async function getItem(idOrDbId: string): Promise<ActionItem | null> {
  const team = await teamMaps();

  const { data, error } = await db()
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq(looksLikeUuid(idOrDbId) ? "id" : "legacy_id", idOrDbId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`task read failed (${idOrDbId}): ${error.message}`);
  if (!data) return null;

  const item = normalizeItem(rowToItem(data as unknown as TaskRow, team));

  // Fetch subtasks if this is a parent task.
  if (item.dbId) {
    const { data: subtaskRows, error: subtaskError } = await db()
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("parent_task_id", item.dbId)
      .order("created_at", { ascending: true });

    if (!subtaskError && subtaskRows && subtaskRows.length > 0) {
      item.subtasks = subtaskRows.map((row) =>
        normalizeItem(rowToItem(row as unknown as TaskRow, team)),
      );
    }
  }

  return item;
}

/**
 * Targeted update of a single already-persisted task (must have a dbId). Writes
 * just that row by UUID — no full-table read or diff. Identity/source columns
 * are never rewritten (mirrors applyDiff's update branch). Pair with getItem()
 * for read-modify-write of one task without paying for the whole board.
 */
export async function saveItem(
  item: ActionItem,
  _actor: string,
  _summary: string,
): Promise<void> {
  if (!item.dbId) throw new Error(`saveItem: item ${item.id} has no dbId`);
  const team = await teamMaps();
  const row = itemToRow(item, team);
  delete row.legacy_source;
  delete row.legacy_id;
  delete row.kind;
  delete row.project;
  delete row.created_at;
  const { error } = await db().from("tasks").update(row).eq("id", item.dbId);
  if (error) throw new Error(`task update failed (${item.id}): ${error.message}`);
}

/**
 * Write the DB-assigned identity back onto an in-memory item after an INSERT.
 * App/bot creates insert with legacy_id = NULL and let the `tasks_slug_guard`
 * trigger (migration 015) assign the number from `tasks_legacy_id_seq` — a
 * race-free sequence, unlike the old `newId()` = max+1 over a stale read which
 * let two concurrent creates collide on legacy_id. We mirror rowToItem's
 * `legacy_id ?? id` rule so the app-facing id matches what a later read would
 * produce (and falls back to the UUID if the trigger is somehow absent).
 */
/**
 * Insert ONE new task. The targeted counterpart to saveItem().
 *
 * quickCreate used to go through getActions() + saveActions(), which reads the
 * entire tasks table (1200+ rows, paginated), structuredClones it TWICE, then
 * JSON.stringify-diffs every row - all to add a single task. On a serverless
 * function with a ~10-15s ceiling and no maxDuration configured, that is the
 * add path timing out under its own weight as the board grows. Reported from
 * the field as "can't add tasks / same error".
 *
 * None of that work was load-bearing: legacy_id is assigned by the DB trigger
 * (tasks_legacy_id_seq), so the caller's optimistic id is overwritten anyway.
 * This does the one INSERT and reads the assigned id back.
 */
export interface BrandRollup {
  brand: string;
  total: number;
  overdue: number;
  atRisk: number;
  inProgress: number;
}

/** Tasks due within this many days count as at-risk. */
export const AT_RISK_DAYS = 3;

/**
 * Per-brand rollup for the overview strip.
 *
 * Reads FOUR columns (brands, status, due, archived_at) for open tasks only -
 * not getActions(), which pulls 25 columns plus the metadata jsonb plus
 * comments/activity and structuredClones the result twice. Same row count,
 * a fraction of the payload, and no full-board clone.
 *
 * Aggregated in JS rather than SQL because `brands` is a text[] and grouping
 * it needs unnest(), which PostgREST cannot express - that would require a
 * database view. A view was deliberately avoided: migration 027 is not applied
 * yet, and shipping a page that hard-depends on an unapplied migration means
 * the feature is broken until someone runs it. Four narrow columns over ~300
 * rows is cheap enough that the view is not worth the deploy-ordering risk.
 *
 * AT-RISK vs OVERDUE: 127 of 309 open tasks are overdue (41%), so "overdue"
 * no longer discriminates - it is background noise. At-risk (due within
 * AT_RISK_DAYS and NOT already in progress) is the actionable signal: work
 * about to slip that nobody has started.
 */
export async function getBrandRollup(): Promise<BrandRollup[]> {
  const { data, error } = await db()
    .from("tasks")
    .select("brands, status, due")
    .is("archived_at", null)
    .neq("status", "done");
  if (error) throw new Error(`brand rollup failed: ${error.message}`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const riskCutoff = new Date(today);
  riskCutoff.setDate(riskCutoff.getDate() + AT_RISK_DAYS);

  const rows = (data ?? []) as Array<{
    brands: string[] | null;
    status: string | null;
    due: string | null;
  }>;

  const acc = new Map<string, BrandRollup>();
  const bump = (brand: string, row: (typeof rows)[number]) => {
    const cur = acc.get(brand) ?? { brand, total: 0, overdue: 0, atRisk: 0, inProgress: 0 };
    cur.total += 1;
    const inProgress = row.status === "in_progress";
    if (inProgress) cur.inProgress += 1;
    if (row.due) {
      const d = new Date(`${row.due}T00:00:00`);
      if (!Number.isNaN(d.getTime())) {
        if (d < today) cur.overdue += 1;
        // At-risk excludes work already underway - someone is on it.
        else if (d <= riskCutoff && !inProgress) cur.atRisk += 1;
      }
    }
    acc.set(brand, cur);
  };

  for (const row of rows) {
    const brands = Array.isArray(row.brands) && row.brands.length ? row.brands : [NO_BRAND];
    // A task tagged with two brands counts toward both - it is work each of
    // them is carrying.
    for (const b of brands) bump(b, row);
  }

  return [...acc.values()].sort(
    (a, b) => b.overdue - a.overdue || b.total - a.total || a.brand.localeCompare(b.brand),
  );
}

/** Label for tasks carrying no brand tag. Phrased as a to-do, not a category. */
export const NO_BRAND = "(needs a brand)";

/**
 * Board-wide headline counts, computed by the DATABASE.
 *
 * my-work, activity and task-chat each did this by pulling every task into
 * memory and running three .filter().length passes over 1200+ rows. Three
 * numbers do not justify reading the whole table - and it is the same
 * getActions() bottleneck that was breaking task creation, which is why those
 * pages were reported as erroring/blank (doc 2079 items B2/B3).
 *
 * `aging` uses created_at older than 14 days, matching ageDays(x.createdAt) > 14.
 */
export async function getBoardCounts(): Promise<{
  open: number;
  blocked: number;
  aging: number;
}> {
  const agingCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const base = () => db().from("tasks").select("id", { count: "exact", head: true }).is("archived_at", null);

  const [openRes, blockedRes, agingRes] = await Promise.all([
    base().neq("status", "done"),
    base().eq("status", "blocked"),
    base().neq("status", "done").lt("created_at", agingCutoff),
  ]);

  for (const r of [openRes, blockedRes, agingRes]) {
    if (r.error) throw new Error(`board counts failed: ${r.error.message}`);
  }
  return {
    open: openRes.count ?? 0,
    blocked: blockedRes.count ?? 0,
    aging: agingRes.count ?? 0,
  };
}

/**
 * Non-archived tasks only, optionally just the open ones.
 *
 * The board view legitimately needs every task. my-work, activity and calendar
 * do not - they need a slice, and pulling the DONE archive alongside it is pure
 * cost. Archived rows are excluded in SQL rather than filtered in JS.
 */
export async function listItems(opts: { openOnly?: boolean } = {}): Promise<ActionItem[]> {
  const team = await teamMaps();
  const PAGE = 1000;
  const rows: TaskRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = db().from("tasks").select(TASK_COLUMNS).is("archived_at", null);
    if (opts.openOnly) q = q.neq("status", "done");
    const { data, error } = await q.order("id", { ascending: true }).range(offset, offset + PAGE - 1);
    if (error) throw new Error(`tasks read failed: ${error.message}`);
    const batch = (data ?? []) as unknown as TaskRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows.map((row) => normalizeItem(rowToItem(row, team))).sort((a, b) => compareIds(a.id, b.id));
}

/**
 * Tasks flagged as events with a scheduled date - what /calendar renders.
 * isEvent/eventAt live in the metadata jsonb, so the filter is applied after
 * normalisation; the win here is dropping DONE + archived rows in SQL first.
 */
export async function listEventItems(): Promise<ActionItem[]> {
  const items = await listItems();
  return items.filter((it) => it.isEvent && it.eventAt);
}

export async function insertItem(item: ActionItem): Promise<ActionItem> {
  const team = await teamMaps();
  // Same required-basics pass applyDiff runs, so a task created through this
  // path is not shaped differently from one created through a full save.
  const { item: filled, applied } = applyTaskDefaults(item);
  Object.assign(item, filled);

  const row = itemToRow(item, team);
  // legacy_id NULL => the DB trigger owns id assignment, race-free.
  row.legacy_id = null;

  const { data, error } = await db()
    .from("tasks")
    .insert(row)
    .select("id, legacy_id")
    .single();
  if (error) throw new Error(`task insert failed (${item.title.slice(0, 40)}): ${error.message}`);

  assignPersistedId(item, data as { id: string; legacy_id: string | null });
  const summary = describeDefaults(applied);
  if (summary) console.info(`[data] task ${item.id}: auto-filled ${summary}`);
  return item;
}

export function assignPersistedId(
  item: ActionItem,
  row: { id: string; legacy_id: string | null },
): void {
  item.dbId = row.id;
  item.id = row.legacy_id ?? row.id;
}

async function applyDiff(
  before: ActionItem[],
  after: ActionItem[],
  team: TeamMaps,
): Promise<void> {
  // Key the diff by the real DB primary key (dbId / UUID), NOT by legacy_id.
  // getActions() reads every source, and legacy_id collides across sources
  // (e.g. a meeting-captured "meeting-5" and a cowork row can share an id).
  // Keying by legacy_id collapsed those distinct rows together and produced
  // spurious updates against the wrong UUID — which then tripped the
  // (legacy_source, legacy_id) unique constraint. Rows without a dbId are
  // brand-new (created in-app, not yet persisted) and become inserts.
  const beforeByDbId = new Map(
    before.filter((i) => i.dbId).map((i) => [i.dbId as string, i]),
  );
  // Recovery index: a read-then-write flow always sources items from a `before`
  // row that has a dbId. If an `after` item lost its dbId (a call site forgot to
  // carry it through normalizeItem), we can still recover it by matching the
  // legacy_id against the `before` snapshot rather than blindly INSERTing into a
  // UNIQUE(legacy_source, legacy_id) collision -> 500. This is the safety net
  // for the whole class of "save 500" bugs.
  const beforeDbIdByLegacy = new Map(
    before.filter((i) => i.dbId).map((i) => [i.id, i.dbId as string]),
  );
  for (const i of after) {
    if (!i.dbId) {
      const recovered = beforeDbIdByLegacy.get(i.id);
      if (recovered) {
        // A caller dropped dbId; recover it via legacy_id so this is treated as
        // an UPDATE not an INSERT. (Was console.warn — silent recovery is fine.)
        i.dbId = recovered;
      }
    }
  }
  const afterDbIds = new Set(
    after.filter((i) => i.dbId).map((i) => i.dbId as string),
  );

  const inserts = after.filter((i) => !i.dbId);
  const updates = after.filter((i) => {
    if (!i.dbId) return false;
    const prev = beforeByDbId.get(i.dbId);
    return prev && JSON.stringify(prev) !== JSON.stringify(i);
  });
  // Deleted = rows present in before but gone from after (matched by UUID).
  const deleteDbIds = before
    .filter((i) => i.dbId && !afterDbIds.has(i.dbId))
    .map((i) => i.dbId)
    .filter((v): v is string => Boolean(v));

  // Insert new rows with legacy_id = NULL so the DB trigger owns id assignment
  // (race-free via tasks_legacy_id_seq), reading the assigned id/UUID back onto
  // each item. Per-row (not batch) keeps each returned row unambiguously
  // correlated to its source item without relying on RETURNING order.
  for (const item of inserts) {
    // Enforce the three basics (owner / priority / due) at the single point
    // every new task funnels through, whatever created it - web QuickAdd, the
    // Telegram bot, a meeting capture, research dispatch. Doing it here rather
    // than in each caller's form is what keeps it zero-friction: nobody is
    // asked for more input, the row just can't land incomplete.
    const { item: filled, applied } = applyTaskDefaults(item);
    Object.assign(item, filled);
    const row = itemToRow(item, team);
    row.legacy_id = null;
    const { data, error } = await db()
      .from("tasks")
      .insert(row)
      .select("id, legacy_id")
      .single();
    if (error) throw new Error(`task insert failed (${item.id}): ${error.message}`);
    assignPersistedId(item, data as { id: string; legacy_id: string | null });
    const summary = describeDefaults(applied);
    if (summary) {
      console.info(`[data] task ${item.id}: auto-filled ${summary}`);
    }
  }
  for (const item of updates) {
    if (!item.dbId) {
      // Shouldn't happen for a read-then-update flow, but if dbId is missing
      // we cannot target the row safely — skip instead of mass-updating.
      continue;
    }
    const row = itemToRow(item, team);
    // Never rewrite identity / source-scoping columns on update. We target the
    // row by its UUID, so legacy_source/legacy_id/kind/project/created_at are
    // immutable here. Rewriting legacy_source to the cowork value re-homes the
    // row into another source's namespace and can violate the
    // (legacy_source, legacy_id) unique constraint.
    delete row.legacy_source;
    delete row.legacy_id;
    delete row.kind;
    delete row.project;
    delete row.created_at;
    const { error } = await db()
      .from("tasks")
      .update(row)
      .eq("id", item.dbId);
    if (error) throw new Error(`task update failed (${item.id}): ${error.message}`);
  }
  if (deleteDbIds.length) {
    const { error } = await db()
      .from("tasks")
      .delete()
      .in("id", deleteDbIds);
    if (error) throw new Error(`task delete failed: ${error.message}`);
  }
}

export async function saveActions(
  doc: ActionDoc,
  _actor: string,
  _summary: string,
): Promise<void> {
  const team = await teamMaps();
  // Diff against the snapshot captured when the caller read (doc.before), NOT a
  // fresh read. Re-reading here pulled in rows other requests inserted between
  // the caller's read and this write, then applyDiff treated those rows as
  // deletes (absent from the caller's `doc.items`) and erased them. Falling back
  // to a fresh read keeps old call sites that build a doc by hand working.
  const before = doc.before ?? (await getActions()).items;
  await applyDiff(before, doc.items, team);
}

export function newId(existing: ActionItem[]): string {
  const max = existing.reduce((m, it) => {
    const n = parseInt(it.id, 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return String(max + 1);
}

// DONE items older than this are archived out of the default board view.
export const ARCHIVE_DAYS = 30;

/** Does this item qualify for auto-archive? Pure. */
function isArchivable(it: ActionItem, cutoffMs: number): boolean {
  if (it.status !== "DONE") return false;
  if (it.archivedAt) return false;
  const completed = it.completedAt || it.updatedAt;
  if (!completed) return false;
  const t = new Date(completed).getTime();
  return Number.isFinite(t) && t < cutoffMs;
}

/**
 * Read half of auto-archive: tag qualifying items in memory so the board hides
 * them exactly as it did when this was a write. No DB access, no mutation of
 * the input. The tag is provisional until sweepAutoArchive() persists it.
 */
function markArchivable(items: ActionItem[]): ActionItem[] {
  const cutoffMs = Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000;
  const provisional = nowIso();
  let any = false;
  const out = items.map((it) => {
    if (!isArchivable(it, cutoffMs)) return it;
    any = true;
    return { ...it, archivedAt: provisional };
  });
  return any ? out : items;
}

/**
 * Write half of auto-archive. Runs on the 15-minute auto-close cron rather than
 * on every board render. Returns how many rows it stamped.
 *
 * Queries the DB directly instead of going through loadBoard() so the cron
 * doesn't pull the whole table into memory just to find a handful of rows.
 */
export async function sweepAutoArchive(): Promise<{ archived: number }> {
  const cutoffIso = new Date(Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db()
    .from("tasks")
    .update({ archived_at: nowIso() })
    .eq("status", "done")
    .is("archived_at", null)
    .lt("completed_at", cutoffIso)
    .select("id");
  if (error) {
    console.warn(`[data] auto-archive sweep failed: ${error.message}`);
    return { archived: 0 };
  }
  return { archived: (data ?? []).length };
}

