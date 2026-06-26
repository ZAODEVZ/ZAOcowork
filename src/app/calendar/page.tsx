import { getSession, isAdmin, isLead } from "@/lib/auth";
import { getActions } from "@/lib/data";
import { listActiveBrands } from "@/lib/brands-db";
import { NavBar } from "@/components/NavBar";
import { CalendarView } from "@/components/CalendarView";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [navBrands, doc] = await Promise.all([
    listActiveBrands().catch(() => []),
    getActions(),
  ]);

  return (
    <main className="min-h-screen bg-zao-navy text-white">
      <NavBar isAdmin={await isAdmin(user)} isLead={isLead(user)} brands={navBrands} />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          <h1 className="text-lg font-semibold text-white/90">Calendar</h1>
          <span className="text-sm text-white/35">Tasks by due date</span>
        </div>
        <CalendarView items={doc.items} currentUser={user} />
      </div>
    </main>
  );
}
