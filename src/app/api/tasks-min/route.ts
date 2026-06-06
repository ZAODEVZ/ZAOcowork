import { NextResponse } from "next/server";
import { getActions } from "@/lib/data";

export const runtime = "nodejs";

export async function GET() {
  const doc = await getActions();
  const tasks = doc.items.map((item) => ({
    id: item.dbId || item.id,
    title: item.title,
  }));
  return NextResponse.json({ ok: true, tasks });
}
