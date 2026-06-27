// Issue / revoke / inspect DB-backed bot tokens (table: bot_tokens, migration
// 016). This is what powers "Claude access" in the admin Users panel: a team
// member's login slug doubles as their bot name, so a person and their Claude
// share one identity. Service-role only — never import into a client component.

import { randomBytes } from "node:crypto";
import { serviceClient } from "@/lib/supabase-server";
import { invalidateBotTokenCache } from "@/lib/bot-auth";

/** A fresh bearer secret: tok_<48 hex chars>. */
function generateToken(): string {
  return `tok_${randomBytes(24).toString("hex")}`;
}

/**
 * Issue a token for `bot` (a lowercased slug). Revokes any existing active
 * tokens for that bot first so there's always exactly one live token — "enable
 * Claude access" is idempotent and re-issuing rotates. Returns the new token
 * (the ONLY time it's ever shown in full).
 */
export async function issueBotToken(
  bot: string,
  note: string,
  createdBy: string,
): Promise<string> {
  const slug = bot.trim().toLowerCase();
  if (!slug) throw new Error("bot is required");
  const sc = serviceClient();

  // Rotate: revoke prior active tokens for this bot.
  await sc
    .from("bot_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("bot", slug)
    .is("revoked_at", null);

  const token = generateToken();
  const { error } = await sc
    .from("bot_tokens")
    .insert({ bot: slug, token, note, created_by: createdBy });
  if (error) throw new Error(error.message);

  invalidateBotTokenCache();
  return token;
}

/** Revoke all active tokens for `bot`. */
export async function revokeBotTokens(bot: string): Promise<void> {
  const slug = bot.trim().toLowerCase();
  const { error } = await serviceClient()
    .from("bot_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("bot", slug)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
  invalidateBotTokenCache();
}

/** The current active token for `bot`, or null if none. Admin-only callers. */
export async function getActiveBotToken(bot: string): Promise<string | null> {
  const slug = bot.trim().toLowerCase();
  if (!slug) return null;
  const { data, error } = await serviceClient()
    .from("bot_tokens")
    .select("token, created_at")
    .eq("bot", slug)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return String((data[0] as { token: unknown }).token);
}

/** Lowercased slugs that currently have an active token. Empty on any error. */
export async function listBotsWithActiveTokens(): Promise<string[]> {
  try {
    const { data, error } = await serviceClient()
      .from("bot_tokens")
      .select("bot")
      .is("revoked_at", null);
    if (error || !data) return [];
    return Array.from(new Set(data.map((r) => String((r as { bot: unknown }).bot).toLowerCase())));
  } catch {
    return [];
  }
}
