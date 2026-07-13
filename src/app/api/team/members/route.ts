import { requireAdmin } from "@/lib/auth";
import { listTeamMembers } from "@/lib/team";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await requireAdmin();
    const members = await listTeamMembers();
    const active = members.filter((m) => m.active && m.legacy_owner);
    return NextResponse.json(
      active.map((m) => ({
        id: m.id,
        name: m.name,
        legacyOwner: m.legacy_owner,
      }))
    );
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
