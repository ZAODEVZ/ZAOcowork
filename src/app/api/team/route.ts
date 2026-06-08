import { requireSession } from "@/lib/auth";
import { listTeamMembers } from "@/lib/team";

// Active team roster for the assignee checkboxes (and any future people picker).
// Returns just the login slug + display name — no roles, emails, or telegram —
// so it's safe for any logged-in user. Auth-gated.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const members = await listTeamMembers();
  const people = members
    .filter((m) => m.active && m.legacy_owner)
    .map((m) => ({ slug: (m.legacy_owner as string).toLowerCase(), name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return Response.json({ people });
}
