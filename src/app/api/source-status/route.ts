import { NextResponse, type NextRequest } from "next/server";
import { getPrStatuses } from "@/lib/source-status";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const pr = req.nextUrl.searchParams.get("pr");
  // Only a PR number — it's interpolated into the GitHub API URL.
  if (!pr || !/^\d+$/.test(pr)) return NextResponse.json({ ok: false }, { status: 400 });

  const s = await getPrStatuses([pr]);
  return NextResponse.json({
    ok: true,
    status: s[pr] ?? { state: "unknown", title: null, url: null },
  });
}
