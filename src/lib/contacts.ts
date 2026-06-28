// Contacts data layer — read-only and write operations over the `contacts` table.
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

export interface ContactInteraction {
  id: string;
  contact: string;
  channel: string;
  summary: string;
  project: string;
  loggedBy: string;
  loggedAt: string;
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

interface InteractionRow {
  id: string;
  contact: string;
  channel: string;
  summary: string;
  project: string;
  logged_by: string;
  logged_at: string;
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

function rowToInteraction(r: InteractionRow): ContactInteraction {
  return {
    id: r.id,
    contact: r.contact,
    channel: r.channel,
    summary: r.summary,
    project: r.project,
    loggedBy: r.logged_by,
    loggedAt: r.logged_at,
  };
}

const CONTACT_COLS =
  "id, name, superhero_name, where_met, company, origin, bio, how_help_zao, priority, category, stats, created_at";

const INTERACTION_COLS = "id, contact, channel, summary, project, logged_by, logged_at";

/** All contacts, ordered by name. */
export async function listContacts(): Promise<Contact[]> {
  const { data, error } = await serviceClient()
    .from("contacts")
    .select(CONTACT_COLS)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ContactRow[]).map(rowToContact);
}

/** Get a single contact by ID. */
export async function getContact(id: string): Promise<Contact | null> {
  const { data, error } = await serviceClient()
    .from("contacts")
    .select(CONTACT_COLS)
    .eq("id", id)
    .single();
  if (error) return null;
  return data ? rowToContact(data as ContactRow) : null;
}

/** Get interactions for a specific contact. */
export async function getContactInteractions(contactId: string): Promise<ContactInteraction[]> {
  const { data, error } = await serviceClient()
    .from("contact_log")
    .select(INTERACTION_COLS)
    .eq("contact", contactId)
    .order("logged_at", { ascending: false });
  if (error) return [];
  return ((data ?? []) as InteractionRow[]).map(rowToInteraction);
}

/** Get distinct values for a column (for filter dropdowns). */
export async function getDistinctValues(column: string): Promise<string[]> {
  const { data, error } = await serviceClient()
    .from("contacts")
    .select(column)
    .not(column, "is", null)
    .order(column, { ascending: true });
  if (error || !data) return [];
  
  const seen = new Set<string>();
  const rows = data as unknown as Array<Record<string, unknown>>;
  for (const row of rows) {
    if (typeof row === "object" && row !== null) {
      const val = row[column];
      if (typeof val === "string" && val.trim()) {
        seen.add(val);
      }
    }
  }
  return Array.from(seen);
}
