import { redirect } from "next/navigation";
import { getSession, isAdmin, userLabel } from "@/lib/auth";
import { logout } from "@/app/actions";
import { NavBar } from "@/components/NavBar";
import { UsersPanel } from "@/components/admin/UsersPanel";
import { BulkOpsPanel } from "@/components/admin/BulkOpsPanel";
import { BrandsPanel } from "@/components/admin/BrandsPanel";
import { AuditPanel } from "@/components/admin/AuditPanel";
import { SlaGridChip } from "@/components/SlaGridChip";
import { listProposals } from "@/lib/proposals";
import { listTeamMembers } from "@/lib/team";
import { listBrands, listActiveBrands } from "@/lib/brands-db";
import { listAuditLogs, listAuditActors, type AuditEntityType } from "@/lib/audit";
import { getActions } from "@/lib/data";

export const dynamic = "force-dynamic";

const AUDIT_PAGE_SIZE = 50;
const ENTITY_VALUES: ReadonlyArray<AuditEntityType | "all"> = ["all", "task", "user", "brand", "system"];

function parseEntity(raw: string | undefined): AuditEntityType | "all" {
  if (!raw) return "all";
  return (ENTITY_VALUES as readonly string[]).includes(raw) ? (raw as AuditEntityType | "all") : "all";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    audit_entity?: string;
    audit_actor?: string;
    audit_page?: string;
  }>;
}) {
  const sp = await searchParams;
  const auditEntity = parseEntity(sp.audit_entity);
  const auditActor = sp.audit_actor ? sp.audit_actor.trim() : null;
  const auditPageRaw = Number(sp.audit_page ?? "1");
  const auditPage = Number.isFinite(auditPageRaw) && auditPageRaw > 0 ? Math.floor(auditPageRaw) : 1;

  const user = await getSession();
  if (!user) redirect("/login");
  if (!(await isAdmin(user))) redirect("/?not-allowed=admin");

  const userLabelStr = userLabel(user);
  // Best-effort fetch - if the role/password_hash columns don't exist yet
  // (pre-migration deploy), surface a friendly message in the Users section
  // instead of crashing the whole admin page.
  let members: Awaited<ReturnType<typeof listTeamMembers>> = [];
  let membersError: string | null = null;
  try {
    members = await listTeamMembers();
  } catch (err) {
    membersError = err instanceof Error ? err.message : "team_members read failed";
  }

  // Bulk-ops counts: how many tasks have no real owner (empty, NULL, or
  // "Open" - the open-to-claim sentinel). Audit doc 761 finding #9 flagged
  // these as the 32% silent rows that drop out of every owner filter.
  const doc = await getActions();
  const unownedCount = doc.items.filter((it) => {
    const o = String(it.owner ?? "").trim();
    return !o || o === "Open";
  }).length;

  // Brand list. listBrands returns const-fallback rows when the 002 migration
  // hasn't been applied; the BrandsPanel shows a banner in that case and
  // renders the list read-only. Once applied, DB rows replace the fallback.
  const allBrands = await listBrands();
  // Pending proposals count for the FeedCallout sibling. Best-effort -
  // if the migration isn't applied yet we silently show 0.
  const proposalsCount = await listProposals("pending").then((p) => p.rows.length).catch(() => 0);
  const navBrands = await listActiveBrands();
  const migrationApplied = !allBrands.some((b) => b.id.startsWith("const-"));

  // Audit feed. listAuditLogs returns available=false when the 003 migration
  // hasn't been applied (rather than throwing), so the AuditPanel can render
  // a friendly banner without breaking the rest of /admin.
  const auditPageData = await listAuditLogs({
    limit: AUDIT_PAGE_SIZE,
    offset: (auditPage - 1) * AUDIT_PAGE_SIZE,
    entity_type: auditEntity,
    actor: auditActor ?? undefined,
  });
  const auditActors = auditPageData.available ? await listAuditActors() : [];

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
          <NavBar isAdmin brands={navBrands} />
        </header>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          <TriageCallout itemsCount={doc.items.filter((it) => it.status === "TRIAGE" && !it.archivedAt).length} />
          <FeedCallout />
          <ProposalsCallout count={proposalsCount} />
          <CleanupCallout
            staleCount={doc.items.filter((it) => {
              if (it.archivedAt || it.status === "DONE" || it.status === "TRIAGE") return false;
              const acts = it.activity ?? [];
              const latest = Math.max(
                acts.length ? new Date(acts[acts.length - 1].createdAt).getTime() : 0,
                new Date(it.updatedAt).getTime(),
              );
              return (Date.now() - latest) / (1000 * 60 * 60 * 24) > 5;
            }).length}
          />
        </div>

        <Section title="Users" hint="Add, deactivate, reset password, promote to admin">
          {membersError ? (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              <div className="font-semibold mb-1">team_members not ready</div>
              <div className="text-xs text-amber-100/85">
                Apply <code className="text-amber-300">supabase/migrations/001_team_member_roles_and_passwords.sql</code> in
                the Supabase SQL editor, then refresh. The migration adds the role + password_hash columns this panel needs.
              </div>
              <div className="mt-2 text-[11px] text-amber-200/60">err: {membersError}</div>
            </div>
          ) : (
            <UsersPanel members={members} actorLabel={userLabelStr} />
          )}
        </Section>

        <Section title="Brands" hint="Add or retire brands without a code change">
          <BrandsPanel brands={allBrands} migrationApplied={migrationApplied} />
        </Section>

        <Section title="Bulk task ops" hint="Multi-select rows, bulk reassign / delete / retag">
          <BulkOpsPanel unownedCount={unownedCount} />
        </Section>

        <Section title="Audit log" hint="Who changed what, when">
          <AuditPanel
            rows={auditPageData.rows}
            total={auditPageData.total}
            available={auditPageData.available}
            page={auditPage}
            entity={auditEntity}
            actor={auditActor}
            actors={auditActors}
          />
        </Section>

      </div>
      <SlaGridChip />
    </main>
  );
}

function ProposalsCallout({ count }: { count: number }) {
  if (count === 0) {
    return (
      <a
        href="/admin/proposals"
        className="block rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 hover:bg-white/[0.06] transition"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white/85">AI proposals</div>
            <div className="text-xs text-white/45">No pending suggestions</div>
          </div>
          <span className="text-xs text-white/40">/admin/proposals -&gt;</span>
        </div>
      </a>
    );
  }
  return (
    <a
      href="/admin/proposals"
      className="block rounded-2xl border border-violet-500/40 bg-violet-500/10 px-5 py-3 hover:bg-violet-500/20 transition"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-violet-100">
            AI proposals: {count} pending
          </div>
          <div className="text-xs text-violet-200/75">Approve or reject - nothing applies without your click</div>
        </div>
        <span className="text-xs text-violet-200">Review -&gt;</span>
      </div>
    </a>
  );
}

function FeedCallout() {
  return (
    <a
      href="/admin/feed"
      className="block rounded-2xl border border-blue-500/30 bg-blue-500/8 px-5 py-3 hover:bg-blue-500/15 transition"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-blue-100">Activity feed</div>
          <div className="text-xs text-blue-200/70">Workspace-wide stream. Read once a day instead of chasing pings.</div>
        </div>
        <span className="text-xs text-blue-200">Open feed -&gt;</span>
      </div>
    </a>
  );
}

function CleanupCallout({ staleCount }: { staleCount: number }) {
  if (staleCount === 0) {
    return (
      <a
        href="/admin/cleanup"
        className="block rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 hover:bg-white/[0.06] transition"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white/85">Cleanup</div>
            <div className="text-xs text-white/45">No stale tasks - good shape</div>
          </div>
          <span className="text-xs text-white/40">/admin/cleanup -&gt;</span>
        </div>
      </a>
    );
  }
  return (
    <a
      href="/admin/cleanup"
      className="block rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-3 hover:bg-amber-500/20 transition"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-amber-100">
            Cleanup: {staleCount} stale task{staleCount === 1 ? "" : "s"}
          </div>
          <div className="text-xs text-amber-200/75">No activity 5+ days. Mark done, archive, or move to triage with a note.</div>
        </div>
        <span className="text-xs text-amber-200">Clean up -&gt;</span>
      </div>
    </a>
  );
}

function TriageCallout({ itemsCount }: { itemsCount: number }) {
  if (itemsCount === 0) {
    return (
      <a
        href="/admin/triage"
        className="block rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 hover:bg-white/[0.06] transition"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white/85">Triage inbox</div>
            <div className="text-xs text-white/45">Empty - external writers will land items here</div>
          </div>
          <span className="text-xs text-white/40">/admin/triage -&gt;</span>
        </div>
      </a>
    );
  }
  return (
    <a
      href="/admin/triage"
      className="block rounded-2xl border border-fuchsia-500/40 bg-fuchsia-500/10 px-5 py-3 hover:bg-fuchsia-500/20 transition"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-fuchsia-100">
            Triage inbox: {itemsCount} item{itemsCount === 1 ? "" : "s"} waiting
          </div>
          <div className="text-xs text-fuchsia-200/75">Route to owner / priority / service class before it hits the board</div>
        </div>
        <span className="text-xs text-fuchsia-200">Go to triage -&gt;</span>
      </div>
    </a>
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
