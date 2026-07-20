// identity.ts - Farcaster + wallet identity resolution for sign-in.
//
// Mirrors the existing /api/tg/auth pattern (verify an external identity, then
// createSession) but DB-backed instead of env-var-backed, so adding a user is
// an approval click in /admin rather than a redeploy.
//
// Trust boundary: these helpers assume the caller ALREADY cryptographically
// verified the identity (Neynar signer lookup / SIWE signature). They only map
// a verified identity to a team_members row. Never call them with unverified
// user input.

import { serviceClient } from "./supabase-server";

export type ApprovalStatus = "active" | "pending" | "rejected";

export interface ResolvedIdentity {
  /** team_members.legacy_owner - this is what becomes the SessionUser string. */
  user: string;
  status: ApprovalStatus;
  name: string;
  isNew: boolean;
}

/** Build a stable, unique legacy_owner slug from a display name + identity. */
function slugFor(preferred: string, suffix: string): string {
  const base = preferred
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);
  return base ? `${base}${suffix}` : `user${suffix}`;
}

/**
 * Resolve a VERIFIED Farcaster identity to a session user.
 * Creates a pending member on first sight - never auto-grants access.
 */
export async function resolveFarcasterIdentity(params: {
  fid: number;
  username?: string | null;
  displayName?: string | null;
  pfpUrl?: string | null;
}): Promise<ResolvedIdentity> {
  const db = serviceClient();
  const { fid, username, displayName, pfpUrl } = params;

  const { data: existing } = await db
    .from("team_members")
    .select("legacy_owner, name, approval_status, active")
    .eq("fid", fid)
    .maybeSingle();

  if (existing?.legacy_owner) {
    // Keep profile fields fresh on every login - free, and keeps /admin readable.
    await db
      .from("team_members")
      .update({
        pfp_url: pfpUrl ?? undefined,
        farcaster_username: username ?? undefined,
      })
      .eq("fid", fid);
    return {
      user: existing.legacy_owner,
      status: (existing.active === false ? "rejected" : existing.approval_status) as ApprovalStatus,
      name: existing.name,
      isNew: false,
    };
  }

  const label = displayName || username || `fid:${fid}`;
  const slug = slugFor(username || displayName || "user", String(fid));

  const { data: created, error } = await db
    .from("team_members")
    .insert({
      name: label,
      legacy_owner: slug,
      fid,
      farcaster_username: username ?? null,
      pfp_url: pfpUrl ?? null,
      role: "worker",
      active: true,
      approval_status: "pending",
      first_seen_at: new Date().toISOString(),
    })
    .select("legacy_owner, name, approval_status")
    .single();

  if (error || !created?.legacy_owner) {
    throw new Error(`could not create pending member: ${error?.message ?? "unknown"}`);
  }
  return { user: created.legacy_owner, status: "pending", name: created.name, isNew: true };
}

/**
 * Resolve a VERIFIED wallet address to a session user.
 * Same pending-on-first-sight rule as Farcaster.
 */
export async function resolveWalletIdentity(address: string): Promise<ResolvedIdentity> {
  const db = serviceClient();
  const addr = address.toLowerCase();

  const { data: existing } = await db
    .from("team_members")
    .select("legacy_owner, name, approval_status, active")
    .ilike("wallet", addr)
    .maybeSingle();

  if (existing?.legacy_owner) {
    return {
      user: existing.legacy_owner,
      status: (existing.active === false ? "rejected" : existing.approval_status) as ApprovalStatus,
      name: existing.name,
      isNew: false,
    };
  }

  const short = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const slug = slugFor("wallet", addr.slice(2, 10));

  const { data: created, error } = await db
    .from("team_members")
    .insert({
      name: short,
      legacy_owner: slug,
      wallet: addr,
      role: "worker",
      active: true,
      approval_status: "pending",
      first_seen_at: new Date().toISOString(),
    })
    .select("legacy_owner, name, approval_status")
    .single();

  if (error || !created?.legacy_owner) {
    throw new Error(`could not create pending member: ${error?.message ?? "unknown"}`);
  }
  return { user: created.legacy_owner, status: "pending", name: created.name, isNew: true };
}

/** Pending sign-ins awaiting an admin decision - powers the /admin queue. */
export async function listPendingMembers() {
  const db = serviceClient();
  const { data } = await db
    .from("team_members")
    .select("id, name, legacy_owner, fid, wallet, farcaster_username, pfp_url, first_seen_at")
    .eq("approval_status", "pending")
    .order("first_seen_at", { ascending: false });
  return data ?? [];
}

/** Approve or reject a pending member. Admin-gated by the caller. */
export async function setApprovalStatus(
  id: string,
  status: Exclude<ApprovalStatus, "pending">,
  approvedBy: string,
): Promise<void> {
  const db = serviceClient();
  await db
    .from("team_members")
    .update({
      approval_status: status,
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      ...(status === "rejected" ? { active: false } : {}),
    })
    .eq("id", id);
}
