// team.ts - team_members CRUD + role + password helpers.
//
// Lives separate from data.ts (tasks) because the admin surface needs full
// write access to team_members and that's only opened to admins. Tasks code
// only needs the read-only idToOwner / ownerToId map.
//
// Password storage: scrypt-hashed. Existing 5 users (Zaal/Iman/ThyRev/
// Samantha/Tyler) still authenticate via env-var passwords for back-compat;
// new users added via /admin authenticate via DB password_hash. See
// supabase/migrations/001_team_member_roles_and_passwords.sql for the schema.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export type TeamRole = "admin" | "lead" | "worker";

export interface TeamMember {
  id: string;
  name: string;
  legacy_owner: string | null;
  telegram_id: number | null;
  telegram_username: string | null;
  email: string | null;
  role: TeamRole;
  active: boolean;
  password_set_at: string | null;
  password_set_by: string | null;
  has_password: boolean;
  created_at: string;
}

let cachedClient: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY missing - cannot reach team_members");
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

const SELECT_COLUMNS =
  "id, name, legacy_owner, telegram_id, telegram_username, email, role, active, password_set_at, password_set_by, password_hash, created_at";

interface RawRow {
  id: string;
  name: string;
  legacy_owner: string | null;
  telegram_id: number | null;
  telegram_username: string | null;
  email: string | null;
  role: TeamRole | null;
  active: boolean | null;
  password_set_at: string | null;
  password_set_by: string | null;
  password_hash: string | null;
  created_at: string;
}

function rowToMember(row: RawRow): TeamMember {
  return {
    id: row.id,
    name: row.name,
    legacy_owner: row.legacy_owner,
    telegram_id: row.telegram_id,
    telegram_username: row.telegram_username,
    email: row.email,
    role: (row.role ?? "worker") as TeamRole,
    active: row.active ?? true,
    password_set_at: row.password_set_at,
    password_set_by: row.password_set_by,
    has_password: !!row.password_hash,
    created_at: row.created_at,
  };
}

export async function listTeamMembers(): Promise<TeamMember[]> {
  const { data, error } = await db()
    .from("team_members")
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`team_members list failed: ${error.message}`);
  return ((data ?? []) as RawRow[]).map(rowToMember);
}

export async function getTeamMemberByLegacyOwner(legacyOwner: string): Promise<TeamMember | null> {
  const { data, error } = await db()
    .from("team_members")
    .select(SELECT_COLUMNS)
    .ilike("legacy_owner", legacyOwner)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`team_members lookup failed: ${error.message}`);
  if (!data) return null;
  return rowToMember(data as RawRow);
}

// Schema-migration-tolerant role lookup: if the role column does not exist
// yet (pre-001 migration), Supabase returns an error and we fall back to
// returning null. Callers (isAdmin) treat null as "use hardcoded fallback."
export async function getRoleByLegacyOwner(legacyOwner: string): Promise<TeamRole | null> {
  try {
    const { data, error } = await db()
      .from("team_members")
      .select("role")
      .ilike("legacy_owner", legacyOwner)
      .limit(1)
      .maybeSingle();
    if (error) return null;
    const role = (data as { role: TeamRole | null } | null)?.role;
    return role ?? null;
  } catch {
    return null;
  }
}

// scrypt parameters tuned for ~50ms server-side hash. N=2^14 is current OWASP
// minimum for password hashing in 2026. Salt is 16 random bytes; output is
// `{salt-hex}:{hash-hex}` joined by a single colon for easy storage.
const SCRYPT_N = 1 << 14;
const SCRYPT_KEYLEN = 32;
const SCRYPT_SALT_BYTES = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N });
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  const actual = scryptSync(password, salt, expected.length, { N: SCRYPT_N });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

// Returns the team_member row by legacy_owner if the supplied password
// matches their DB password_hash and the account is active. Null otherwise.
// verifyPassword in auth.ts calls this AFTER its env-var check so existing
// env-based users keep working.
export async function authenticateByPassword(
  legacyOwner: string,
  password: string,
): Promise<TeamMember | null> {
  const { data, error } = await db()
    .from("team_members")
    .select(SELECT_COLUMNS)
    .ilike("legacy_owner", legacyOwner)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as RawRow;
  if (row.active === false) return null;
  if (!row.password_hash) return null;
  if (!verifyPasswordHash(password, row.password_hash)) return null;
  return rowToMember(row);
}

export async function authenticateAnyByPassword(password: string): Promise<TeamMember | null> {
  // Scan active users with a password_hash. The login form has only a single
  // password field (no username); we find the matching user by hash. This
  // mirrors the env-var path's "any matching password wins" model.
  const { data, error } = await db()
    .from("team_members")
    .select(SELECT_COLUMNS)
    .eq("active", true)
    .not("password_hash", "is", null);
  if (error) return null;
  for (const row of (data ?? []) as RawRow[]) {
    if (!row.password_hash) continue;
    if (verifyPasswordHash(password, row.password_hash)) return rowToMember(row);
  }
  return null;
}

export interface AddMemberInput {
  name: string;
  legacy_owner: string;
  role: TeamRole;
  password: string;
  telegram_id?: number | null;
  telegram_username?: string | null;
  email?: string | null;
  set_by: string;
}

export async function addTeamMember(input: AddMemberInput): Promise<TeamMember> {
  const hash = hashPassword(input.password);
  const { data, error } = await db()
    .from("team_members")
    .insert({
      name: input.name,
      legacy_owner: input.legacy_owner,
      role: input.role,
      active: true,
      password_hash: hash,
      password_set_at: new Date().toISOString(),
      password_set_by: input.set_by,
      telegram_id: input.telegram_id ?? null,
      telegram_username: input.telegram_username ?? null,
      email: input.email ?? null,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new Error(`addTeamMember failed: ${error.message}`);
  return rowToMember(data as RawRow);
}

export async function setMemberRole(id: string, role: TeamRole): Promise<void> {
  const { error } = await db().from("team_members").update({ role }).eq("id", id);
  if (error) throw new Error(`setMemberRole failed: ${error.message}`);
}

export async function setMemberActive(id: string, active: boolean): Promise<void> {
  const { error } = await db().from("team_members").update({ active }).eq("id", id);
  if (error) throw new Error(`setMemberActive failed: ${error.message}`);
}

// Pair a member with Telegram. username (no @) enables group @mention pings;
// the numeric id enables direct DMs. Either can be cleared by passing null.
export async function setMemberTelegram(
  id: string,
  telegram_username: string | null,
  telegram_id: number | null,
): Promise<void> {
  const { error } = await db()
    .from("team_members")
    .update({ telegram_username, telegram_id })
    .eq("id", id);
  if (error) throw new Error(`setMemberTelegram failed: ${error.message}`);
}

export async function resetMemberPassword(
  id: string,
  password: string,
  setBy: string,
): Promise<void> {
  const hash = hashPassword(password);
  const { error } = await db()
    .from("team_members")
    .update({
      password_hash: hash,
      password_set_at: new Date().toISOString(),
      password_set_by: setBy,
    })
    .eq("id", id);
  if (error) throw new Error(`resetMemberPassword failed: ${error.message}`);
}

export async function deleteTeamMember(id: string): Promise<void> {
  // Hard delete - team_members has no FK from tasks (tasks.owner_id is the
  // only ref and FK is nullable). For safety the UI should prefer
  // setMemberActive(false); this exists for accidental-add cleanup.
  const { error } = await db().from("team_members").delete().eq("id", id);
  if (error) throw new Error(`deleteTeamMember failed: ${error.message}`);
}
