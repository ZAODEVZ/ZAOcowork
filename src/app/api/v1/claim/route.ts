import { NextRequest } from "next/server";
import { redeemClaim } from "@/lib/token-claims";
import { buildSkillMarkdown } from "@/lib/skill-template";
import { rateLimit } from "@/lib/rate-limit";
import { readJsonObject, reqString, apiError } from "@/lib/api-validate";

// POST /api/v1/claim — redeem a one-time pairing code for a bot token + skill.
// Unauthenticated by design (the caller has no token yet) but gated by the
// secret code, single-use + short expiry, and IP rate-limited against guessing.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const rl = rateLimit(`claim:${ip}`, 10, 60_000);
  if (!rl.ok) {
    return Response.json(
      { ok: false, error: "rate limited", retryAfterSeconds: Math.ceil(rl.retryAfterMs / 1000) },
      { status: 429 },
    );
  }

  let code: string;
  try {
    const body = await readJsonObject(req);
    code = reqString(body.code, "code", 64);
  } catch (e) {
    return apiError(e);
  }

  const result = await redeemClaim(code);
  if (!result) {
    return Response.json({ ok: false, error: "invalid or expired code" }, { status: 404 });
  }

  return Response.json({
    ok: true,
    token: result.token,
    bot: result.bot,
    skill: buildSkillMarkdown(result.token, result.bot),
  });
}
