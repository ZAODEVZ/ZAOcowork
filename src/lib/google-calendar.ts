// Google Calendar push for meetings — shared-calendar (service account) model.
// Dependency-free: mints an RS256 JWT from the service-account key and exchanges
// it for an access token, then writes events via the Calendar REST API.
//
// Gated on env — a no-op (returns null) when unconfigured, so meetings work on
// the board before Google is wired up:
//   GOOGLE_SERVICE_ACCOUNT_JSON  the full service-account key JSON (string)
//   GOOGLE_CALENDAR_ID           the shared calendar id to write to
//
// Share the target calendar with the service account's client_email (Make
// changes to events) so it can create/update/delete.

import { createSign } from "node:crypto";
import type { Meeting } from "@/lib/meetings";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_CALENDAR_ID);
}

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  };
  const header = { alg: "RS256", typ: "JWT" };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = b64url(signer.sign(sa.private_key));
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`google token exchange failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("google token exchange returned no access_token");
  return data.access_token;
}

function eventBody(m: Meeting) {
  const attendees = m.attendees
    .map((a) => a.email || (a.id.includes("@") ? a.id : null))
    .filter((e): e is string => Boolean(e))
    .map((email) => ({ email }));
  return {
    summary: m.title,
    description: m.description || undefined,
    location: m.location || undefined,
    start: { dateTime: m.startsAt },
    end: { dateTime: m.endsAt },
    attendees: attendees.length ? attendees : undefined,
  };
}

/** Create the event; returns the Google event id, or null if unconfigured. */
export async function pushMeetingToGoogle(m: Meeting): Promise<string | null> {
  const sa = loadServiceAccount();
  const calId = process.env.GOOGLE_CALENDAR_ID;
  if (!sa || !calId) return null;
  const token = await getAccessToken(sa);
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody(m)),
    },
  );
  if (!res.ok) {
    throw new Error(`google event create failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? null;
}

/** Update an existing event. No-op if unconfigured or no googleEventId. */
export async function updateMeetingInGoogle(m: Meeting): Promise<void> {
  const sa = loadServiceAccount();
  const calId = process.env.GOOGLE_CALENDAR_ID;
  if (!sa || !calId || !m.googleEventId) return;
  const token = await getAccessToken(sa);
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(m.googleEventId)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody(m)),
    },
  );
}

/** Delete an event. No-op if unconfigured or no googleEventId. */
export async function deleteMeetingInGoogle(googleEventId: string | null): Promise<void> {
  const sa = loadServiceAccount();
  const calId = process.env.GOOGLE_CALENDAR_ID;
  if (!sa || !calId || !googleEventId) return;
  const token = await getAccessToken(sa);
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(googleEventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
}
