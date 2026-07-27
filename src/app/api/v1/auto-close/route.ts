// src/app/api/v1/auto-close/route.ts
// Protected route to auto-close merged-PR tasks.
// Requires Authorization: Bearer ${AUTOCLOSE_KEY} header.

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adoptUnownedInProgress, closeMergedSources } from "@/lib/auto-close";
import { sweepAutoArchive } from "@/lib/data";

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

    // Three independent housekeeping sweeps on one 15-minute tick.
    // Each is isolated: one failing must not stop the others, so a rejected
    // sweep degrades to a reported error rather than a 500 for the whole cron.
    const [closeRes, adoptRes, archiveRes] = await Promise.allSettled([
      closeMergedSources(),
      adoptUnownedInProgress(),
      sweepAutoArchive(),
    ]);

    if (closeRes.status === "rejected") {
      // The PR-close sweep is the one this endpoint is named for; surface a
      // real failure rather than reporting ok on a no-op.
      throw closeRes.reason;
    }

    if (adoptRes.status === "rejected") {
      console.error("auto-close: adopt-unowned sweep failed:", adoptRes.reason);
    }
    if (archiveRes.status === "rejected") {
      console.error("auto-close: archive sweep failed:", archiveRes.reason);
    }

    return NextResponse.json({
      ok: true,
      ...closeRes.value,
      adopted: adoptRes.status === "fulfilled" ? adoptRes.value.adopted : null,
      archived: archiveRes.status === "fulfilled" ? archiveRes.value.archived : null,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
