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
//
// The first iteration sorted by const-array index, which put ZAO Festivals /
// ZAO-PALOOZA / ZAO-CHELLA into the primary tab slots since they sit at
// indices 3..5 of CONST_BRANDS. That mismatched the 002 migration seed (which
// puts WaveWarZ/COC Concertz/ZABAL Games at 40/50/60) and surfaced as Iman's
// "wrong tab list" bug 2026-05-26. Now we explicitly map each brand to the
// same sort_order the migration seeds so pre-migration + post-migration
// rendering matches. New brands not in this map default to 999 (well into
// the More dropdown range).
const FALLBACK_SORT_ORDER: Record<string, number> = {
  "The ZAO": 10,
  "ZAO Devz": 20,
  "ZAOstock": 30,
  "WaveWarZ": 40,
  "COC Concertz": 50,
  "ZABAL Games": 60,
  "ZAO Festivals": 110,
  "ZAO-PALOOZA": 120,
  "ZAO-CHELLA": 130,
  "ZABAL": 140,
  "BetterCallZaal": 150,
  "BCZ Strategies": 160,
  "ZAO Music": 170,
  "ZOUNZ": 180,
  "FISHBOWLZ": 190,
  "POIDH": 200,
  "ZOE": 210,
  "Hermes": 220,
  "Bonfire": 230,
  "Juke": 240,
};

export const FALLBACK_BRANDS: BrandRow[] = CONST_BRANDS.map((name, i) => ({
  id: `const-${i}`,
  name,
  slugs: [],
  color: constBrandColor(name),
  active: true,
  sort_order: FALLBACK_SORT_ORDER[name] ?? 999,
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
    if (error || !data) return opts?.activeOnly ? FALLBACK_BRANDS.filter((b) => b.active) : FALLBACK_BRANDS;
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
