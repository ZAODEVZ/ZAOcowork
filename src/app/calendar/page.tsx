import { getSession, isAdmin, isLead } from "@/lib/auth";
import { getActions } from "@/lib/data";
import { listActiveBrands } from "@/lib/brands-db";
import { listMeetings } from "@/lib/meetings";
import { NavBar } from "@/components/NavBar";
import { CalendarView } from "@/components/CalendarView";
import { EventsAgenda } from "@/components/EventsAgenda";
import { EventForm } from "@/components/EventForm";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [navBrands, doc, meetings] = await Promise.all([
    listActiveBrands().catch(() => []),
    getActions(),
    listMeetings({ sinceDays: 60 }).catch(() => []),
  ]);
  const meetingMarks = meetings.map((m) => ({
    id: m.id,
    title: m.title,
    date: m.startsAt.slice(0, 10),
  }));

  // Extract events (tasks where isEvent=true and eventAt is set)
  const events = doc.items.filter((item) => item.isEvent && item.eventAt);

  return (
    <main className="min-h-screen bg-zao-navy text-white">
      <NavBar isAdmin={await isAdmin(user)} isLead={isLead(user)} brands={navBrands} />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {/* Events Agenda */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <h2 className="text-lg font-semibold text-white/90">Events</h2>
              <span className="text-sm text-white/35">Upcoming and past</span>
            </div>
            <EventForm />
          </div>
          <div className="bg-white/3 rounded-lg p-4 border border-white/10">
            <EventsAgenda events={events} />
          </div>
        </section>

        {/* Tasks Calendar */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <h2 className="text-lg font-semibold text-white/90">Tasks</h2>
            <span className="text-sm text-white/35">By due date</span>
          </div>
          <CalendarView items={doc.items} currentUser={user} meetings={meetingMarks} />
        </section>
      </div>
    </main>
  );
}
