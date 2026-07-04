import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { getActions } from "@/lib/data";
import { listBrands } from "@/lib/brands-db";
import { createProposal } from "@/lib/proposals";

// /api/proposals/suggest-brands?taskId=N - rule-based proposer for v1.
//
// Looks at a task's title + notes, matches against active brand slugs,
// and creates a proposal if it finds 1+ matching brands the task doesn't
// already have tagged. Returns the proposal id so the UI can refresh.
//
// Rule-based (not LLM) for the first iteration so we don't burn MiniMax
// tokens on what is essentially a regex match. The proposal infrastructure
// supports any source string ('llm', 'rule:brand-slug', etc) so we can
// add LLM-backed proposers later without changing the queue.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const taskId = url.searchParams.get("taskId");
  if (!taskId) {
    return NextResponse.json({ ok: false, error: "taskId required" }, { status: 400 });
  }

  let doc;
  let brands;
  try {
    [doc, brands] = await Promise.all([getActions(), listBrands()]);
  } catch (err) {
    console.error("Failed to load actions or brands:", err);
    return NextResponse.json({ ok: false, error: "Failed to load data" }, { status: 500 });
  }

  const task = doc.items.find((it) => it.id === taskId);
  if (!task) {
    return NextResponse.json({ ok: false, error: `task #${taskId} not found` }, { status: 404 });
  }

  const haystack = `${task.title} ${task.notes ?? ""}`.toLowerCase();
  const matched: string[] = [];
  for (const brand of brands) {
    if (!brand.active) continue;
    if ((task.brands ?? []).includes(brand.name)) continue;
    const slugs = [brand.name.toLowerCase(), ...brand.slugs];
    for (const slug of slugs) {
      if (!slug) continue;
      // Word-boundary match so "zao" doesn't trigger on "zaostock"; here we
      // intentionally allow partials because brand slugs include both the
      // long form and the short form so the data ALREADY covers prefix cases.
      if (haystack.includes(slug.toLowerCase())) {
        matched.push(brand.name);
        break;
      }
    }
  }

  if (matched.length === 0) {
    return NextResponse.json({ ok: true, suggested: 0, message: "no brand matches found in title/notes" });
  }

  // Combine current + suggested, dedupe.
  const proposedBrands = Array.from(new Set([...(task.brands ?? []), ...matched]));

  let created;
  try {
    created = await createProposal({
      task_id: taskId,
      action_type: "set_brands",
      payload: { brands: proposedBrands, suggested: matched },
      source: "rule:brand-slug-match",
      confidence: 0.75,
      rationale: `Matched slugs in task title/notes: ${matched.join(", ")}`,
    });
  } catch (err) {
    console.error("Failed to create proposal:", err);
    return NextResponse.json({
      ok: false,
      error: "Failed to create proposal",
    }, { status: 500 });
  }

  if (!created) {
    return NextResponse.json({
      ok: false,
      error: "task_proposals table not ready (apply migration 005)",
    }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    suggested: matched.length,
    proposalId: created.id,
    matched,
  });
}
