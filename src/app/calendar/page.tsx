import { getSession, isAdmin, isLead } from "@/lib/auth";
import { listItems } from "@/lib/data";
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

  const [navBrands, items, meetings] = await Promise.all([
    listActiveBrands().catch(() => []),
    listItems(),
    listMeetings({ sinceDays: 60 }).catch(() => []),
  ]);
  const meetingMarks = meetings.map((m) => ({
    id: m.id,
    title: m.title,
    date: m.startsAt.slice(0, 10),
  }));

  // Extract events (tasks where isEvent=true and eventAt is set)
  const events = items.filter((item) => item.isEvent && item.eventAt);

  const upcomingEventCount = events.filter(
    (e) => new Date(e.eventAt || "") >= new Date(),
  ).length;

  return (
    <main className="min-h-screen bg-bg-primary text-ink-primary">
      <NavBar isAdmin={await isAdmin(user)} isLead={isLead(user)} brands={navBrands} />
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-ink-primary">Calendar</h1>
          <p className="text-sm text-ink-tertiary">
            Events, meetings and task due dates in one place.
          </p>
        </header>

        {/* Tasks calendar leads: it is what the page is opened for. */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-accent" />
            <h2 className="text-lg font-semibold text-ink-primary">Schedule</h2>
            <span className="text-sm text-ink-tertiary">Tasks by due date, plus meetings</span>
          </div>
          <CalendarView items={items} currentUser={user} meetings={meetingMarks} />
        </section>

        {/* Events agenda */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-cyan-500" />
              <h2 className="text-lg font-semibold text-ink-primary">Events</h2>
              <span className="text-sm text-ink-tertiary">
                {upcomingEventCount} upcoming
              </span>
            </div>
            <EventForm />
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <EventsAgenda events={events} />
          </div>
        </section>
      </div>
    </main>
  );
}
