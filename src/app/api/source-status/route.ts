import { NextResponse, type NextRequest } from "next/server";
import { getPrStatuses } from "@/lib/source-status";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const pr = req.nextUrl.searchParams.get("pr");
  if (!pr) return NextResponse.json({ ok: false }, { status: 400 });

  const s = await getPrStatuses([pr]);
  return NextResponse.json({
    ok: true,
    status: s[pr] ?? { state: "unknown", title: null, url: null },
  });
}
