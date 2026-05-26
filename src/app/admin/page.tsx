import { redirect } from "next/navigation";
import { getSession, isAdmin, userLabel } from "@/lib/auth";
import { logout } from "@/app/actions";
import { NavBar } from "@/components/NavBar";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/?not-allowed=admin");

  const userLabelStr = userLabel(user);

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#0a0f1f] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.16),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(236,72,153,0.10),transparent_60%)]" />
      <div className="relative max-w-4xl mx-auto py-6 space-y-4">

        <header className="flex flex-col gap-3 rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Admin</h1>
              <p className="text-white/50 text-xs md:text-sm">
                User management, brand list, bulk ops, audit log
              </p>
            </div>
            <div className="flex items-center gap-2">
              <UserBadge name={userLabelStr} />
              <form action={logout}>
                <button className="text-xs rounded-lg border border-white/10 px-2.5 py-1.5 hover:bg-white/5 text-white/70">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <NavBar isAdmin />
        </header>

        <Section title="Users" hint="Add, deactivate, reset password, promote to admin">
          <Placeholder phase="B">User CRUD ships in Phase B.</Placeholder>
        </Section>

        <Section title="Brands" hint="Add or retire brands without a code change">
          <Placeholder phase="D">Brand list management ships in Phase D.</Placeholder>
        </Section>

        <Section title="Bulk task ops" hint="Multi-select rows, bulk reassign / delete / retag">
          <Placeholder phase="C">Bulk ops ship in Phase C.</Placeholder>
        </Section>

        <Section title="Audit log" hint="Who changed what, when">
          <Placeholder phase="E">Audit log ships in Phase E.</Placeholder>
        </Section>

      </div>
    </main>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-fuchsia-400" />
        <span className="text-sm font-semibold text-white/85">{title}</span>
        <span className="text-xs text-white/40">{hint}</span>
      </div>
      {children}
    </section>
  );
}

function Placeholder({ phase, children }: { phase: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-6 text-sm text-white/55">
      <span className="rounded-md border border-fuchsia-500/40 bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-fuchsia-200">
        PHASE {phase}
      </span>
      <span>{children}</span>
    </div>
  );
}

function UserBadge({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  const tone =
    name === "Zaal"
      ? "bg-blue-500/30 border-blue-400/50"
      : name === "Iman"
      ? "bg-purple-500/30 border-purple-400/50"
      : "bg-emerald-500/30 border-emerald-400/50";
  return (
    <div className={`flex items-center gap-2 rounded-full border ${tone} px-2.5 py-1`}>
      <span className="h-5 w-5 rounded-full bg-black/40 flex items-center justify-center text-xs font-bold">
        {initial}
      </span>
      <span className="text-xs">{name}</span>
    </div>
  );
}
