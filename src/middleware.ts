import { NextResponse, type NextRequest } from "next/server";

// Public routes: anyone can visit, no login redirect. The homepage `/` is
// public (renders a landing page when no session, the board when logged in -
// see src/app/page.tsx). /login + /api/login obviously have to stay public
// since that's where you go to get a session in the first place.
// /what-is-the-zao is the canonical GEO answer page - MUST be public so AI
// crawlers (ChatGPT, Perplexity, Google AI Overviews, Claude) can read it.
// /zaal is the public ZAO community stats / proof-points page — indexed by AI
// crawlers and linked from llms.txt as a canonical fact source (doc 1339).
const PUBLIC_PATHS = new Set(["/", "/login", "/list", "/what-is-the-zao", "/zaal"]);
// /api/github/webhook (doc 763 F3): hit by GitHub's bot, no session.
// Auth is HMAC inside the route handler (X-Hub-Signature-256).
// /api/digest (doc 764 F6): hit by VPS cron with Bearer auth, no session.
// /api/v1/*: bot fleet endpoints, each bearer-authed in the handler (per-bot
// tokens via COWORK_BOT_TOKENS) — bypass the cookie redirect. Covers auto-close,
// items, and bots/heartbeat.
// /api/my-digest: per-person digest, Bearer DIGEST_CRON_TOKEN or session.
// /api/og: per-paper social-preview images (audited 2026-07-13) - hit by
// Farcaster/X/etc. link-preview crawlers, which never have a session cookie.
// Was missing from this list, so every og:image tag across every paper was
// silently redirecting to /login instead of returning an image - found by
// checking the live response, not just the code.
// /board/mini: Telegram Mini App board view — handles its own Telegram initData
// auth via TgAuthGate client component + /api/tg/auth. Must be public so
// Telegram's webview opens it without a cookie redirect loop.
// /api/tg/auth: validates Telegram initData HMAC and sets a session cookie.
const PUBLIC_PREFIXES = ["/login", "/api/login", "/api/github/webhook", "/api/digest", "/api/my-digest", "/shipped", "/api/v1", "/api/og", "/verify-", "/board/mini", "/api/tg/auth"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

// Verify the HMAC-signed session cookie at the edge so forged cookies are
// rejected before they reach any route handler. Mirrors the logic in
// getSession() (src/lib/auth.ts) but uses Web Crypto (Edge-compatible) instead
// of node:crypto. Returns a Promise because crypto.subtle is async.
const VALID_USER_RE = /^[a-z][a-z0-9_-]{0,30}$/;
const enc = new TextEncoder();

async function isCookieValid(raw: string): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) return false;
  const parts = raw.split(".");
  if (parts.length !== 3) return false;
  const [user, expStr, sig] = parts;
  if (!VALID_USER_RE.test(user)) return false;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(`${user}.${expStr}`));
    const expected = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    // Constant-time compare via XOR — crypto.subtle.verify would need the sig
    // as ArrayBuffer; hex-string compare is fine here since the expected value
    // is server-generated and constant-length.
    if (expected.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) {
    return NextResponse.next();
  }
  const cookie = req.cookies.get("iman-session")?.value;
  if (!cookie || !(await isCookieValid(cookie))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // llms.txt / robots.txt / sitemap.xml are static crawler files - exclude from
  // the auth middleware entirely so they stay world-readable (they were being
  // redirected to /login, hiding them from AI crawlers).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|paper|papers|llms.txt|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
