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
  PRIORITIES,
  PHASES,
  CATEGORIES,
  OWNERS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  ageDays,
  cycleDays,
  isAging,
  relativeTime,
} from "./types";

// Cowork-sourced rows are this tracker's view of the unified table.
const LEGACY_SOURCE = "cowork-actions.json";

const STATUS_TO_DB: Record<ActionStatus, string> = {
  TODO: "todo",
  WIP: "in_progress",
  BLOCKED: "blocked",
  DONE: "done",
};
const STATUS_FROM_DB: Record<string, ActionStatus> = {
  todo: "TODO",
  in_progress: "WIP",
  blocked: "BLOCKED",
  done: "DONE",
};

const TASK_COLUMNS =
  "id, legacy_id, title, status, owner_id, created_by, completed_by, category, " +
  "priority, phase, important, urgent, due, notes, completed_at, created_at, " +
  "updated_at, metadata, brands";

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
  const items = ((data ?? []) as unknown as TaskRow[])
    .map((row) => normalizeItem(rowToItem(row, team)))
    .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  return { updatedAt: nowIso(), items };
}

async function applyDiff(
  before: ActionItem[],
  after: ActionItem[],
  team: TeamMaps,
): Promise<void> {
  const beforeById = new Map(before.map((i) => [i.id, i]));
  const afterById = new Map(after.map((i) => [i.id, i]));

  const inserts = after.filter((i) => !beforeById.has(i.id));
  const updates = after.filter((i) => {
    const prev = beforeById.get(i.id);
    return prev && JSON.stringify(prev) !== JSON.stringify(i);
  });
  // Map deleted items to their Supabase UUIDs (dbId). Items missing dbId are
  // not in the DB yet, so they are no-op deletes - drop them safely.
  const deleteDbIds = before
    .filter((i) => !afterById.has(i.id))
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
    const { error } = await db()
      .from("tasks")
      .update(itemToRow(item, team))
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
