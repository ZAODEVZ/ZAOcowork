// src/app/api/v1/auto-close/route.ts
// Protected route to auto-close merged-PR tasks.
// Requires Authorization: Bearer ${AUTOCLOSE_KEY} header.

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { closeMergedSources } from "@/lib/auto-close";

export async function POST(request: NextRequest) {
  try {
    const autoCloseKey = process.env.AUTOCLOSE_KEY;
    if (!autoCloseKey) {
      return NextResponse.json(
        { ok: false, error: "AUTOCLOSE_KEY not configured" },
        { status: 503 },
      );
    }

    const authHeader = request.headers.get("authorization");
    const expectedAuth = `Bearer ${autoCloseKey}`;

    if (authHeader !== expectedAuth) {
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
