import { NextResponse, type NextRequest } from "next/server";

// Public routes: anyone can visit, no login redirect. The homepage `/` is
// public (renders a landing page when no session, the board when logged in -
// see src/app/page.tsx). /login + /api/login obviously have to stay public
// since that's where you go to get a session in the first place.
const PUBLIC_PATHS = new Set(["/", "/login"]);
// /api/github/webhook (doc 763 F3): hit by GitHub's bot, no session.
// Auth is HMAC inside the route handler (X-Hub-Signature-256).
// /api/digest (doc 764 F6): hit by VPS cron with Bearer auth, no session.
// /api/v1/*: bot fleet endpoints, each bearer-authed in the handler (per-bot
// tokens via COWORK_BOT_TOKENS) — bypass the cookie redirect. Covers auto-close,
// items, and bots/heartbeat.
const PUBLIC_PREFIXES = ["/login", "/api/login", "/api/github/webhook", "/api/digest", "/shipped", "/api/v1"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) {
    return NextResponse.next();
  }
  const cookie = req.cookies.get("iman-session")?.value;
  if (!cookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
