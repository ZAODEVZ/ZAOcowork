import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { resolveFarcasterIdentity } from "@/lib/identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// "Login with Farcaster" (Sign In With Neynar).
//
// Follows the same trust model as /api/tg/auth: the client hands us an
// identity claim, we verify it SERVER-SIDE against the issuer, and only then
// mint a session. We never trust the fid the browser sends - we read the fid
// off the signer record Neynar returns for the signer_uuid.
//
// First sign-in creates a PENDING member (name + pfp auto-filled from their
// Farcaster profile) and returns 403 pending. An admin approves in /admin.
// That is the whole "add users" flow - no env vars, no redeploy.

interface NeynarSigner {
  status?: string;
  fid?: number;
  signer_uuid?: string;
}

interface NeynarUser {
  username?: string;
  display_name?: string;
  pfp_url?: string;
}

async function fetchSigner(signerUuid: string, apiKey: string): Promise<NeynarSigner | null> {
  const res = await fetch(
    `https://api.neynar.com/v2/farcaster/signer?signer_uuid=${encodeURIComponent(signerUuid)}`,
    { headers: { api_key: apiKey, accept: "application/json" }, signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) return null;
  return (await res.json()) as NeynarSigner;
}

async function fetchUser(fid: number, apiKey: string): Promise<NeynarUser | null> {
  const res = await fetch(
    `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
    { headers: { api_key: apiKey, accept: "application/json" }, signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { users?: NeynarUser[] };
  return json.users?.[0] ?? null;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let body: { signer_uuid?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const signerUuid = typeof body.signer_uuid === "string" ? body.signer_uuid : "";
  if (!signerUuid) {
    return NextResponse.json({ error: "missing_signer" }, { status: 400 });
  }

  // Server-side verification - this is the trust boundary.
  const signer = await fetchSigner(signerUuid, apiKey);
  if (!signer || signer.status !== "approved" || !signer.fid) {
    return NextResponse.json({ error: "signer_not_approved" }, { status: 401 });
  }

  const profile = await fetchUser(signer.fid, apiKey);

  let identity;
  try {
    identity = await resolveFarcasterIdentity({
      fid: signer.fid,
      username: profile?.username ?? null,
      displayName: profile?.display_name ?? null,
      pfpUrl: profile?.pfp_url ?? null,
    });
  } catch (err: unknown) {
    console.error("[auth/farcaster] identity resolution failed:", err);
    return NextResponse.json({ error: "identity_failed" }, { status: 500 });
  }

  if (identity.status === "rejected") {
    return NextResponse.json({ error: "rejected" }, { status: 403 });
  }
  if (identity.status === "pending") {
    return NextResponse.json(
      { status: "pending", name: identity.name, isNew: identity.isNew },
      { status: 403 },
    );
  }

  await createSession(identity.user);
  return NextResponse.json({ status: "ok", user: identity.user, name: identity.name });
}
