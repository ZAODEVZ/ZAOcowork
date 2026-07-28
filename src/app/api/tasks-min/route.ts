import { NextResponse } from "next/server";
import { listTaskStubs } from "@/lib/data";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  // Two columns, not the whole board. This route only ever returns id+title.
  const tasks = await listTaskStubs();
  return NextResponse.json({ ok: true, tasks });
}
