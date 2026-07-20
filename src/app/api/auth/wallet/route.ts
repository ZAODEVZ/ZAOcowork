import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { verifyMessage } from "viem";
import { createSession } from "@/lib/auth";
import { resolveWalletIdentity } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// "Login with Wallet" (Sign-In With Ethereum, minimal).
//
// GET  -> issue a one-time nonce (stored in an httpOnly cookie, 5 min TTL)
// POST -> verify the signature over the exact message containing that nonce
//
// The nonce cookie is what stops replay: a signature is only accepted for the
// nonce this browser was just issued, and the cookie is cleared on use.
// First sign-in creates a PENDING member; an admin approves in /admin.

const NONCE_COOKIE = "cowork-siwe-nonce";
const NONCE_TTL_SECONDS = 300;

function buildMessage(address: string, nonce: string, domain: string): string {
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
    "Sign in to the ZAO cowork board.",
    "",
    `URI: https://${domain}`,
    "Version: 1",
    `Nonce: ${nonce}`,
  ].join("\n");
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address") ?? "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "bad_address" }, { status: 400 });
  }
  const nonce = randomBytes(16).toString("hex");
  const domain = req.headers.get("host") ?? "thezao.xyz";
  // Return the FULL message so the client signs byte-for-byte what POST
  // reconstructs and verifies. Returning only the nonce invites drift between
  // the two message builders, which fails verification in confusing ways.
  const res = NextResponse.json({ nonce, message: buildMessage(address, nonce, domain) });
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: NONCE_TTL_SECONDS,
  });
  return res;
}

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!rateLimit(`siwe:${ip}`, 10, 15 * 60_000).ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: { address?: unknown; signature?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const address = typeof body.address === "string" ? body.address : "";
  const signature = typeof body.signature === "string" ? body.signature : "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address) || !/^0x[a-fA-F0-9]+$/.test(signature)) {
    return NextResponse.json({ error: "bad_params" }, { status: 400 });
  }

  const nonce = req.cookies.get(NONCE_COOKIE)?.value;
  if (!nonce) {
    return NextResponse.json({ error: "nonce_expired" }, { status: 400 });
  }

  const domain = req.headers.get("host") ?? "thezao.xyz";
  const message = buildMessage(address, nonce, domain);

  let valid = false;
  try {
    valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
  } catch (err: unknown) {
    console.error("[auth/wallet] verify threw:", err);
    valid = false;
  }
  if (!valid) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let identity;
  try {
    identity = await resolveWalletIdentity(address);
  } catch (err: unknown) {
    console.error("[auth/wallet] identity resolution failed:", err);
    return NextResponse.json({ error: "identity_failed" }, { status: 500 });
  }

  if (identity.status === "rejected") {
    return NextResponse.json({ error: "rejected" }, { status: 403 });
  }
  if (identity.status === "pending") {
    const res = NextResponse.json(
      { status: "pending", name: identity.name, isNew: identity.isNew },
      { status: 403 },
    );
    res.cookies.delete(NONCE_COOKIE);
    return res;
  }

  await createSession(identity.user);
  const res = NextResponse.json({ status: "ok", user: identity.user, name: identity.name });
  res.cookies.delete(NONCE_COOKIE); // one-time use
  return res;
}
