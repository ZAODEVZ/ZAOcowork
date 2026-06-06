import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { getSession, isAdmin, isLead, userLabel } from "@/lib/auth";
import { listActiveBrands } from "@/lib/brands-db";
import { getActions, ageDays, relativeTime } from "@/lib/data";
import { matchMentions } from "@/lib/mentions";
import { logout } from "@/app/actions";
import { NavBar } from "@/components/NavBar";

export const dynamic = "force-dynamic";

type FeedKind = "comment" | "update";
interface FeedEntry {
  kind: FeedKind;
  taskId: string;
  taskTitle: string;
  author: string;
  authorId: string;
  content: string;
  createdAt: string;
}

const TZ = "America/New_York";

const AVATAR_TINT: Record<string, string> = {
  zaal: "bg-blue-500/30 text-blue-100",
  iman: "bg-purple-500/30 text-purple-100",
  thyrev: "bg-emerald-500/30 text-emerald-100",
  samantha: "bg-pink-500/30 text-pink-100",
  tyler: "bg-orange-500/30 text-orange-100",
  shawn: "bg-teal-500/30 text-teal-100",
};

function tint(authorId: string): string {
  return AVATAR_TINT[authorId.trim().toLowerCase()] ?? "bg-white/10 text-white/70";
}

function etDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

function withMentions(text: string): ReactNode {
  const re = /(^|[^\w@])(@[A-Za-z0-9_]{2,32})/g;
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[1].length;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <span key={key++} className="text-sky-300 font-medium">
        {m[2]}
      </span>,
    );
    last = start + m[2].length;
  }
  if (parts.length === 0) return text;
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function Chip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition whitespace-nowrap ${
        active
          ? "bg-sky-500/20 text-sky-200 border-sky-500/40"
          : "border-white/10 text-white/55 hover:text-white/85 hover:bg-white/[0.06]"
      }`}
    >
      {label}
    </Link>
  );
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; person?: string; mentions?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const curType: "all" | "comment" | "update" =
    sp.type === "comment" || sp.type === "update" ? sp.type : "all";
  const curPerson = (sp.person ?? "").trim().toLowerCase();
  const curMentions = sp.mentions === "me";

  const [doc, navBrands] = await Promise.all([getActions(), listActiveBrands()]);

  // Flatten every comment + update across all tasks.
  const all: FeedEntry[] = [];
  for (const it of doc.items) {
    for (const c of it.comments ?? []) {
      if (!c.content) continue;
      all.push({
        kind: "comment",
        taskId: it.id,
        taskTitle: it.title,
        author: c.displayName || c.userId || "?",
        authorId: c.userId || "",
        content: c.content,
        createdAt: c.createdAt,
      });
    }
    for (const u of it.updates ?? []) {
      if (!u.content) continue;
      all.push({
        kind: "update",
        taskId: it.id,
        taskTitle: it.title,
        author: u.displayName || u.submittedBy || "?",
        authorId: u.submittedBy || "",
        content: u.content,
        createdAt: u.createdAt,
      });
    }
  }
  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // People chips reflect the current type filter (who has this kind of activity).
  const typeScoped = all.filter((e) => curType === "all" || e.kind === curType);
  const authorMap = new Map<string, string>();
  for (const e of typeScoped) {
    const id = e.authorId.trim().toLowerCase();
    if (id && !authorMap.has(id)) authorMap.set(id, e.author);
  }
  const people = [...authorMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));

  // Apply person + "my mentions" filters.
  const meAliases = [userLabel(user), user];
  const filtered = typeScoped.filter((e) => {
    if (curPerson && e.authorId.trim().toLowerCase() !== curPerson) return false;
    if (
      curMentions &&
      matchMentions(e.content, [{ key: "me", aliases: meAliases }]).length === 0
    ) {
      return false;
    }
    return true;
  });
  const recent = filtered.slice(0, 150);

  // Build hrefs that merge current filters with an override.
  const hrefFor = (o: {
    type?: "all" | "comment" | "update";
    person?: string;
    mentions?: boolean;
  }): string => {
    const type = o.type ?? curType;
    const person = o.person ?? curPerson;
    const mentions = o.mentions ?? curMentions;
    const q = new URLSearchParams();
    if (type !== "all") q.set("type", type);
    if (person) q.set("person", person);
    if (mentions) q.set("mentions", "me");
    const s = q.toString();
    return s ? `/activity?${s}` : "/activity";
  };

  // Day grouping (ET), newest first.
  const todayKey = etDateKey(new Date().toISOString());
  const yesterdayKey = etDateKey(new Date(Date.now() - 86_400_000).toISOString());
  const dayLabel = (key: string): string => {
    if (key === todayKey) return "Today";
    if (key === yesterdayKey) return "Yesterday";
    return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };
  const groups: Array<{ key: string; label: string; items: FeedEntry[] }> = [];
  for (const e of recent) {
    const key = etDateKey(e.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(e);
    else groups.push({ key, label: dayLabel(key), items: [e] });
  }

  const open = doc.items.filter((x) => x.status !== "DONE").length;
  const blocked = doc.items.filter((x) => x.status === "BLOCKED").length;
  const aging = doc.items.filter(
    (x) => x.status !== "DONE" && ageDays(x.createdAt) > 14,
  ).length;
  const userLabelStr = userLabel(user);

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#03141f] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.14),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(14,165,233,0.10),transparent_60%)]" />
      <div className="relative max-w-3xl mx-auto py-6 space-y-4">
        <header className="flex flex-col gap-3 rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">The Zao Co-Works</h1>
              <p className="text-white/50 text-xs md:text-sm">
                {open} open · {blocked} blocked · {aging} aging
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
          <NavBar isAdmin={await isAdmin(user)} isLead={isLead(user)} brands={navBrands} />
        </header>

        <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-6">
          <div className="mb-4 flex items-baseline gap-2">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <h2 className="text-sm font-semibold text-white/85">Recent activity</h2>
            <span className="text-xs text-white/35">
              {filtered.length} shown
            </span>
          </div>

          {/* Filters */}
          <div className="mb-5 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip href={hrefFor({ type: "all" })} label="All" active={curType === "all"} />
              <Chip href={hrefFor({ type: "comment" })} label="Comments" active={curType === "comment"} />
              <Chip href={hrefFor({ type: "update" })} label="Updates" active={curType === "update"} />
              <span className="mx-1 h-4 w-px bg-white/10" />
              <Chip
                href={hrefFor({ mentions: !curMentions })}
                label="✦ My mentions"
                active={curMentions}
              />
            </div>
            {people.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip href={hrefFor({ person: "" })} label="Everyone" active={!curPerson} />
                {people.map(([id, name]) => (
                  <Chip
                    key={id}
                    href={hrefFor({ person: curPerson === id ? "" : id })}
                    label={name}
                    active={curPerson === id}
                  />
                ))}
              </div>
            )}
          </div>

          {recent.length === 0 ? (
            <p className="text-sm text-white/40 py-10 text-center">
              Nothing matches these filters.
            </p>
          ) : (
            <div className="space-y-6">
              {groups.map((g) => (
                <section key={g.key}>
                  <h3 className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-2 px-1">
                    {g.label}
                  </h3>
                  <ul className="space-y-1">
                    {g.items.map((e, i) => (
                      <li key={`${e.taskId}-${e.kind}-${i}`}>
                        <Link
                          href={`/todo/${encodeURIComponent(e.taskId)}`}
                          prefetch={false}
                          className="group flex gap-3 rounded-xl px-2.5 py-2.5 -mx-1 hover:bg-white/[0.05] transition"
                        >
                          <div
                            className={`mt-0.5 h-7 w-7 flex-shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${tint(e.authorId)}`}
                          >
                            {(e.author || "?").slice(0, 1).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-1.5 text-[12px]">
                              <span className="font-semibold text-white/90 truncate">{e.author}</span>
                              <span className="text-white/40">
                                {e.kind === "update" ? "posted an update" : "commented"}
                              </span>
                              <span className="text-white/30 ml-auto flex-shrink-0 pl-2">
                                {relativeTime(e.createdAt)}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-white/45 truncate">
                              <span className="text-white/55">#{e.taskId}</span> · {e.taskTitle}
                            </div>
                            <p className="mt-1 text-sm text-white/80 whitespace-pre-wrap break-words line-clamp-3">
                              {withMentions(e.content)}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
