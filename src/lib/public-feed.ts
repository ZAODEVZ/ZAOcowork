// public-feed.ts - Server-only module. Service-role Supabase client queries
// DONE tasks that are marked public via public_override or project.is_public.
// ONLY safe fields are selected: title, completed_at, project name/slug.
// Sensitive columns (owner, notes, detail, legacy_*) are NEVER queried.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface ShippedItem {
  title: string;
  completedAt: string | null;
}

export interface ShippedGroup {
  projectName: string;
  projectSlug: string | null;
  items: ShippedItem[];
}

let cachedClient: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY missing - cannot query public feed");
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export async function getPublicShipped(limitPerGroup = 50): Promise<ShippedGroup[]> {
  try {
    const { data, error } = await db()
      .from("tasks")
      .select(
        "title, completed_at, public_override, project_id, project:project_id(name, slug, is_public)"
      )
      .eq("status", "done");

    if (error || !data) {
      return [];
    }

    // Filter to only public rows based on visibility rule.
    const publicRows: Array<{
      title: string | null;
      completed_at: string | null;
      public_override: boolean | null;
      project_id: string | null;
      projectName: string | null;
      projectSlug: string | null;
    }> = [];

    for (const row of data as unknown[]) {
      const r = row as Record<string, unknown>;
      const projectData = r.project as
        | { name?: string; slug?: string; is_public?: boolean } | null
        | undefined;

      const isPublicByOverride = r.public_override === true;
      // Inherit (null) shows only inside a public project. Use a strict null
      // check so a missing column (undefined, pre-migration) is NOT treated as
      // public — default-deny.
      const isPublicByProject =
        (r.public_override === true || r.public_override === null) &&
        projectData?.is_public === true;

      if (isPublicByOverride || isPublicByProject) {
        publicRows.push({
          title: (r.title as string | null) ?? null,
          completed_at: (r.completed_at as string | null) ?? null,
          public_override: (r.public_override as boolean | null) ?? null,
          project_id: (r.project_id as string | null) ?? null,
          projectName: projectData?.name ?? null,
          projectSlug: projectData?.slug ?? null,
        });
      }
    }

    // Group by project name (or "Other" for rows with no project or private project).
    const groupMap = new Map<string, ShippedItem[]>();

    for (const row of publicRows) {
      const groupKey = row.projectName || "Other";
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, []);
      }
      const group = groupMap.get(groupKey)!;
      group.push({
        title: row.title ?? "",
        completedAt: row.completed_at,
      });
    }

    // Convert to array of ShippedGroup. Sort items within each group by
    // completed_at desc (nulls last). Sort groups by their most-recent item desc.
    const groups: ShippedGroup[] = [];

    for (const [projectName, items] of groupMap.entries()) {
      // Sort items by completed_at desc, nulls last.
      items.sort((a, b) => {
        if (a.completedAt === null && b.completedAt === null) return 0;
        if (a.completedAt === null) return 1;
        if (b.completedAt === null) return -1;
        return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
      });

      // Cap items per group.
      const capped = items.slice(0, limitPerGroup);

      // Find the corresponding project slug from publicRows.
      let projectSlug: string | null = null;
      for (const row of publicRows) {
        if ((row.projectName || "Other") === projectName) {
          projectSlug = row.projectSlug;
          break;
        }
      }

      groups.push({
        projectName,
        projectSlug,
        items: capped,
      });
    }

    // Sort groups by their most-recent item (by completed_at) desc.
    groups.sort((a, b) => {
      const aTime = a.items.length > 0 && a.items[0].completedAt
        ? new Date(a.items[0].completedAt).getTime()
        : 0;
      const bTime = b.items.length > 0 && b.items[0].completedAt
        ? new Date(b.items[0].completedAt).getTime()
        : 0;
      return bTime - aTime;
    });

    return groups;
  } catch {
    // Any DB error -> return empty array, never throw.
    return [];
  }
}
