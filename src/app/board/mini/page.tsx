import { getSession, userLabel } from "@/lib/auth";
import { getActions } from "@/lib/data";
import type { ActionStatus } from "@/lib/types";
import { TgAuthGate } from "@/components/TgAuthGate";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<ActionStatus, string> = {
  TRIAGE: "Triage",
  TODO: "Todo",
  WIP: "In Progress",
  BLOCKED: "Blocked",
  DONE: "Done",
};

const PRIORITY_COLOR: Record<string, string> = {
  P1: "bg-red-500",
  P2: "bg-yellow-500",
  P3: "bg-gray-500",
};

export default async function MiniBoardPage() {
  const user = await getSession();

  if (!user) {
    return <TgAuthGate />;
  }

  const doc = await getActions();
  const active = doc.items
    .filter((x) => x.status === "WIP" || x.status === "TODO")
    .slice(0, 40);

  const wip = active.filter((x) => x.status === "WIP");
  const todo = active.filter((x) => x.status === "TODO").slice(0, 20);

  return (
    <main className="min-h-screen bg-[#041225] text-white px-4 py-6 pb-10">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">ZAO Cowork</h1>
          <p className="text-xs text-white/50">{userLabel(user)} · {wip.length} active, {todo.length} todo</p>
        </div>
        <a
          href="https://thezao.xyz/board"
          className="text-xs text-blue-400 underline"
        >
          Full board ↗
        </a>
      </div>

      {wip.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">
            In Progress
          </h2>
          <ul className="space-y-2">
            {wip.map((item) => (
              <li
                key={item.id}
                className="rounded-lg bg-white/5 border border-white/10 px-3 py-2.5"
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 flex-none rounded text-[10px] font-bold px-1 py-0.5 ${PRIORITY_COLOR[item.priority] ?? "bg-gray-500"}`}
                  >
                    {item.priority}
                  </span>
                  <span className="text-sm leading-snug">{item.title}</span>
                </div>
                {item.notes && (
                  <p className="mt-1 text-xs text-white/40 line-clamp-1 pl-7">
                    {item.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {todo.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">
            Todo
          </h2>
          <ul className="space-y-2">
            {todo.map((item) => (
              <li
                key={item.id}
                className="rounded-lg bg-white/[0.03] border border-white/[0.07] px-3 py-2.5"
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 flex-none rounded text-[10px] font-bold px-1 py-0.5 ${PRIORITY_COLOR[item.priority] ?? "bg-gray-500"}`}
                  >
                    {item.priority}
                  </span>
                  <span className="text-sm leading-snug text-white/80">
                    {item.title}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {doc.items.filter((x) => x.status === "TODO").length > 20 && (
            <p className="mt-3 text-xs text-white/30 text-center">
              + {doc.items.filter((x) => x.status === "TODO").length - 20} more on the full board
            </p>
          )}
        </section>
      )}

      {wip.length === 0 && todo.length === 0 && (
        <p className="text-white/50 text-center mt-12">Board is clear.</p>
      )}
    </main>
  );
}
