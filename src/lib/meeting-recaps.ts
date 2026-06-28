// Meeting recaps data layer — read-only over the `meeting_notes` table.
// Filters for project=research-recap records (meeting recaps from research docs).
// Server-only (uses the service-role client).

import { serviceClient } from "@/lib/supabase-server";

export interface MeetingRecap {
  id: string;
  title: string;
  body: string | null;
  meetingDate: string | null;
  createdAt: string;
}

interface MeetingNoteRow {
  id: string;
  title: string;
  body: string | null;
  meeting_date: string | null;
  created_at: string;
}

function rowToRecap(r: MeetingNoteRow): MeetingRecap {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    meetingDate: r.meeting_date,
    createdAt: r.created_at,
  };
}

const COLS = "id, title, body, meeting_date, created_at";

/** All meeting recaps (project=research-recap), ordered by meeting_date descending. */
export async function listMeetingRecaps(): Promise<MeetingRecap[]> {
  const { data, error } = await serviceClient()
    .from("meeting_notes")
    .select(COLS)
    .eq("project", "research-recap")
    .order("meeting_date", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as MeetingNoteRow[]).map(rowToRecap);
}
