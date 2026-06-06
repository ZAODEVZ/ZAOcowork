import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { buildWeeklyDigest, digestToHtml, digestToText } from "@/lib/digest";
import { getSession } from "@/lib/auth";

// /api/digest - returns the weekly throughput digest (doc 764 F6).
//
// Two modes:
//   ?send=1 with Bearer token auth: sends via Resend, returns delivery status
//   no params: returns the digest as JSON + text + html (for preview / testing)
//
// Cron-friendly: VPS systemd timer hits this every Friday 4pm ET with
// the Bearer token, no other infra needed.
//
// Auth model:
//   - Session-authed user (lead/admin) can hit without a token (preview mode)
//   - Bearer token auth via DIGEST_CRON_TOKEN env enables ?send=1 (sender)
//
// Without RESEND_API_KEY the route returns the digest body but skips
// actually sending - so you can wire up the cron before paying for email.

export const runtime = "nodejs";

const DIGEST_RECIPIENTS = ["zaalp99@gmail.com", "iman@zao.example"];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const wantSend = url.searchParams.get("send") === "1";

  // Auth: either a session cookie OR a bearer matching DIGEST_CRON_TOKEN.
  const cronToken = process.env.DIGEST_CRON_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  // Timing-safe compare so the token can't be recovered via a timing side
  // channel on this public route (security audit).
  let bearerOk = false;
  if (cronToken) {
    const provided = Buffer.from(auth);
    const expected = Buffer.from(`Bearer ${cronToken}`);
    bearerOk = provided.length === expected.length && timingSafeEqual(provided, expected);
  }

  if (!bearerOk) {
    // /api/digest is exempt from the middleware cookie check (so the cron can
    // hit it with a bearer token), so we MUST verify the session here. Without
    // this, any anonymous caller could GET the digest and read the whole board
    // (doc 766 finding #2 — data leak).
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    // Authed preview only; actual send still requires the bearer token.
    if (wantSend) {
      return NextResponse.json({ ok: false, error: "send requires Bearer DIGEST_CRON_TOKEN" }, { status: 401 });
    }
  }

  const digest = await buildWeeklyDigest();
  const text = digestToText(digest);
  const html = digestToHtml(digest);

  if (!wantSend) {
    return NextResponse.json({ ok: true, digest, text, html });
  }

  // ?send=1 path - use Resend if configured, otherwise return what would
  // have been sent so the cron job logs are meaningful.
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({
      ok: true,
      sent: false,
      reason: "RESEND_API_KEY not set - returning preview only",
      recipients: DIGEST_RECIPIENTS,
      text,
    });
  }

  // Recipients can be overridden via DIGEST_RECIPIENTS env (comma-separated)
  const envRecipients = process.env.DIGEST_RECIPIENTS;
  const recipients = envRecipients
    ? envRecipients.split(",").map((s) => s.trim()).filter(Boolean)
    : DIGEST_RECIPIENTS;

  const from = process.env.DIGEST_FROM_ADDRESS ?? "ZAOcowork <noreply@thezao.xyz>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: `ZAOcowork weekly: ${digest.shipped} shipped (${digest.weekStart} -> ${digest.weekEnd})`,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return NextResponse.json({ ok: false, sent: false, status: res.status, error: err }, { status: 502 });
  }

  const data = (await res.json().catch(() => null)) as { id?: string } | null;
  return NextResponse.json({ ok: true, sent: true, resendId: data?.id ?? null, recipients });
}
