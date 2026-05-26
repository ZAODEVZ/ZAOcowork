import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "iman-session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type SessionUser = "zaal" | "iman" | "thyrev" | "samantha" | "tyler";

const SESSION_USERS: ReadonlySet<SessionUser> = new Set([
  "zaal",
  "iman",
  "thyrev",
  "samantha",
  "tyler",
]);

// Display label for a session user. Single source of truth - the 4+ ternaries
// scattered across page.tsx / actions.ts / chat/page.tsx / api/chat/route.ts
// used to duplicate this and fall through to "Samantha" for any unknown user,
// which silently mislabeled Tyler as Samantha when he was added.
const USER_LABELS: Record<SessionUser, string> = {
  zaal: "Zaal",
  iman: "Iman",
  thyrev: "ThyRev",
  samantha: "Samantha",
  tyler: "Tyler",
};
export function userLabel(user: SessionUser): string {
  return USER_LABELS[user];
}

// Lead = can mark tasks DONE without going through the review queue.
// Tyler is an external collaborator (Magnetic founder, doc 473), not a lead.
export function isLead(user: SessionUser): boolean {
  return user === "zaal" || user === "iman";
}

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET missing or too short (need 16+ chars)");
  }
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function verifyPassword(password: string): SessionUser | null {
  const zp = process.env.ZAAL_PASSWORD;
  const ip = process.env.IMAN_PASSWORD;
  const tp = process.env.THYREV_PASSWORD;
  const sp = process.env.SAMANTHA_PASSWORD;
  // Tyler Stambaugh (Magnetic founder, doc 473) - external collaborator on
  // ZABAL Games + road-to-ZAOstock. Added 2026-05-23 per Tyler-meeting #714
  // action item tyler-may22-2 "give Tyler a password."
  const typ = process.env.TYLER_PASSWORD;
  if (zp && password === zp) return "zaal";
  if (ip && password === ip) return "iman";
  if (tp && password === tp) return "thyrev";
  if (sp && password === sp) return "samantha";
  if (typ && password === typ) return "tyler";
  return null;
}

export async function createSession(user: SessionUser): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = `${user}.${exp}`;
  const sig = sign(payload);
  const value = `${payload}.${sig}`;
  const jar = await cookies();
  jar.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [user, expStr, sig] = parts;
  const expected = sign(`${user}.${expStr}`);
  if (!safeEqual(sig, expected)) return null;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  if (!SESSION_USERS.has(user as SessionUser)) {
    return null;
  }
  return user as SessionUser;
}

export async function requireSession(): Promise<SessionUser> {
  const u = await getSession();
  if (!u) throw new Error("Not authenticated");
  return u;
}
