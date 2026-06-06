import { NextResponse, type NextRequest } from "next/server";
import { getDependencies } from "@/lib/dependencies";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get("taskId");
  if (!taskId) return NextResponse.json({ ok: false }, { status: 400 });

  const result = await getDependencies(taskId);
  return NextResponse.json({ ok: true, ...result });
}
