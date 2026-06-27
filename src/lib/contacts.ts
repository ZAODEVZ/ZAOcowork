// Contacts data layer — read-only over the `contacts` table.
// Server-only (uses the service-role client).

import { serviceClient } from "@/lib/supabase-server";

export interface Contact {
  id: string;
  name: string;
  superheroName: string | null;
  whereMet: string | null;
  company: string | null;
  origin: string | null;
  bio: string | null;
  howHelpZao: string | null;
  priority: string | null;
  category: string | null;
  stats: Record<string, unknown> | null;
  createdAt: string;
}

interface ContactRow {
  id: string;
  name: string;
  superhero_name: string | null;
  where_met: string | null;
  company: string | null;
  origin: string | null;
  bio: string | null;
  how_help_zao: string | null;
  priority: string | null;
  category: string | null;
  stats: Record<string, unknown> | null;
  created_at: string;
}

function rowToContact(r: ContactRow): Contact {
  return {
    id: r.id,
    name: r.name,
    superheroName: r.superhero_name,
    whereMet: r.where_met,
    company: r.company,
    origin: r.origin,
    bio: r.bio,
    howHelpZao: r.how_help_zao,
    priority: r.priority,
    category: r.category,
    stats: r.stats,
    createdAt: r.created_at,
  };
}

const COLS =
  "id, name, superhero_name, where_met, company, origin, bio, how_help_zao, priority, category, stats, created_at";

/** All contacts, ordered by name. */
export async function listContacts(): Promise<Contact[]> {
  const { data, error } = await serviceClient()
    .from("contacts")
    .select(COLS)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ContactRow[]).map(rowToContact);
}
