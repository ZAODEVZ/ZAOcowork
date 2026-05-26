// brands-db.ts - Supabase-backed brand list (Phase D).
//
// Lives next to src/lib/brands.ts (the const, kept as fallback/seed). Reads
// here are best-effort: if the migration hasn't been applied yet OR the DB
// is unreachable, callers can fall back to the const list so the site keeps
// rendering. See FALLBACK_BRANDS for the const projection in that shape.
//
// Server-only. Writes need an admin session (gated in
// src/app/admin/actions.ts, not here).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BRANDS as CONST_BRANDS, brandColor as constBrandColor } from "./brands";

export interface BrandRow {
  id: string;
  name: string;
  slugs: string[];
  color: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  created_by: string | null;
}

let cachedClient: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY missing - cannot reach brands");
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

const SELECT_COLUMNS = "id, name, slugs, color, active, sort_order, created_at, created_by";

// Const projection: same shape as a BrandRow but built from src/lib/brands.ts.
// Used as the fallback when the brands table doesn't exist yet so a brand-new
// deploy doesn't render an empty tab strip.
export const FALLBACK_BRANDS: BrandRow[] = CONST_BRANDS.map((name, i) => ({
  id: `const-${i}`,
  name,
  slugs: [],
  color: constBrandColor(name),
  active: true,
  // First 6 are the historical PRIMARY_BRANDS - sort orders 10..60. Anything
  // beyond goes into the More dropdown bucket (>= 100). Real DB rows get
  // explicit sort_orders via the 002 migration.
  sort_order: i < 6 ? (i + 1) * 10 : 100 + i * 10,
  created_at: new Date().toISOString(),
  created_by: null,
}));

// listBrands returns DB rows if available, otherwise the const fallback so
// pages always have something to render. Admins can tell the difference
// because the fallback rows carry `id` prefixed with `const-`.
export async function listBrands(opts?: { activeOnly?: boolean }): Promise<BrandRow[]> {
  try {
    let q = db().from("brands").select(SELECT_COLUMNS).order("sort_order", { ascending: true });
    if (opts?.activeOnly) q = q.eq("active", true);
    const { data, error } = await q;
    if (error || !data) return opts?.activeOnly ? FALLBACK_BRANDS : FALLBACK_BRANDS;
    return data as BrandRow[];
  } catch {
    return FALLBACK_BRANDS;
  }
}

export async function listActiveBrands(): Promise<BrandRow[]> {
  return listBrands({ activeOnly: true });
}

export async function addBrand(input: {
  name: string;
  slugs: string[];
  color: string;
  sort_order: number;
  created_by: string;
}): Promise<BrandRow> {
  const { data, error } = await db()
    .from("brands")
    .insert({
      name: input.name,
      slugs: input.slugs,
      color: input.color,
      sort_order: input.sort_order,
      active: true,
      created_by: input.created_by,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new Error(`addBrand failed: ${error.message}`);
  return data as BrandRow;
}

export async function updateBrand(
  id: string,
  patch: Partial<Pick<BrandRow, "name" | "slugs" | "color" | "sort_order" | "active">>,
): Promise<void> {
  const { error } = await db().from("brands").update(patch).eq("id", id);
  if (error) throw new Error(`updateBrand failed: ${error.message}`);
}

export async function deleteBrand(id: string): Promise<void> {
  const { error } = await db().from("brands").delete().eq("id", id);
  if (error) throw new Error(`deleteBrand failed: ${error.message}`);
}
