// Projects CRUD (doc 765 Phase I).
//
// Server-only. Service-role key required. Mirrors the brands-db.ts shape
// since both are simple master-data tables surfaced in /admin.
//
// Graceful degradation: if the migration hasn't been applied yet, every
// reader returns an empty array + { available: false } so the UI can
// render an amber "migration pending" banner instead of crashing.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Project, ProjectStatus } from "./types";

let cached: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY missing - cannot reach projects table");
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

const SELECT_COLS =
  "id, slug, name, description, status, brand_default, started_at, target_date, " +
  "closed_at, closed_by, color, sort_order, created_at, created_by, is_public";

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  brand_default: string | null;
  started_at: string | null;
  target_date: string | null;
  closed_at: string | null;
  closed_by: string | null;
  color: string;
  sort_order: number;
  created_at: string;
  created_by: string | null;
  is_public: boolean;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: (row.status as ProjectStatus) ?? "active",
    brandDefault: row.brand_default,
    startedAt: row.started_at,
    targetDate: row.target_date,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
    color: row.color,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    createdBy: row.created_by,
    isPublic: row.is_public,
  };
}

export async function listProjects(): Promise<{ rows: Project[]; available: boolean }> {
  try {
    const { data, error } = await db()
      .from("projects")
      .select(SELECT_COLS)
      .order("sort_order", { ascending: true });
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) {
        return { rows: [], available: false };
      }
      throw new Error(error.message);
    }
    return {
      rows: ((data ?? []) as unknown as ProjectRow[]).map(rowToProject),
      available: true,
    };
  } catch (err) {
    if (err instanceof Error && /does not exist/i.test(err.message)) {
      return { rows: [], available: false };
    }
    throw err;
  }
}

export async function listActiveProjects(): Promise<Project[]> {
  const all = await listProjects();
  return all.rows.filter((p) => p.status === "active");
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const { data, error } = await db()
    .from("projects")
    .select(SELECT_COLS)
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return rowToProject(data as unknown as ProjectRow);
}

export async function getProjectById(id: string): Promise<Project | null> {
  const { data, error } = await db()
    .from("projects")
    .select(SELECT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToProject(data as unknown as ProjectRow);
}

export interface NewProject {
  slug: string;
  name: string;
  description?: string | null;
  brand_default?: string | null;
  target_date?: string | null;
  color?: string;
  sort_order?: number;
  created_by?: string;
}

export async function createProject(input: NewProject): Promise<Project> {
  const { data, error } = await db()
    .from("projects")
    .insert({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      status: "active",
      brand_default: input.brand_default ?? null,
      target_date: input.target_date ?? null,
      color: input.color ?? "bg-white/10 text-white/70 border-white/20",
      sort_order: input.sort_order ?? 100,
      created_by: input.created_by ?? null,
    })
    .select(SELECT_COLS)
    .single();
  if (error) throw new Error(`createProject failed: ${error.message}`);
  return rowToProject(data as unknown as ProjectRow);
}

export async function updateProject(
  id: string,
  patch: Partial<{
    name: string;
    description: string | null;
    status: ProjectStatus;
    brand_default: string | null;
    target_date: string | null;
    color: string;
    sort_order: number;
    is_public: boolean;
  }>,
  decidedBy?: string,
): Promise<void> {
  const update: Record<string, unknown> = { ...patch };
  // When closing a project stamp closed_at + closed_by so the audit
  // history shows who shut it down and when.
  if (patch.status === "completed" || patch.status === "cancelled") {
    update.closed_at = new Date().toISOString();
    update.closed_by = decidedBy ?? null;
  } else if (patch.status === "active" || patch.status === "paused") {
    update.closed_at = null;
    update.closed_by = null;
  }
  const { error } = await db().from("projects").update(update).eq("id", id);
  if (error) throw new Error(`updateProject failed: ${error.message}`);
}

export async function deleteProject(id: string): Promise<void> {
  // ON DELETE SET NULL on tasks.project_id means existing tasks get
  // unparented rather than dropped.
  const { error } = await db().from("projects").delete().eq("id", id);
  if (error) throw new Error(`deleteProject failed: ${error.message}`);
}
