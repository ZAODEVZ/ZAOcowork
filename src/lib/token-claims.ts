// One-time pairing codes for handing out a bot token without putting the token
// in a shareable file. Server-only (service-role). Table: token_claims (018).

import { randomBytes } from "node:crypto";
import { serviceClient } from "@/lib/supabase-server";

export const CLAIM_TTL_MINUTES = 30;

// Unambiguous base32-ish alphabet (no 0/O/1/I) for a human-typeable code.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function genCode(): string {
  const bytes = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `ZAO-${s}`;
}

/** Create a single-use code that maps to `token` for `bot`. Returns the code. */
export async function createClaim(bot: string, token: string, createdBy: string): Promise<string> {
  const code = genCode();
  const expires = new Date(Date.now() + CLAIM_TTL_MINUTES * 60_000).toISOString();
  const { error } = await serviceClient().from("token_claims").insert({
    code,
    bot: bot.toLowerCase(),
    token,
    created_by: createdBy,
    expires_at: expires,
  });
  if (error) throw new Error(error.message);
  return code;
}

/**
 * Redeem a code: returns { token, bot } and marks it claimed, or null if the
 * code is unknown, already used, or expired. Single-use.
 */
export async function redeemClaim(code: string): Promise<{ token: string; bot: string } | null> {
  const sc = serviceClient();
  const { data, error } = await sc
    .from("token_claims")
    .select("id, token, bot, expires_at, claimed_at")
    .eq("code", code.trim())
    .is("claimed_at", null)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const row = data[0] as { id: string; token: string; bot: string; expires_at: string };
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  // Atomic-ish claim: only succeed if still unclaimed (guards double-redeem).
  const { data: claimed, error: upErr } = await sc
    .from("token_claims")
    .update({ claimed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("claimed_at", null)
    .select("id");
  if (upErr || !claimed || claimed.length === 0) return null;
  return { token: row.token, bot: row.bot };
}
