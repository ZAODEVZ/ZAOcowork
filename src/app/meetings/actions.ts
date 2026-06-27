"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { listTeamMembers } from "@/lib/team";
import {
  createMeeting,
  updateMeeting,
  deleteMeeting,
  getMeeting,
  type Attendee,
} from "@/lib/meetings";
import {
  pushMeetingToGoogle,
  updateMeetingInGoogle,
  deleteMeetingInGoogle,
} from "@/lib/google-calendar";
import { sendMeetingInvites } from "@/lib/meeting-invite";
import { logAudit } from "@/lib/audit";

function s(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

// Resolve attendee slugs + raw emails into Attendee records (names from roster).
async function resolveAttendees(slugs: string[], emails: string[]): Promise<Attendee[]> {
  const roster = await listTeamMembers().catch(() => []);
  const bySlug = new Map(roster.map((m) => [(m.legacy_owner ?? "").toLowerCase(), m]));
  const out: Attendee[] = [];
  for (const slug of slugs) {
    const m = bySlug.get(slug.toLowerCase());
    if (m) out.push({ id: slug.toLowerCase(), name: m.name, email: m.email ?? undefined, response: "pending" });
  }
  for (const email of emails) {
    if (email.includes("@")) out.push({ id: email.toLowerCase(), name: email, email, response: "pending" });
  }
  return out;
}

function attendeeEmails(attendees: Attendee[]): string[] {
  return attendees.map((a) => a.email).filter((e): e is string => Boolean(e));
}

export async function createMeetingAction(form: FormData): Promise<void> {
  const user = await requireSession();
  const title = s(form, "title");
  const startsAt = s(form, "startsAt");
  const endsAt = s(form, "endsAt");
  if (!title) throw new Error("title is required");
  if (!startsAt || !endsAt) throw new Error("start and end times are required");
  if (new Date(endsAt) <= new Date(startsAt)) throw new Error("end must be after start");

  const slugs = s(form, "attendees").split(",").map((x) => x.trim()).filter(Boolean);
  const emails = s(form, "emails").split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  const attendees = await resolveAttendees(slugs, emails);
  const brands = s(form, "brands").split(",").map((x) => x.trim()).filter(Boolean);

  let meeting = await createMeeting({
    title,
    description: s(form, "description"),
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    location: s(form, "location"),
    attendees,
    brands,
    createdBy: user,
  });

  // Best-effort Google push — never block creation on it.
  try {
    const gid = await pushMeetingToGoogle(meeting);
    if (gid) meeting = await updateMeeting(meeting.id, { googleEventId: gid });
  } catch (err) {
    console.error("[meetings] google push failed", err);
  }
  // Best-effort email invites.
  try {
    await sendMeetingInvites(meeting, attendeeEmails(attendees));
  } catch (err) {
    console.error("[meetings] invite send failed", err);
  }

  await logAudit({
    actor: user,
    entity_type: "meeting",
    entity_id: meeting.id,
    entity_label: title,
    action: "create_meeting",
    detail: `${attendees.length} attendee(s)`,
  });
  revalidatePath("/meetings");
  revalidatePath("/calendar");
}

export async function updateMeetingAction(form: FormData): Promise<void> {
  const user = await requireSession();
  const id = s(form, "id");
  if (!id) throw new Error("missing id");
  const cur = await getMeeting(id);
  if (!cur) throw new Error("meeting not found");

  const startsAt = s(form, "startsAt") || cur.startsAt;
  const endsAt = s(form, "endsAt") || cur.endsAt;
  if (new Date(endsAt) <= new Date(startsAt)) throw new Error("end must be after start");

  const slugs = s(form, "attendees").split(",").map((x) => x.trim()).filter(Boolean);
  const emails = s(form, "emails").split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  const attendees = slugs.length || emails.length ? await resolveAttendees(slugs, emails) : cur.attendees;

  const updated = await updateMeeting(id, {
    title: s(form, "title") || cur.title,
    description: s(form, "description"),
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    location: s(form, "location"),
    attendees,
  });

  try {
    await updateMeetingInGoogle(updated);
  } catch (err) {
    console.error("[meetings] google update failed", err);
  }
  await logAudit({ actor: user, entity_type: "meeting", entity_id: id, entity_label: updated.title, action: "update_meeting" });
  revalidatePath("/meetings");
  revalidatePath("/calendar");
}

export async function deleteMeetingAction(form: FormData): Promise<void> {
  const user = await requireSession();
  const id = s(form, "id");
  if (!id) throw new Error("missing id");
  const cur = await getMeeting(id);
  try {
    await deleteMeetingInGoogle(cur?.googleEventId ?? null);
  } catch (err) {
    console.error("[meetings] google delete failed", err);
  }
  await deleteMeeting(id);
  await logAudit({ actor: user, entity_type: "meeting", entity_id: id, action: "delete_meeting" });
  revalidatePath("/meetings");
  revalidatePath("/calendar");
}

// A teammate sets their own RSVP on a meeting.
export async function setRsvpAction(form: FormData): Promise<void> {
  const user = await requireSession();
  const id = s(form, "id");
  const response = s(form, "response") as Attendee["response"];
  if (!id || !["yes", "no", "maybe", "pending"].includes(response)) throw new Error("bad rsvp");
  const cur = await getMeeting(id);
  if (!cur) throw new Error("meeting not found");
  const attendees = cur.attendees.map((a) =>
    a.id.toLowerCase() === user.toLowerCase() ? { ...a, response } : a,
  );
  await updateMeeting(id, { attendees });
  revalidatePath("/meetings");
  revalidatePath("/calendar");
}
