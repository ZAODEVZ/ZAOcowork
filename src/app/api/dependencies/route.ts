import { NextResponse, type NextRequest } from "next/server";
import { getDependencies } from "@/lib/dependencies";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const taskId = req.nextUrl.searchParams.get("taskId");
  if (!taskId) return NextResponse.json({ ok: false }, { status: 400 });

  const result = await getDependencies(taskId);
  return NextResponse.json({ ok: true, ...result });
}
