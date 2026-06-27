// src/app/api/v1/auto-close/route.ts
// Protected route to auto-close merged-PR tasks.
// Requires Authorization: Bearer ${AUTOCLOSE_KEY} header.

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { closeMergedSources } from "@/lib/auto-close";

// Constant-time string compare so the bearer-token check can't be brute-forced
// by measuring response time (a plain !== leaks the matching prefix length).
function safeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(request: NextRequest) {
  try {
    const autoCloseKey = process.env.AUTOCLOSE_KEY;
    if (!autoCloseKey) {
      return NextResponse.json(
        { ok: false, error: "AUTOCLOSE_KEY not configured" },
        { status: 503 },
      );
    }

    const authHeader = request.headers.get("authorization") ?? "";
    const expectedAuth = `Bearer ${autoCloseKey}`;

    if (!safeEqualStr(authHeader, expectedAuth)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const result = await closeMergedSources();
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
