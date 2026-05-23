// supabase-roster.ts - resolve `ctx.from.id` -> Owner via Supabase
// team_members.telegram_id.
//
// Doc 713 follow-up (2026-05-23). Before this, the bot's only tg_id -> owner
// path was GitHub `data/team.json` (cowork-zaodevz repo). If that file was
// stale, missing, or in the wrong repo (post-migration), owner resolution
// fell through to `Open` -> owner_id=NULL on bot writes. That was the root
// cause of the 2026-05-23 sync bug Iman reported.
//
// Now the bot prefers Supabase team_members (single source of truth for the
// unified tracker) and only falls back to the GitHub roster if Supabase is
// unconfigured or the user is not mapped there.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Owner } from './types';
import { OWNERS } from './types';

let cachedClient: SupabaseClient | null = null;
function db(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

// Process-lifetime cache so /add, /mine, /list etc don't each round-trip.
// Cleared on bot restart - the roster doesn't churn between restarts.
const cache = new Map<number, Owner | null>();

/**
 * Look up a Telegram user id in Supabase team_members and return the
 * canonical Owner ('Iman', 'Zaal', 'ThyRev', 'Samantha') if mapped, or null
 * if not (caller should fall back to GitHub team.json / env).
 *
 * Silently returns null on any error - never throws. The cowork tracker
 * still works without this; missing here just means we fall back to the
 * older roster path.
 */
export async function tgIdToOwnerSupabase(tgId: number): Promise<Owner | null> {
  if (cache.has(tgId)) return cache.get(tgId) ?? null;
  const client = db();
  if (!client) {
    cache.set(tgId, null);
    return null;
  }
  try {
    const { data, error } = await client
      .from('team_members')
      .select('legacy_owner')
      .eq('telegram_id', tgId)
      .maybeSingle();
    if (error || !data?.legacy_owner) {
      cache.set(tgId, null);
      return null;
    }
    const raw = String(data.legacy_owner).toLowerCase();
    const owner = OWNERS.find((o) => o.toLowerCase() === raw) ?? null;
    cache.set(tgId, owner);
    return owner;
  } catch {
    cache.set(tgId, null);
    return null;
  }
}
