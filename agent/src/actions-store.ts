// Supabase-backed store for the unified `tasks` table (doc 692 unification).
// Replaces the GitHub Contents API + SHA-dance. The bot's command surface is
// unchanged: fetchActions / mutateActions / makeActionItem / nextItemId keep
// their signatures. Each tasks row maps to the legacy ActionItem shape; the
// bot identifies its items by `legacy_id` within `legacy_source`.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { promises as fs } from 'node:fs';
import { COWORK_PATHS } from './paths';
import type { ActionsFile, ActionItem, ActionStatus, Owner, Phase, Priority } from './types';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Only cowork-sourced rows belong to this bot. ZAOstock + other projects
// share the unified table but stay out of the bot's view.
const LEGACY_SOURCE = 'cowork-actions.json';

const STATUS_TO_DB: Record<ActionStatus, string> = {
  TRIAGE: 'triage',
  TODO: 'todo',
  WIP: 'in_progress',
  BLOCKED: 'blocked',
  DONE: 'done',
};
const STATUS_FROM_DB: Record<string, ActionStatus> = {
  triage: 'TRIAGE',
  todo: 'TODO',
  in_progress: 'WIP',
  blocked: 'BLOCKED',
  done: 'DONE',
};

const TASK_COLUMNS =
  'id, legacy_id, title, status, owner_id, created_by, completed_by, category, ' +
  'priority, phase, important, urgent, due, notes, completed_at, created_at, ' +
  'updated_at, metadata, brands, source, project_id';

let cachedClient: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (cachedClient) return cachedClient;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY missing - cannot reach the tasks table');
  }
  cachedClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
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
  // Doc 765 Phase I + decision 2 columns. Nullable for backward-compat
  // with pre-006-migration rows; the bot defaults to 'human-bot' on
  // future writes.
  source?: string | null;
  project_id?: string | null;
}

interface TeamMaps {
  idToOwner: Map<string, string>; // team_members.id -> legacy_owner
  ownerToId: Map<string, string>; // legacy_owner lowercased -> team_members.id
}

let cachedTeam: TeamMaps | null = null;
async function teamMaps(): Promise<TeamMaps> {
  if (cachedTeam) return cachedTeam;
  const { data, error } = await db().from('team_members').select('id, legacy_owner');
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

function rowToItem(row: TaskRow, team: TeamMaps): ActionItem {
  const meta = row.metadata ?? {};
  const ownerName = row.owner_id ? team.idToOwner.get(row.owner_id) : null;
  const createdByName = row.created_by ? team.idToOwner.get(row.created_by) : null;
  const completedByName = row.completed_by ? team.idToOwner.get(row.completed_by) : null;
  const dueMeta = typeof meta.due === 'string' ? meta.due : null;
  return {
    dbId: row.id,
    id: row.legacy_id ?? row.id,
    title: row.title,
    createdBy: createdByName ?? '',
    owner: (ownerName as Owner) ?? 'Both',
    status: STATUS_FROM_DB[row.status] ?? 'TODO',
    category: row.category ?? 'Other',
    priority: (row.priority as Priority) ?? 'P2',
    important: Boolean(row.important),
    urgent: Boolean(row.urgent),
    completedAt: row.completed_at ?? '',
    completedBy: completedByName ?? '',
    phase: (row.phase as Phase) ?? 'Define',
    due: dueMeta ?? row.due ?? '',
    notes: row.notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    brands: Array.isArray(row.brands) ? row.brands : [],
    source: row.source ?? undefined,
    projectId: row.project_id ?? null,
  };
}

function itemToRow(item: ActionItem, team: TeamMaps): Record<string, unknown> {
  // 'Both' / 'Open' are not real people - they resolve to a null owner FK.
  const ownerKey =
    item.owner && item.owner !== 'Both' && item.owner !== 'Open'
      ? String(item.owner).toLowerCase()
      : null;
  const dueIsDate = /^\d{4}-\d{2}-\d{2}$/.test(item.due);
  return {
    legacy_source: LEGACY_SOURCE,
    legacy_id: item.id,
    kind: 'task',
    project: /wavewarz/i.test(item.category) ? 'wavewarz' : 'zaodevz',
    title: item.title,
    status: STATUS_TO_DB[item.status] ?? 'todo',
    owner_id: ownerKey ? (team.ownerToId.get(ownerKey) ?? null) : null,
    created_by: item.createdBy ? (team.ownerToId.get(item.createdBy.toLowerCase()) ?? null) : null,
    completed_by: item.completedBy
      ? (team.ownerToId.get(item.completedBy.toLowerCase()) ?? null)
      : null,
    category: item.category || null,
    priority: item.priority || null,
    phase: item.phase || null,
    important: Boolean(item.important),
    urgent: Boolean(item.urgent),
    // structured date column for SQL filtering; raw string preserved in metadata
    due: dueIsDate ? item.due : null,
    notes: item.notes || null,
    completed_at: item.completedAt || null,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: item.due ? { due: item.due } : {},
    brands: Array.isArray(item.brands) ? item.brands : [],
    // Doc 765 columns. source defaults to 'human-bot' since the only
    // writer using this path today is the Telegram bot. project_id
    // nullable - bot doesn't auto-assign projects yet.
    source: item.source ?? 'human-bot',
    project_id: item.projectId ?? null,
  };
}

export interface ActionsWithSha {
  data: ActionsFile;
  /** Retained for call-site compatibility; Supabase has no SHA. Always ''. */
  sha: string;
}

export async function fetchActions(): Promise<ActionsWithSha> {
  const team = await teamMaps();
  // Read EVERY task regardless of legacy_source. Pre-this-PR the read was
  // scoped to legacy_source='cowork-actions.json' which hid meeting-captured
  // and bug-fix tasks from the bot. Now they all show; writes target the
  // row by UUID (dbId), so cross-source tasks are fully editable from /done,
  // /assign, /wip, etc.
  const { data, error } = await db()
    .from('tasks')
    .select(TASK_COLUMNS);
  if (error) throw new Error(`tasks read failed: ${error.message}`);
  const items = ((data ?? []) as unknown as TaskRow[])
    .map((row) => rowToItem(row, team))
    .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  const file: ActionsFile = { updatedAt: new Date().toISOString(), items };
  await cacheActions(file);
  return { data: file, sha: '' };
}

export async function readActionsCache(): Promise<ActionsFile | null> {
  try {
    const raw = await fs.readFile(COWORK_PATHS.actionsCache, 'utf8');
    return JSON.parse(raw) as ActionsFile;
  } catch {
    return null;
  }
}

async function cacheActions(data: ActionsFile): Promise<void> {
  // Local cache is a best-effort read fallback; Supabase is the source of truth.
  try {
    await fs.mkdir(COWORK_PATHS.home, { recursive: true });
    await fs.writeFile(COWORK_PATHS.actionsCache, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    // ignore - a missing cache just forces a Supabase read next time
  }
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
      .from('tasks')
      .insert(inserts.map((i) => itemToRow(i, team)));
    if (error) throw new Error(`task insert failed: ${error.message}`);
  }
  for (const item of updates) {
    if (!item.dbId) {
      console.warn(`[actions-store] update skipped: item ${item.id} has no dbId`);
      continue;
    }
    const { error } = await db()
      .from('tasks')
      .update(itemToRow(item, team))
      .eq('id', item.dbId);
    if (error) throw new Error(`task update failed (${item.id}): ${error.message}`);
  }
  if (deleteDbIds.length) {
    const { error } = await db()
      .from('tasks')
      .delete()
      .in('id', deleteDbIds);
    if (error) throw new Error(`task delete failed: ${error.message}`);
  }
}

/**
 * Apply a mutation to the cowork tasks with retry on a unique-id race.
 * The mutator is called with the FRESHEST data and must return either:
 * - a mutated ActionsFile to persist (the `commitMessage` field is accepted
 *   for call-site compatibility but no longer used - Supabase has no commit)
 * - null/undefined to skip persistence (no-op)
 */
export async function mutateActions<T>(
  mutator: (
    data: ActionsFile,
  ) => Promise<{ data: ActionsFile; commitMessage: string; result: T } | null>,
  maxAttempts = 3,
): Promise<T | null> {
  const team = await teamMaps();
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { data: before } = await fetchActions();
      const out = await mutator(structuredClone(before));
      if (!out) return null;
      await applyDiff(before.items, out.data.items, team);
      await cacheActions(out.data);
      return out.result;
    } catch (err: unknown) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      // Only a duplicate legacy_id race is retriable - re-fetch picks a fresh id.
      if (!/duplicate key|23505/.test(lastErr.message)) throw lastErr;
      await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
    }
  }
  throw new Error(`actions mutation failed after ${maxAttempts} attempts: ${lastErr?.message}`);
}

export function nextItemId(items: ActionItem[]): string {
  const max = items.reduce((m, i) => {
    const n = Number(i.id);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return String(max + 1);
}

export interface NewActionInput {
  title: string;
  owner: Owner;
  createdBy: string;
  category?: string;
  priority?: Priority;
  phase?: Phase;
  notes?: string;
  brands?: string[];
  // due in YYYY-MM-DD form. Lets NL extractor put the date on the add op
  // itself instead of fanning out to a separate setdue on a phantom id.
  due?: string;
  // Doc 764 F4: optional override for the default TRIAGE status. The NL
  // extractor sets this when a user clearly says "start it" / "wip foo".
  status?: ActionStatus;
  // Doc 765 decision 2: source taxonomy override. Default 'human-bot'
  // for the Telegram bot maker, but the meeting-capture path or
  // research-dispatch CLI can pass a different value.
  source?: string;
}

export function makeActionItem(input: NewActionInput, items: ActionItem[]): ActionItem {
  const now = new Date().toISOString();
  return {
    id: nextItemId(items),
    title: input.title.trim(),
    createdBy: input.createdBy,
    owner: input.owner,
    // Doc 764 F4: Telegram bot adds default to TRIAGE so a lead routes
    // them with fresh context before they hit the main board. Override
    // via input.status if the NL extractor confidently inferred one.
    status: input.status ?? 'TRIAGE',
    category: input.category ?? 'Other',
    priority: input.priority ?? 'P2',
    important: false,
    urgent: false,
    completedAt: '',
    completedBy: '',
    phase: input.phase ?? 'Define',
    due: input.due ?? '',
    notes: input.notes ?? '',
    createdAt: now,
    updatedAt: now,
    brands: Array.isArray(input.brands) ? input.brands : [],
    // Doc 765 decision 2: every bot-created task carries source=human-bot
    // so the activity feed + dashboards can filter cleanly. The web side
    // uses input.source unset -> default to 'human-bot' for this code
    // path since the bot is the only writer using this maker.
    source: (input.source ?? 'human-bot') as ActionItem['source'],
  };
}
