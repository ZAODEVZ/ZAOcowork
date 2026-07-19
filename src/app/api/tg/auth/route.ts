import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Telegram initData validation: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
function validateTgInitData(
  initData: string,
  botToken: string,
): Record<string, string> | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  // secret_key = HMAC-SHA256("WebAppData", bot_token)
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(checkString).digest("hex");

  const hashBuf = Buffer.from(hash.padEnd(expected.length, " "));
  const expectedBuf = Buffer.from(expected);
  if (hashBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(hashBuf, expectedBuf)) return null;

  // auth_date freshness check: reject if older than 1 hour
  const authDate = parseInt(params.get("auth_date") ?? "0", 10);
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > 3600) return null;

  return Object.fromEntries(params.entries());
}

// TG_MINI_USERS format: "123456789:zaal,987654321:iman"
function mapTgId(tgId: string): string | null {
  const map = process.env.TG_MINI_USERS ?? "";
  for (const entry of map.split(",")) {
    const [id, user] = entry.trim().split(":");
    if (id === tgId && user) return user;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let body: { initData?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (typeof body.initData !== "string" || !body.initData) {
    return NextResponse.json({ error: "missing_init_data" }, { status: 400 });
  }

  const validated = validateTgInitData(body.initData, botToken);
  if (!validated) {
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  let tgId: string;
  try {
    const user = JSON.parse(validated.user ?? "{}") as { id?: unknown };
    tgId = String(user.id ?? "");
  } catch {
    return NextResponse.json({ error: "invalid_user" }, { status: 401 });
  }

  const sessionUser = mapTgId(tgId);
  if (!sessionUser) {
    return NextResponse.json({ error: "not_in_allowlist" }, { status: 403 });
  }

  await createSession(sessionUser);
  return NextResponse.json({ ok: true, user: sessionUser });
}
