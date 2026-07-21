import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  getDecisions,
  setDecision,
  type RepoDecision,
} from "@/lib/repo-decisions";

export const runtime = "nodejs";

const VALID: RepoDecision[] = ["keep", "archive", "pending"];

// GET - all persisted keep/archive decisions, keyed by repo name.
export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const map = await getDecisions();
  return NextResponse.json({ ok: true, decisions: Object.fromEntries(map) });
}

// POST { repo_name, decision, note? } - set/flip a decision for one repo.
export async function POST(req: NextRequest) {
  let user: string;
  try {
    user = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { repo_name, decision, note } = (body ?? {}) as {
    repo_name?: unknown;
    decision?: unknown;
    note?: unknown;
  };

  if (typeof repo_name !== "string" || !repo_name.trim()) {
    return NextResponse.json({ ok: false, error: "repo_name required" }, { status: 400 });
  }
  if (typeof decision !== "string" || !VALID.includes(decision as RepoDecision)) {
    return NextResponse.json(
      { ok: false, error: "decision must be keep | archive | pending" },
      { status: 400 },
    );
  }
  const cleanNote =
    typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null;

  try {
    const row = await setDecision(
      repo_name.trim(),
      decision as RepoDecision,
      cleanNote,
      user,
    );
    return NextResponse.json({ ok: true, decision: row });
  } catch (err) {
    console.error("decision POST failed", err);
    return NextResponse.json(
      { ok: false, error: "Failed to save decision" },
      { status: 500 },
    );
  }
}
