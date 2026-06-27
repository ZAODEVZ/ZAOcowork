// Email meeting invites with an .ics attachment, via Resend. Gated on
// RESEND_API_KEY — a no-op (returns { sent: false }) when unconfigured, so
// meetings work on the board before email is wired up.

import type { Meeting } from "@/lib/meetings";

function toIcsDate(iso: string): string {
  // YYYYMMDDTHHMMSSZ (UTC)
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsEscape(s: string): string {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Build an RFC-5545 VEVENT for the meeting. */
export function buildIcs(m: Meeting): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZAO Co-Works//Meetings//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${m.id}@thezao.xyz`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    `DTSTART:${toIcsDate(m.startsAt)}`,
    `DTEND:${toIcsDate(m.endsAt)}`,
    `SUMMARY:${icsEscape(m.title)}`,
    m.description ? `DESCRIPTION:${icsEscape(m.description)}` : "",
    m.location ? `LOCATION:${icsEscape(m.location)}` : "",
    `ORGANIZER;CN=${icsEscape(m.createdBy)}:mailto:noreply@thezao.xyz`,
    ...m.attendees
      .map((a) => a.email || (a.id.includes("@") ? a.id : null))
      .filter((e): e is string => Boolean(e))
      .map((email) => `ATTENDEE;RSVP=TRUE:mailto:${email}`),
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}

function fmtRange(m: Meeting): string {
  const start = new Date(m.startsAt);
  const end = new Date(m.endsAt);
  const date = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date}, ${t(start)} – ${t(end)}`;
}

export async function sendMeetingInvites(
  m: Meeting,
  recipientEmails: string[],
): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "RESEND_API_KEY not set" };
  if (recipientEmails.length === 0) return { sent: false, reason: "no recipient emails" };

  const from = process.env.DIGEST_FROM_ADDRESS || "ZAO Co-Works <noreply@thezao.xyz>";
  const ics = buildIcs(m);
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px">
      <h2 style="margin:0 0 4px">${m.title}</h2>
      <p style="color:#555;margin:0 0 12px">${fmtRange(m)}</p>
      ${m.location ? `<p><strong>Where:</strong> ${m.location}</p>` : ""}
      ${m.description ? `<p>${m.description.replace(/\n/g, "<br>")}</p>` : ""}
      <p style="color:#888;font-size:12px">You're invited via ZAO Co-Works. The attached .ics adds it to your calendar.</p>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: recipientEmails,
      subject: `Invite: ${m.title} — ${fmtRange(m)}`,
      html,
      attachments: [
        { filename: "invite.ics", content: Buffer.from(ics).toString("base64") },
      ],
    }),
  });
  if (!res.ok) {
    return { sent: false, reason: `resend ${res.status}: ${await res.text().catch(() => "")}` };
  }
  return { sent: true };
}
