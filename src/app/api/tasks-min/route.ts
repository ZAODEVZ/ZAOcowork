import { NextResponse } from "next/server";
import { getActions } from "@/lib/data";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const doc = await getActions();
  const tasks = doc.items.map((item) => ({
    id: item.dbId || item.id,
    title: item.title,
  }));
  return NextResponse.json({ ok: true, tasks });
}
