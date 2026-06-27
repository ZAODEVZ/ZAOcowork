"use client";

import { useState, useTransition } from "react";
import type { Meeting, RsvpResponse } from "@/lib/meetings";
import { createMeetingAction, deleteMeetingAction, setRsvpAction } from "@/app/meetings/actions";

type TeamRef = { slug: string; name: string };

const RSVP_COLOR: Record<RsvpResponse, string> = {
  yes: "text-emerald-300",
  no: "text-red-300",
  maybe: "text-amber-300",
  pending: "text-white/40",
};

function fmtRange(m: Meeting): string {
  const start = new Date(m.startsAt);
  const end = new Date(m.endsAt);
  const date = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${t(start)} – ${t(end)}`;
}

// datetime-local needs "YYYY-MM-DDTHH:MM" in local time.
function defaultStart(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
function plusHour(local: string): string {
  const d = new Date(local);
  d.setHours(d.getHours() + 1);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function MeetingsPanel({
  meetings,
  team,
  currentUser,
}: {
  meetings: Meeting[];
  team: TeamRef[];
  currentUser: string;
}) {
  const [showForm, setShowForm] = useState(meetings.length === 0);
  const [start, setStart] = useState(defaultStart());
  const [end, setEnd] = useState(plusHour(defaultStart()));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, start_] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(slug: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });
  }

  function submit(fd: FormData) {
    fd.set("startsAt", start);
    fd.set("endsAt", end);
    fd.set("attendees", Array.from(picked).join(","));
    setError(null);
    start_(async () => {
      try {
        await createMeetingAction(fd);
        setShowForm(false);
        setPicked(new Set());
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to create");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 text-sm rounded-lg border border-cyan-400/40 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25 transition"
        >
          {showForm ? "Close" : "+ New meeting"}
        </button>
      </div>

      {showForm && (
        <form action={submit} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <input
            name="title"
            required
            placeholder="Meeting title"
            className="w-full rounded-lg bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-400/50"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-white/50 space-y-1 block">
              <span>Start</span>
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => { setStart(e.target.value); setEnd(plusHour(e.target.value)); }}
                className="w-full rounded-lg bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-white/50 space-y-1 block">
              <span>End</span>
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full rounded-lg bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
          <input
            name="location"
            placeholder="Location or video link (optional)"
            className="w-full rounded-lg bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-400/50"
          />
          <textarea
            name="description"
            rows={2}
            placeholder="Agenda / notes (optional)"
            className="w-full rounded-lg bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-cyan-400/50"
          />
          <div>
            <p className="text-xs text-white/50 mb-1.5">Attendees</p>
            <div className="flex flex-wrap gap-1.5">
              {team.map((t) => (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() => toggle(t.slug)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition ${
                    picked.has(t.slug)
                      ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-100"
                      : "border-white/10 text-white/55 hover:bg-white/5"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <input
            name="emails"
            placeholder="Outside emails, comma-separated (optional)"
            className="w-full rounded-lg bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-400/50"
          />
          {error && <p className="text-xs text-red-300">{error}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/80 hover:bg-cyan-500 text-black disabled:opacity-50 transition"
            >
              {pending ? "Creating…" : "Create + send invites"}
            </button>
          </div>
        </form>
      )}

      {/* Upcoming meetings */}
      <div className="space-y-3">
        {meetings.length === 0 && !showForm && (
          <p className="text-center text-sm text-white/30 py-8">No meetings scheduled.</p>
        )}
        {meetings.map((m) => (
          <MeetingCard key={m.id} meeting={m} currentUser={currentUser} />
        ))}
      </div>
    </div>
  );
}

function MeetingCard({ meeting: m, currentUser }: { meeting: Meeting; currentUser: string }) {
  const [pending, start] = useTransition();
  const mine = m.attendees.find((a) => a.id.toLowerCase() === currentUser.toLowerCase());

  function rsvp(response: RsvpResponse) {
    const fd = new FormData();
    fd.set("id", m.id);
    fd.set("response", response);
    start(async () => { await setRsvpAction(fd); });
  }
  function remove() {
    if (!window.confirm(`Delete "${m.title}"?`)) return;
    const fd = new FormData();
    fd.set("id", m.id);
    start(async () => { await deleteMeetingAction(fd); });
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white/90 truncate">{m.title}</h3>
          <p className="text-xs text-cyan-200/80 mt-0.5">{fmtRange(m)}</p>
          {m.location && <p className="text-xs text-white/45 mt-0.5">📍 {m.location}</p>}
          {m.description && <p className="text-xs text-white/55 mt-1.5 whitespace-pre-wrap">{m.description}</p>}
        </div>
        <button
          onClick={remove}
          disabled={pending}
          className="text-[11px] text-white/30 hover:text-red-300 transition flex-shrink-0"
        >
          delete
        </button>
      </div>

      {m.attendees.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          {m.attendees.map((a) => (
            <span key={a.id} className="text-[11px]">
              <span className="text-white/65">{a.name}</span>
              <span className={`ml-1 ${RSVP_COLOR[a.response]}`}>
                {a.response === "yes" ? "✓" : a.response === "no" ? "✗" : a.response === "maybe" ? "?" : "·"}
              </span>
            </span>
          ))}
        </div>
      )}

      {mine && (
        <div className="mt-3 flex items-center gap-1.5">
          <span className="text-[11px] text-white/40 mr-1">Your RSVP:</span>
          {(["yes", "maybe", "no"] as const).map((r) => (
            <button
              key={r}
              onClick={() => rsvp(r)}
              disabled={pending}
              className={`px-2 py-0.5 text-[11px] rounded-md border transition ${
                mine.response === r
                  ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-100"
                  : "border-white/10 text-white/50 hover:bg-white/5"
              }`}
            >
              {r === "yes" ? "Going" : r === "maybe" ? "Maybe" : "Can't"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
