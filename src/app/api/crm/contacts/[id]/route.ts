import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase-server";
import { readJsonObject, optString, ApiError } from "@/lib/api-validate";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// PATCH /api/crm/contacts/[id] - update a contact
export async function PATCH(
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

    // Only allow updating these fields
    const updates: Record<string, unknown> = {};
    const allowedFields: Record<string, string> = {
      name: "name",
      superheroName: "superhero_name",
      company: "company",
      whereMet: "where_met",
      origin: "origin",
      bio: "bio",
      howHelpZao: "how_help_zao",
      priority: "priority",
      category: "category",
    };

    for (const [key, dbKey] of Object.entries(allowedFields)) {
      if (key in body) {
        updates[dbKey] = optString(body[key], key, 2000);
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { error } = await serviceClient()
      .from("contacts")
      .update(updates)
      .eq("id", id);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
    }

    await logAudit({
      actor: user,
      entity_type: "task",
      entity_id: id,
      entity_label: body.name ? String(body.name) : undefined,
      action: "crm_contact_updated",
      detail: `Updated contact fields: ${Object.keys(updates).join(", ")}`,
      metadata: updates,
    });

    return NextResponse.json({ id, success: true });
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
