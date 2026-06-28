import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase-server";
import { readJsonObject, reqString, optString, ApiError } from "@/lib/api-validate";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST /api/crm/contacts - add a new contact
export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await readJsonObject(req);
    const name = reqString(body.name, "name", 200);
    const superheroName = optString(body.superheroName, "superheroName", 200);
    const company = optString(body.company, "company", 200);
    const whereMet = optString(body.whereMet, "whereMet", 500);
    const origin = optString(body.origin, "origin", 200);
    const bio = optString(body.bio, "bio", 2000);
    const howHelpZao = optString(body.howHelpZao, "howHelpZao", 2000);
    const priority = optString(body.priority, "priority", 50);
    const category = optString(body.category, "category", 50);

    const { data, error } = await serviceClient()
      .from("contacts")
      .insert({
        name,
        superhero_name: superheroName || null,
        where_met: whereMet || null,
        company: company || null,
        origin: origin || null,
        bio: bio || null,
        how_help_zao: howHelpZao || null,
        priority: priority || null,
        category: category || null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
    }

    const contactId = data?.id;
    await logAudit({
      actor: user,
      entity_type: "task", // closest match in current schema
      entity_id: contactId,
      entity_label: name,
      action: "crm_contact_added",
      detail: `Added new contact: ${name}`,
      metadata: { category, priority },
    });

    return NextResponse.json({ id: contactId, name }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
