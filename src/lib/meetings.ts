// Meetings data layer — CRUD over the `meetings` table (migration 017).
// Server-only (uses the service-role client). The calendar + meetings UI read
// through here; Google Calendar push and email invites are layered on top in
// the server actions.

import { serviceClient } from "@/lib/supabase-server";

export type RsvpResponse = "pending" | "yes" | "no" | "maybe";

export interface Attendee {
  id: string; // login slug for team members, or the email for outsiders
  name: string;
  email?: string;
  response: RsvpResponse;
}

export interface Meeting {
  id: string;
  title: string;
  description: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  location: string;
  attendees: Attendee[];
  brands: string[];
  createdBy: string;
  googleEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewMeeting {
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  attendees?: Attendee[];
  brands?: string[];
  createdBy: string;
}

interface MeetingRow {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  attendees: Attendee[] | null;
  brands: string[] | null;
  created_by: string;
  google_event_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToMeeting(r: MeetingRow): Meeting {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? "",
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    location: r.location ?? "",
    attendees: Array.isArray(r.attendees) ? r.attendees : [],
    brands: Array.isArray(r.brands) ? r.brands : [],
    createdBy: r.created_by,
    googleEventId: r.google_event_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const COLS =
  "id, title, description, starts_at, ends_at, location, attendees, brands, created_by, google_event_id, created_at, updated_at";

/** All meetings, soonest first within a window (default: 90 days back → future). */
export async function listMeetings(opts: { sinceDays?: number } = {}): Promise<Meeting[]> {
  const since = new Date();
  since.setDate(since.getDate() - (opts.sinceDays ?? 90));
  const { data, error } = await serviceClient()
    .from("meetings")
    .select(COLS)
    .gte("starts_at", since.toISOString())
    .order("starts_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as MeetingRow[]).map(rowToMeeting);
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  const { data, error } = await serviceClient().from("meetings").select(COLS).eq("id", id).limit(1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as MeetingRow[];
  return rows.length ? rowToMeeting(rows[0]) : null;
}

export async function createMeeting(m: NewMeeting): Promise<Meeting> {
  const now = new Date().toISOString();
  const { data, error } = await serviceClient()
    .from("meetings")
    .insert({
      title: m.title,
      description: m.description ?? "",
      starts_at: m.startsAt,
      ends_at: m.endsAt,
      location: m.location ?? "",
      attendees: m.attendees ?? [],
      brands: m.brands ?? [],
      created_by: m.createdBy,
      created_at: now,
      updated_at: now,
    })
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return rowToMeeting(data as MeetingRow);
}

export async function updateMeeting(
  id: string,
  patch: Partial<Omit<Meeting, "id" | "createdAt" | "createdBy">>,
): Promise<Meeting> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.startsAt !== undefined) row.starts_at = patch.startsAt;
  if (patch.endsAt !== undefined) row.ends_at = patch.endsAt;
  if (patch.location !== undefined) row.location = patch.location;
  if (patch.attendees !== undefined) row.attendees = patch.attendees;
  if (patch.brands !== undefined) row.brands = patch.brands;
  if (patch.googleEventId !== undefined) row.google_event_id = patch.googleEventId;

  const { data, error } = await serviceClient()
    .from("meetings")
    .update(row)
    .eq("id", id)
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return rowToMeeting(data as MeetingRow);
}

export async function deleteMeeting(id: string): Promise<void> {
  const { error } = await serviceClient().from("meetings").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
