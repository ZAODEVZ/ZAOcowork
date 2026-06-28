import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase-server";
import { readJsonObject, reqString, optString, ApiError } from "@/lib/api-validate";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST /api/crm/contacts/[id]/log - log an interaction for a contact
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await readJsonObject(req);
    const channel = reqString(body.channel, "channel", 100);
    const summary = reqString(body.summary, "summary", 2000);
    const project = optString(body.project, "project", 100) || "crm";

    const { data, error } = await serviceClient()
      .from("contact_log")
      .insert({
        contact: id, // contact ID
        channel,
        summary,
        project,
        logged_by: user,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to log interaction" }, { status: 500 });
    }

    await logAudit({
      actor: user,
      entity_type: "task",
      entity_id: id,
      action: "crm_interaction_logged",
      detail: `Logged interaction via ${channel}`,
      metadata: { channel, project },
    });

    return NextResponse.json({ logId: data?.id }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
