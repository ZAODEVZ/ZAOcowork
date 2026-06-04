// Supabase-backed store for the unified `tasks` table (doc 692 unification).
// Replaces the GitHub Contents API. Server-side only (uses the service key).
// getActions / saveActions / newId / normalizeItem keep their signatures so
// route handlers and server components are unchanged.

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

const TASK_COLUMNS =
  "id, legacy_id, title, status, owner_id, created_by, completed_by, category, " +
  "priority, phase, important, urgent, due, notes, completed_at, created_at, " +
  "updated_at, metadata, brands, service_class, archived_at, project_id, source";

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

interface TaskRow {
  id: string;
  legacy_id: string | null;
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
}

interface TeamMaps {
  idToOwner: Map<string, string>;
  ownerToId: Map<string, string>;
}

let cachedTeam: TeamMaps | null = null;
async function teamMaps(): Promise<TeamMaps> {
  if (cachedTeam) return cachedTeam;
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
    owner: (raw.owner as string) || "Both",
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
    owner: ownerName ?? "Both",
    status: STATUS_FROM_DB[row.status] ?? "TODO",
    category: row.category ?? "Other",
    priority: (row.priority as Priority) ?? "P2",
    important: Boolean(row.important),
    urgent: Boolean(row.urgent),
    completedAt: row.completed_at ?? "",
    completedBy: completedByName ?? "",
    phase: (row.phase as Phase) ?? "Define",
    due: dueMeta ?? row.due ?? "",
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
  if (Array.isArray(meta.comments)) item.comments = meta.comments as Comment[];
  if (Array.isArray(meta.updates)) item.updates = meta.updates as TaskUpdate[];
  if (Array.isArray(meta.activity)) item.activity = meta.activity as ActivityEvent[];
  // Doc 763 dedicated columns (preferred over metadata for queryability)
  if (row.service_class) item.serviceClass = row.service_class as ServiceClass;
  if (row.archived_at) item.archivedAt = row.archived_at;
  // Doc 765 Phase I columns
  if (row.project_id) item.projectId = row.project_id;
  if (row.source) item.source = row.source as TaskSource;
  // PR linkage still lives in metadata for now (no dedicated column yet)
  if (typeof meta.prUrl === "string") item.prUrl = meta.prUrl;
  if (typeof meta.prNumber === "number") item.prNumber = meta.prNumber;
  if (typeof meta.prState === "string") item.prState = meta.prState as "open" | "merged" | "closed";
  // Doc 764 F5: videoUrl stored in metadata jsonb (no dedicated column)
  if (typeof meta.videoUrl === "string") item.videoUrl = meta.videoUrl;
  return item;
}

function buildMetadata(item: ActionItem): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (item.due) meta.due = item.due;
  if (item.taskType !== undefined) meta.taskType = item.taskType;
  if (item.requiresApproval !== undefined) meta.requiresApproval = item.requiresApproval;
  if (item.assignedTo !== undefined) meta.assignedTo = item.assignedTo;
  if (item.claimable !== undefined) meta.claimable = item.claimable;
  if (item.comments !== undefined) meta.comments = item.comments;
  if (item.updates !== undefined) meta.updates = item.updates;
  if (item.activity !== undefined) meta.activity = item.activity;
  if (item.prUrl !== undefined && item.prUrl !== null) meta.prUrl = item.prUrl;
  if (item.prNumber !== undefined && item.prNumber !== null) meta.prNumber = item.prNumber;
  if (item.prState !== undefined && item.prState !== null) meta.prState = item.prState;
  if (item.videoUrl !== undefined && item.videoUrl !== null) meta.videoUrl = item.videoUrl;
  return meta;
}

function itemToRow(item: ActionItem, team: TeamMaps): Record<string, unknown> {
  const ownerStr = String(item.owner ?? "");
  const ownerKey =
    ownerStr && ownerStr !== "Both" && ownerStr !== "Open" ? ownerStr.toLowerCase() : null;
  const dueIsDate = /^\d{4}-\d{2}-\d{2}$/.test(item.due);
  return {
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
}

export async function getActions(): Promise<ActionDoc> {
  const team = await teamMaps();
  // Read EVERY task regardless of legacy_source. Pre-this-PR the read was
  // scoped to legacy_source='cowork-actions.json' which hid meeting-captured
  // and bug-fix tasks from the board. Now they all show; writes target the
  // row by UUID (dbId), so cross-source tasks are fully editable.
  const { data, error } = await db()
    .from("tasks")
    .select(TASK_COLUMNS);
  if (error) throw new Error(`tasks read failed: ${error.message}`);
  let items = ((data ?? []) as unknown as TaskRow[])
    .map((row) => normalizeItem(rowToItem(row, team)))
    .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  // Auto-archive DONE rows older than 30 days (doc 763 F4). Mutates DB +
  // returns the items with archivedAt populated so the UI hides them
  // on this same render rather than waiting for the next read.
  items = await autoArchive(items);
  return { updatedAt: nowIso(), items };
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
        console.warn(
          `[data] recovered missing dbId for item ${i.id} via legacy_id — ` +
            `a caller dropped dbId; treating as UPDATE not INSERT`,
        );
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

  if (inserts.length) {
    const { error } = await db()
      .from("tasks")
      .insert(inserts.map((i) => itemToRow(i, team)));
    if (error) throw new Error(`task insert failed: ${error.message}`);
  }
  for (const item of updates) {
    if (!item.dbId) {
      // Shouldn't happen for a read-then-update flow, but if dbId is missing
      // we cannot target the row safely - skip + log instead of mass-updating.
      console.warn(`[data] update skipped: item ${item.id} has no dbId`);
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
  const current = await getActions();
  await applyDiff(current.items, doc.items, team);
}

export function newId(existing: ActionItem[]): string {
  const max = existing.reduce((m, it) => {
    const n = parseInt(it.id, 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return String(max + 1);
}

// Auto-archive DONE items older than 30 days. Called once per read in
// getActions when items count exceeds the archive threshold so a no-op
// path stays fast. Modifies the DB rows directly (one bulk UPDATE) and
// flags the resulting items in the returned doc so the UI doesn't show
// them in the default view.
const ARCHIVE_DAYS = 30;

async function autoArchive(items: ActionItem[]): Promise<ActionItem[]> {
  const cutoffMs = Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000;
  const dbIdsToArchive: string[] = [];
  for (const it of items) {
    if (it.status !== "DONE") continue;
    if (it.archivedAt) continue;
    const completed = it.completedAt || it.updatedAt;
    if (!completed) continue;
    const t = new Date(completed).getTime();
    if (Number.isFinite(t) && t < cutoffMs && it.dbId) {
      dbIdsToArchive.push(it.dbId);
    }
  }
  if (dbIdsToArchive.length === 0) return items;
  const archivedIso = nowIso();
  const { error } = await db()
    .from("tasks")
    .update({ archived_at: archivedIso })
    .in("id", dbIdsToArchive)
    .is("archived_at", null);
  if (error) {
    // Non-fatal: log + continue with in-memory tag so the view still hides
    // them on this request, real DB row will catch up on the next read.
    console.warn(`[data] auto-archive failed: ${error.message}`);
  }
  const dbIdSet = new Set(dbIdsToArchive);
  return items.map((it) =>
    it.dbId && dbIdSet.has(it.dbId) ? { ...it, archivedAt: archivedIso } : it,
  );
}

