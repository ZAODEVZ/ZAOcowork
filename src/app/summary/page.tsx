import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, isAdmin, isLead } from "@/lib/auth";
import { listActiveBrands } from "@/lib/brands-db";
import { NavBar } from "@/components/NavBar";

export const dynamic = "force-dynamic";

// /summary - a single hub that links to every sub-page of the tracker.
// The one place to jump from to anywhere: work views, comms, time, and
// the agentic-todos surface. Kept intentionally simple (server-rendered
// cards) so it loads instantly and never goes stale as routes are added.

interface PageLink {
  href: string;
  label: string;
  desc: string;
  adminOnly?: boolean;
}

interface Group {
  title: string;
  accent: string;
  links: PageLink[];
}

const GROUPS: Group[] = [
  {
    title: "Work",
    accent: "bg-violet-400",
    links: [
      { href: "/board", label: "Board", desc: "The full Kanban across every brand." },
      { href: "/my-work", label: "My Work", desc: "Your tasks, mentions, and reviews - including personal items." },
      { href: "/shipped", label: "Shipped", desc: "Everything already done and archived." },
    ],
  },
  {
    title: "People and comms",
    accent: "bg-blue-400",
    links: [
      { href: "/crm", label: "CRM", desc: "Contacts, relationships, follow-ups." },
      { href: "/activity", label: "Activity", desc: "The live feed of comments and updates." },
      { href: "/meetings", label: "Meetings", desc: "Recaps, action items, and notes." },
      { href: "/chat", label: "Assistant", desc: "Ask about the board in natural language." },
    ],
  },
  {
    title: "Time and media",
    accent: "bg-emerald-400",
    links: [
      { href: "/calendar", label: "Calendar", desc: "Events and due dates on a timeline." },
      { href: "/music", label: "Music", desc: "The shared player and audio surface." },
      { href: "/marketing", label: "Marketing", desc: "Campaigns and outbound." },
    ],
  },
  {
    title: "System",
    accent: "bg-amber-400",
    links: [
      { href: "/bots", label: "Bots", desc: "Fleet heartbeats and bot status." },
      { href: "/admin", label: "Admin", desc: "Triage, cleanup, proposals, feed.", adminOnly: true },
      { href: "/settings", label: "Settings", desc: "Your account and preferences." },
    ],
  },
];

function LinkCard({ link }: { link: PageLink }) {
  return (
    <Link
      href={link.href}
      prefetch={false}
      className="group flex flex-col gap-1 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 hover:border-white/20 p-4 transition"
    >
      <span className="text-sm font-semibold text-white/85 group-hover:text-white">{link.label}</span>
      <span className="text-[12px] text-white/45 leading-snug">{link.desc}</span>
    </Link>
  );
}

export default async function SummaryPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const admin = await isAdmin(user);
  const navBrands = await listActiveBrands();

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#0a0a1f] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.14),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(59,130,246,0.10),transparent_60%)]" />
      <div className="relative max-w-5xl mx-auto py-6 space-y-6">
        <NavBar isAdmin={admin} isLead={isLead(user)} brands={navBrands} />

        <header className="rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 px-5 py-4">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Summary</h1>
          <p className="text-white/50 text-xs md:text-sm">Jump to any part of the tracker.</p>
        </header>

        {GROUPS.map((group) => {
          const links = group.links.filter((l) => !l.adminOnly || admin);
          if (links.length === 0) return null;
          return (
            <section key={group.title} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${group.accent}`} />
                <h2 className="text-sm font-semibold text-white/85">{group.title}</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {links.map((link) => (
                  <LinkCard key={link.href} link={link} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
