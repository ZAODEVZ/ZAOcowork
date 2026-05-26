import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  authenticateAnyByPassword,
  getRoleByLegacyOwner,
  type TeamMember,
} from "./team";

const COOKIE_NAME = "iman-session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// SessionUser is now a string (the team_members.legacy_owner lowercased) so
// admins can add new users from /admin without a code change. The 5 known
// roster slugs (zaal/iman/thyrev/samantha/tyler) still get pretty labels via
// USER_LABELS. New users fall through to a capitalize() helper. The cookie's
// HMAC signature is the trust boundary - any session string with a valid sig
// was server-issued, so we don't need to maintain a hardcoded whitelist
// anymore (the SESSION_USERS set is gone).
export type SessionUser = string;

const KNOWN_USER_LABELS: Record<string, string> = {
  zaal: "Zaal",
  iman: "Iman",
  thyrev: "ThyRev",
  samantha: "Samantha",
  tyler: "Tyler",
};

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function userLabel(user: SessionUser): string {
  return KNOWN_USER_LABELS[user] ?? capitalize(user);
}

// Lead = can mark tasks DONE without going through the review queue.
// Tyler is an external collaborator (Magnetic founder, doc 473), not a lead.
// Leads are still hardcoded - this is a workflow concept, not the admin role.
export function isLead(user: SessionUser): boolean {
  return user === "zaal" || user === "iman";
}

// Admin gate. Phase B reads team_members.role via the DB; if the column or
// row is missing (pre-migration or wiped user), we fall back to the two
// hardcoded leads so the admin surface is never accidentally locked out of
// the founders. New admins are added by an existing admin clicking
// "promote to admin" in /admin -> writes team_members.role = 'admin'.
export async function isAdmin(user: SessionUser): Promise<boolean> {
  // Founders always have admin access regardless of DB state - this is the
  // glass-break path. Even if a migration drops the role column or the row
  // is deactivated by accident, Zaal/Iman keep the admin lever.
  if (user === "zaal" || user === "iman") return true;
  try {
    const role = await getRoleByLegacyOwner(user);
    return role === "admin";
  } catch {
    return false;
  }
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireSession();
  if (!(await isAdmin(u))) throw new Error("Forbidden");
  return u;
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

// Constant-time env-var password check. Plain `===` on a secret leaks length
// + prefix via timing; this normalizes to fixed-time across all 5 known
// users. The doc-761 audit (finding #5) flagged the prior `===` form.
function envPasswordMatch(input: string, envPwd: string | undefined): boolean {
  if (!envPwd) return false;
  // Pad to a common length so the equal/not-equal branch doesn't itself
  // leak length info via the conditional `if (ab.length !== bb.length)`
  // short-circuit inside timingSafeEqual.
  const maxLen = Math.max(input.length, envPwd.length, 32);
  const a = Buffer.alloc(maxLen);
  const b = Buffer.alloc(maxLen);
  Buffer.from(input).copy(a);
  Buffer.from(envPwd).copy(b);
  return timingSafeEqual(a, b) && input.length === envPwd.length;
}

// verifyPassword now checks env vars first (back-compat for the 5 hardcoded
// roster passwords), then falls back to team_members.password_hash for users
// added via /admin. Returns the legacy_owner lowercased on match - that
// string becomes the session cookie payload.
export async function verifyPassword(password: string): Promise<SessionUser | null> {
  // Env-var path (existing 5 users, env-stored, plain compare). Kept for
  // back-compat so a freshly-deployed Phase B doesn't break login for the
  // 5 roster users on day one. A future migration can move each to DB.
  if (envPasswordMatch(password, process.env.ZAAL_PASSWORD)) return "zaal";
  if (envPasswordMatch(password, process.env.IMAN_PASSWORD)) return "iman";
  if (envPasswordMatch(password, process.env.THYREV_PASSWORD)) return "thyrev";
  if (envPasswordMatch(password, process.env.SAMANTHA_PASSWORD)) return "samantha";
  if (envPasswordMatch(password, process.env.TYLER_PASSWORD)) return "tyler";

  // DB path: hashed passwords for users added via /admin (Phase B). The
  // login form has only a password field (no username) so we scan active
  // users with a hash and time-safe compare each. Slower than a username+
  // password lookup but matches the existing single-field UX.
  try {
    const m: TeamMember | null = await authenticateAnyByPassword(password);
    if (m && m.legacy_owner) return m.legacy_owner.toLowerCase();
  } catch {
    // DB unreachable - env-var fallback already returned null, treat as
    // bad credentials rather than 500ing the login form.
  }
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

// Session cookie format: `{user}.{exp}.{hmacSig}`. The HMAC over `{user}.{exp}`
// is the trust boundary - if the sig matches our AUTH_SECRET, the user string
// was server-issued (so we don't need a hardcoded SESSION_USERS whitelist to
// reject smuggled values). A lightweight sanity check still rejects obviously
// malformed user strings to keep cookie-jar typos out.
const VALID_USER_RE = /^[a-z][a-z0-9_-]{0,30}$/;

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [user, expStr, sig] = parts;
  if (!VALID_USER_RE.test(user)) return null;
  const expected = sign(`${user}.${expStr}`);
  if (!safeEqual(sig, expected)) return null;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  return user;
}

export async function requireSession(): Promise<SessionUser> {
  const u = await getSession();
  if (!u) throw new Error("Not authenticated");
  return u;
}
