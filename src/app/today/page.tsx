import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, isAdmin, isLead } from "@/lib/auth";
import { listActiveBrands } from "@/lib/brands-db";
import { listItems, type ActionItem } from "@/lib/data";
import { bucket, addDays, dueOf, daysLate, todayInFestivalTz } from "@/lib/today";
import { NavBar } from "@/components/NavBar";
import { BackButton } from "@/components/BackButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Today - The ZAO",
  description: "What has a clock on it, and what no sweep can see.",
};

/**
 * /today - the triage view.
 *
 * WHY THIS EXISTS. The board holds 432 live items and every other view answers
 * a different question: /my-work is "assigned to me", /board is everything,
 * /hud is the fleet. None of them answers "what do I do now", so that answer
 * was being rebuilt by hand in a markdown note every morning and going stale by
 * the afternoon. This page is that note, read from the table it was copied from.
 *
 * THE LAST BUCKET IS THE POINT. On 2026-09-24 the vault measured 44 open cards
 * with NO due date - invisible to every date-ordered sweep in the estate, so
 * they could not be late and therefore were never surfaced. Two of them were
 * ZAOstock items no report had ever shown. `zao-tracker list --undated` was
 * added at the reader for exactly this; UNDATED below is the same fix on the
 * web. An item with no date is not an item with no urgency.
 */

const PRIORITY_DOT: Record<string, string> = {
  P1: "bg-red-500",
  P2: "bg-amber-500",
  P3: "bg-emerald-500",
};
function Row({ it, now }: { it: ActionItem; now: string }) {
  const due = dueOf(it);
  const late = due !== "" && due < now;
  const late_by = late ? daysLate(due, now) : 0;
  return (
    <Link
      href={`/todo/${encodeURIComponent(it.id)}`}
      prefetch={false}
      className="flex items-start gap-3 rounded-xl px-2.5 py-2 -mx-1 hover:bg-white/[0.05] transition"
    >
      <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[it.priority] ?? "bg-white/30"}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white/85">{it.title}</div>
        <div className="text-[11px] text-white/40">
          <span className="text-white/55">#{it.id}</span> · {it.category} · {it.status}
          {due ? (
            <span className={late ? " text-red-300" : ""}>
              {" "}· due {due}
              {late ? ` (${late_by}d late)` : ""}
            </span>
          ) : (
            <span className="text-amber-300"> · no date</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function Section({
  title,
  blurb,
  items,
  now,
  tone,
}: {
  title: string;
  blurb: string;
  items: ActionItem[];
  now: string;
  tone: string;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={`text-xs font-semibold uppercase tracking-[0.08em] ${tone}`}>{title}</h2>
        <span className="text-xs text-white/40">{items.length}</span>
      </div>
      <p className="mt-1 mb-2 text-[11px] leading-relaxed text-white/40">{blurb}</p>
      {items.length === 0 ? (
        <p className="text-sm italic text-white/30">Nothing here.</p>
      ) : (
        <div>
          {items.map((it) => (
            <Row key={it.id} it={it} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function TodayPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  // isAdmin is async (it reads the admin list); isLead is not. Awaiting them
  // together keeps this to one round of work rather than three sequential ones.
  const [items, navBrands, admin] = await Promise.all([
    listItems({ openOnly: true }),
    listActiveBrands(),
    isAdmin(user),
  ]);

  const now = todayInFestivalTz();
  const weekEnd = addDays(now, 7);
  const { overdue, dueToday, inFlight, thisWeek, undated } = bucket(items, now);
  const open = items.filter((it) => it.status !== "DONE");
  const needsYou = overdue.length + dueToday.length;

  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <NavBar isAdmin={admin} isLead={isLead(user)} brands={navBrands} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <BackButton />
        <header className="mb-5">
          <h1 className="text-xl font-semibold">Today</h1>
          <p className="mt-1 text-sm text-white/50">
            {now} ·{" "}
            <span className={needsYou > 0 ? "text-red-300" : "text-emerald-300"}>
              {needsYou} need{needsYou === 1 ? "s" : ""} you
            </span>{" "}
            · {open.length} open on the whole board
          </p>
        </header>

        <div className="space-y-4">
          <Section
            title="Overdue"
            blurb="The date passed and nothing closed it. Oldest first - the top of this list is the thing that has been waiting longest."
            items={overdue}
            now={now}
            tone="text-red-300"
          />
          <Section
            title="Due today"
            blurb="Dated for today. Highest priority first."
            items={dueToday}
            now={now}
            tone="text-amber-300"
          />
          <Section
            title="In flight"
            blurb="Marked WIP with no date pressure. Started, not finished - the pile that quietly grows."
            items={inFlight}
            now={now}
            tone="text-sky-300"
          />
          <Section
            title="Next seven days"
            blurb={`Due between tomorrow and ${weekEnd}. Not yours to do now, but nothing here should be a surprise later.`}
            items={thisWeek}
            now={now}
            tone="text-white/70"
          />
          <Section
            title="No date"
            blurb="Open cards with no due date. Every date-ordered view in the estate skips these, so they cannot be late and never get surfaced. That is not the same as not urgent."
            items={undated}
            now={now}
            tone="text-fuchsia-300"
          />
        </div>
      </main>
    </div>
  );
}
