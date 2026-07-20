import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getActions } from "@/lib/data";
import { relativeTime, type ActionItem } from "@/lib/types";
import { NavBar } from "@/components/NavBar";

export const dynamic = "force-dynamic";

// /dreamscape - the LIVE version of the hand-made DreamScape snapshot.
//
// Why it exists: Brandon feeds Zaal a firehose of strategic input (the DreamNet
// organism roadmap, the Mouth/Heart specs, the WaveWarZ vision, security
// teardowns). A static page went stale instantly. This reads the board LIVE, so
// "Brandon threads" and "needs you" are always current - the organism roadmap
// is the one deliberately-curated part (it changes rarely, so it lives as config
// here and gets hand-edited when an organ ships).

// --- the organism roadmap (curated; edit when an organ moves) ---
type OrganState = "done" | "live" | "gated" | "now" | "future";
interface Organ { icon: string; name: string; desc: string; state: OrganState; note: string }

const ORGANS: Organ[] = [
  { icon: "\u{1F9B4}", name: "SPINE", desc: "control plane, one source of truth per object",
    state: "gated", note: "Agent control-plane v0 (PR #2074). Merge it to fire the Heart." },
  { icon: "\u{1F9E0}", name: "BRAINS", desc: "the models",
    state: "live", note: "Cheap-AI failover ladder live: claude -> codex -> openrouter -> ollama." },
  { icon: "❤️", name: "HEART", desc: "runtime: liveness, leases, fencing, recovery",
    state: "gated", note: "Lifecycle frozen + pushed to #2074. Fires on merge + migration." },
  { icon: "\u{1F5E3}️", name: "MOUTH", desc: "governed comms: one CommunicationEnvelope + approval classes",
    state: "now", note: "Step 1 (the envelope) frozen, PR #2465. Next: Telegram adapter." },
  { icon: "\u{1FAC1}", name: "LUNGS / CIRCULATORY", desc: "later organs",
    state: "future", note: "Not scoped yet." },
];

const STATE_LABEL: Record<OrganState, string> = {
  done: "shipped", live: "live", gated: "needs merge", now: "in progress", future: "future",
};
const STATE_COLOR: Record<OrganState, string> = {
  done: "#3ddc84", live: "#3ddc84", gated: "#f5a623", now: "#ffb02e", future: "#5b7290",
};

// A task counts as a "Brandon thread" if it is branded brandon/dreamnet, or its
// title/notes name the organism work. Kept broad so nothing he sends is missed.
const BRANDON_RE = /brandon|dreamnet|dreamloops|dreamstarter|\bmouth\b|\bheart\b|two-plane|communicationenvelope/i;
function isBrandon(it: ActionItem): boolean {
  const brands = (it.brands || []).join(" ").toLowerCase();
  if (brands.includes("brandon") || brands.includes("dreamnet")) return true;
  return BRANDON_RE.test(`${it.title} ${it.notes || ""}`);
}

// A task counts as "needs Zaal" if it is explicitly gated or blocked on him.
const GATED_RE = /zaal-gated|\[gated\]|needs? (a )?human|needs you|rotate|awaiting zaal|on zaal go|his hand/i;
function needsZaal(it: ActionItem): boolean {
  if (it.status === "DONE") return false;
  if (it.nextOwner === "blocked" || it.status === "BLOCKED") return true;
  return GATED_RE.test(`${it.title} ${it.notes || ""}`);
}

function Card({ it }: { it: ActionItem }) {
  return (
    <Link
      href={`/board?focus=${encodeURIComponent(it.id)}`}
      className="block rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:bg-white/[0.06] hover:border-[#f5a623]/40"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm text-white">{it.title}</span>
        <span className="shrink-0 text-xs text-white/35">{it.status}</span>
      </div>
      {it.owner ? <div className="mt-1 text-xs text-white/35">owner: {String(it.owner)} · {relativeTime(it.updatedAt || it.createdAt)}</div> : null}
    </Link>
  );
}

export default async function DreamScapePage() {
  const session = await getSession();
  if (!session) redirect("/login?from=/dreamscape");

  const doc = await getActions();
  const open = (doc.items ?? []).filter((i) => i.status !== "DONE");
  const brandon = open.filter(isBrandon).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  const gated = open.filter(needsZaal).sort((a, b) => (a.due || "z").localeCompare(b.due || "z"));

  return (
    <div className="min-h-screen bg-[#0a1628] text-white">
      <NavBar />
      <main className="mx-auto max-w-4xl px-5 py-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-[#f5a623]">DreamScape</h1>
          <p className="mt-1 text-sm text-white/50">
            The DreamNet organism, Brandon&apos;s threads, and what needs you - live from the board, never a snapshot.
          </p>
        </header>

        {/* Organism roadmap */}
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">DreamNet Organism</h2>
        <div className="space-y-2">
          {ORGANS.map((o) => (
            <div key={o.name} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3"
              style={{ borderLeft: `3px solid ${STATE_COLOR[o.state]}` }}>
              <span className="text-xl leading-none">{o.icon}</span>
              <div className="flex-1">
                <div className="text-[15px] font-semibold">{o.name} <span className="font-normal text-white/45">- {o.desc}</span></div>
                <div className="mt-1 text-[13px] text-white/50">{o.note}</div>
              </div>
              <span className="shrink-0 text-[11px]" style={{ color: STATE_COLOR[o.state] }}>{STATE_LABEL[o.state]}</span>
            </div>
          ))}
        </div>

        {/* Brandon threads - live */}
        <h2 className="mb-1 mt-8 flex items-baseline gap-3 text-xs font-semibold uppercase tracking-widest text-white/40">
          Brandon threads <span className="text-white/30">{brandon.length}</span>
        </h2>
        <p className="mb-3 text-sm text-white/40">Everything on the board tied to Brandon / DreamNet. Tag a task with the brand &quot;brandon&quot; to pin it here.</p>
        <div className="space-y-2">
          {brandon.length ? brandon.map((it) => <Card key={it.id} it={it} />)
            : <p className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-white/30">No open Brandon threads on the board.</p>}
        </div>

        {/* Needs you - live */}
        <h2 className="mb-1 mt-8 flex items-baseline gap-3 text-xs font-semibold uppercase tracking-widest text-white/40">
          Needs you <span className={gated.length ? "text-amber-300" : "text-emerald-300"}>{gated.length}</span>
        </h2>
        <p className="mb-3 text-sm text-white/40">Gated on you - a decision, a merge, a key, an on-chain action.</p>
        <div className="space-y-2">
          {gated.length ? gated.map((it) => <Card key={it.id} it={it} />)
            : <p className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-white/30">Nothing gated on you right now.</p>}
        </div>

        <footer className="mt-10 border-t border-white/10 pt-4 text-xs text-white/30">
          Live from the board. The organism roadmap is curated - it updates when an organ ships. Full board at{" "}
          <Link href="/board" className="text-[#f5a623] hover:underline">/board</Link>.
        </footer>
      </main>
    </div>
  );
}
