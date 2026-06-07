import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, isAdmin, isLead, userLabel } from "@/lib/auth";
import { listActiveBrands } from "@/lib/brands-db";
import { getActions, ageDays } from "@/lib/data";
import { logout } from "@/app/actions";
import { NavBar } from "@/components/NavBar";
import { SettingsPanel } from "@/components/SettingsPanel";

export const dynamic = "force-dynamic";

interface Feature {
  icon: string;
  name: string;
  desc: string;
  href?: string;
  hint?: string;
}

const FEATURES: Feature[] = [
  {
    icon: "🗂️",
    name: "Board",
    desc: "All tasks as a Kanban. Filter by brand from the top tabs; multi-select for bulk actions.",
    href: "/",
  },
  {
    icon: "🙋",
    name: "My Work",
    desc: "Your landing page: tasks assigned to you, your @mentions, pending reviews, and open tasks to claim.",
    href: "/my-work",
  },
  {
    icon: "📰",
    name: "Activity",
    desc: "Every comment, progress update, and event across all tasks — grouped by day. Filter by type, person, or just your mentions. The red badge counts new mentions.",
    href: "/activity",
  },
  {
    icon: "🤖",
    name: "Assistant",
    desc: "Ask the AI about the live board (what's blocked, what to do next). Pick the model in Settings below.",
    href: "/chat",
  },
  {
    icon: "🔎",
    name: "Quick search",
    desc: "Jump to any task from anywhere by title, #id, owner or category.",
    hint: "⌘K or /",
  },
  {
    icon: "✦",
    name: "@mentions",
    desc: "Type @name in a comment to notify that person (group ping + their in-app badge). Toggle the default in Settings below.",
  },
  {
    icon: "⚡",
    name: "Instant status",
    desc: "Change a task's status from the dropdown (on the card or in the task) — it saves immediately, no master Save button.",
  },
  {
    icon: "💾",
    name: "Autosave drafts",
    desc: "Comments, updates, and notes autosave as you type and come back after a reload — your writing won't get lost.",
  },
  {
    icon: "🙌",
    name: "Claim tasks",
    desc: "Unowned tasks show a CLAIM button — grab one and it becomes yours.",
  },
];

export default async function SettingsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const [doc, navBrands] = await Promise.all([getActions(), listActiveBrands()]);

  const open = doc.items.filter((x) => x.status !== "DONE").length;
  const blocked = doc.items.filter((x) => x.status === "BLOCKED").length;
  const aging = doc.items.filter((x) => x.status !== "DONE" && ageDays(x.createdAt) > 14).length;
  const userLabelStr = userLabel(user);
  const admin = await isAdmin(user);

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#0b1020] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(148,163,184,0.12),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(59,130,246,0.10),transparent_60%)]" />
      <div className="relative max-w-3xl mx-auto py-6 space-y-4">
        <header className="flex flex-col gap-3 rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Settings &amp; Features</h1>
              <p className="text-white/50 text-xs md:text-sm">
                {userLabelStr} · {open} open · {blocked} blocked · {aging} aging
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs rounded-lg border border-white/10 px-2.5 py-1.5 text-white/70">
                {userLabelStr}
              </span>
              <form action={logout}>
                <button className="text-xs rounded-lg border border-white/10 px-2.5 py-1.5 hover:bg-white/5 text-white/70">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <NavBar isAdmin={admin} isLead={isLead(user)} brands={navBrands} />
        </header>

        {/* Features */}
        <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-6">
          <div className="mb-4 flex items-baseline gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            <h2 className="text-sm font-semibold text-white/85">What you can do here</h2>
            <span className="text-xs text-white/35">tap to try</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2.5">
            {FEATURES.map((f) => {
              const inner = (
                <div className="h-full rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition p-3.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{f.icon}</span>
                    <span className="text-sm font-semibold text-white/90">{f.name}</span>
                    {f.hint && (
                      <span className="ml-auto text-[10px] text-white/40 border border-white/15 rounded px-1.5 py-0.5">
                        {f.hint}
                      </span>
                    )}
                    {f.href && <span className="ml-auto text-white/30 text-xs">→</span>}
                  </div>
                  <p className="text-xs text-white/55 leading-relaxed">{f.desc}</p>
                </div>
              );
              return f.href ? (
                <Link key={f.name} href={f.href} prefetch={false} className="block">
                  {inner}
                </Link>
              ) : (
                <div key={f.name}>{inner}</div>
              );
            })}
          </div>
        </div>

        {/* Preferences */}
        <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-6">
          <div className="mb-4 flex items-baseline gap-2">
            <span className="h-2 w-2 rounded-full bg-teal-400" />
            <h2 className="text-sm font-semibold text-white/85">Preferences</h2>
            <span className="text-xs text-white/35">saved on this device</span>
          </div>
          <SettingsPanel />
        </div>

        {admin && (
          <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-6">
            <div className="mb-2 flex items-baseline gap-2">
              <span className="h-2 w-2 rounded-full bg-fuchsia-400" />
              <h2 className="text-sm font-semibold text-white/85">Admin</h2>
            </div>
            <p className="text-xs text-white/50">
              Manage users, brands, projects, triage, cleanup and the audit log in the{" "}
              <Link href="/admin" className="text-fuchsia-300 hover:underline">
                Admin area
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
