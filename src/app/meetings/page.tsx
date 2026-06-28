import { getSession, isAdmin, isLead } from "@/lib/auth";
import { listActiveBrands } from "@/lib/brands-db";
import { listTeamMembers } from "@/lib/team";
import { listMeetings } from "@/lib/meetings";
import { listMeetingRecaps } from "@/lib/meeting-recaps";
import { googleConfigured } from "@/lib/google-calendar";
import { NavBar } from "@/components/NavBar";
import { MeetingsPanel } from "@/components/MeetingsPanel";
import { MeetingRecapsPanel } from "@/components/MeetingRecapsPanel";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [navBrands, roster, meetings, recaps] = await Promise.all([
    listActiveBrands().catch(() => []),
    listTeamMembers().catch(() => []),
    listMeetings({ sinceDays: 30 }).catch(() => []),
    listMeetingRecaps().catch(() => []),
  ]);

  const team = roster
    .filter((m) => m.active && m.legacy_owner)
    .map((m) => ({ slug: (m.legacy_owner ?? "").toLowerCase(), name: m.name }));

  return (
    <main className="min-h-screen bg-zao-navy text-white">
      <NavBar isAdmin={await isAdmin(user)} isLead={isLead(user)} brands={navBrands} />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-cyan-400" />
          <h1 className="text-lg font-semibold text-white/90">Meetings</h1>
          <span className="text-sm text-white/35">Schedule, invite, and organize</span>
        </div>
        {!googleConfigured() && (
          <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200/90">
            Google Calendar isn&apos;t connected yet — meetings still work and email invites send,
            but they won&apos;t appear on the shared Google calendar. Set
            <code className="mx-1 text-amber-300">GOOGLE_SERVICE_ACCOUNT_JSON</code> +
            <code className="mx-1 text-amber-300">GOOGLE_CALENDAR_ID</code> to enable the push.
          </div>
        )}

        {/* Meetings section */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-white/70">Upcoming & Recent</h2>
          <MeetingsPanel meetings={meetings} team={team} currentUser={user} />
        </div>

        {/* Recaps section */}
        {recaps.length > 0 && (
          <div className="space-y-4 border-t border-white/10 pt-6">
            <h2 className="text-sm font-semibold text-white/70">Meeting Recaps</h2>
            <MeetingRecapsPanel recaps={recaps} />
          </div>
        )}
      </div>
    </main>
  );
}
