import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getActions, saveActions, type ActionItem } from "@/lib/data";
import { logAudit } from "@/lib/audit";

// GitHub webhook handler (doc 763 F3).
//
// Wire-up: GitHub repo Settings -> Webhooks -> Add webhook ->
//   Payload URL: https://www.thezao.xyz/api/github/webhook
//   Content type: application/json
//   Secret: GITHUB_WEBHOOK_SECRET env var
//   Events: "Pull requests" + "Pull request reviews"
//
// Convention: a task is linked to a PR when its task ID appears in the
// PR title as `cowork#<id>` (case-insensitive). Examples that match:
//   - "Fix auth bug (cowork#42)"
//   - "COWORK#42 add filter chip"
//   - "[cowork#42] migrate users table"
// Bodies are scanned too as a fallback.
//
// State transitions:
//   - PR opened     -> task TODO -> WIP
//   - PR merged     -> task WIP -> DONE (or pending review if requiresApproval)
//   - PR closed-no-merge -> no status change; activity logged
//
// Auth is HMAC-SHA256 of the raw body via X-Hub-Signature-256 header.
// We never trust the JSON payload before verifying the signature.

export const runtime = "nodejs";

const TASK_ID_RE = /cowork#(\d+)/gi;

interface PRPayload {
  action: string;
  pull_request?: {
    number: number;
    title: string;
    body?: string | null;
    html_url: string;
    state: string;
    merged: boolean;
    user?: { login: string };
  };
  repository?: { full_name: string };
}

function verifySignature(rawBody: string, sigHeader: string | null, secret: string): boolean {
  if (!sigHeader || !sigHeader.startsWith("sha256=")) return false;
  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = Buffer.from(`sha256=${expectedHex}`);
  const got = Buffer.from(sigHeader);
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

function extractTaskIds(title: string, body: string | null | undefined): string[] {
  const text = `${title} ${body ?? ""}`;
  const ids = new Set<string>();
  for (const match of text.matchAll(TASK_ID_RE)) {
    ids.add(match[1]);
  }
  return Array.from(ids);
}

export async function POST(req: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    // Webhook configured but secret not set on server -> reject so a misconfigured
    // production deploy doesn't accept anonymous mutations.
    return NextResponse.json({ ok: false, error: "GITHUB_WEBHOOK_SECRET not set" }, { status: 503 });
  }

  const rawBody = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  if (!verifySignature(rawBody, sig, secret)) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event") ?? "";
  if (event !== "pull_request") {
    // Acknowledge but ignore non-PR events (ping, push, etc).
    return NextResponse.json({ ok: true, ignored: event });
  }

  let payload: PRPayload;
  try {
    payload = JSON.parse(rawBody) as PRPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const pr = payload.pull_request;
  if (!pr) {
    return NextResponse.json({ ok: true, ignored: "no pr" });
  }
  const taskIds = extractTaskIds(pr.title, pr.body);
  if (taskIds.length === 0) {
    return NextResponse.json({ ok: true, ignored: "no cowork#N in title or body" });
  }

  // Determine desired state from action.
  const action = payload.action;
  let targetStatus: "WIP" | "DONE" | null = null;
  let prState: "open" | "merged" | "closed" = "open";
  if (action === "opened" || action === "reopened" || action === "ready_for_review") {
    targetStatus = "WIP";
    prState = "open";
  } else if (action === "closed") {
    if (pr.merged) {
      targetStatus = "DONE";
      prState = "merged";
    } else {
      // Don't change status, but log + record state.
      prState = "closed";
    }
  } else {
    // edited, synchronize, review_requested, etc. - update PR linkage but
    // don't change status (the PR is mid-flight).
    prState = "open";
  }

  const doc = await getActions();
  let touched = 0;
  const now = new Date().toISOString();
  const actor = `github:${pr.user?.login ?? "webhook"}`;

  for (const id of taskIds) {
    const idx = doc.items.findIndex((x) => x.id === id);
    if (idx < 0) continue;
    const cur = doc.items[idx];
    const next: ActionItem = {
      ...cur,
      prUrl: pr.html_url,
      prNumber: pr.number,
      prState,
      updatedAt: now,
      activity: [
        ...(cur.activity || []),
        {
          id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          userId: actor,
          displayName: pr.user?.login ?? "GitHub",
          action: `pr_${action}`,
          detail: `${pr.title} (#${pr.number})`,
          createdAt: now,
        },
      ],
    };

    if (targetStatus === "WIP" && cur.status === "TODO") {
      next.status = "WIP";
    } else if (targetStatus === "DONE" && (cur.status === "WIP" || cur.status === "BLOCKED")) {
      // Worker-created tasks that requireApproval stay in WIP (not DONE) so
      // the lead's review queue is preserved. Auto-promote only for tasks
      // that don't require approval.
      if (!cur.requiresApproval) {
        next.status = "DONE";
        next.completedAt = now;
        next.completedBy = actor;
      }
    }
    doc.items[idx] = next;
    touched++;

    await logAudit({
      actor,
      entity_type: "task",
      entity_id: id,
      entity_label: cur.title,
      action: `github_pr_${action}`,
      detail: `PR #${pr.number}: ${pr.title}`,
      metadata: { pr_number: pr.number, pr_url: pr.html_url, pr_state: prState, target_status: targetStatus },
    });
  }

  if (touched > 0) {
    await saveActions(doc, actor, `github: pr_${action} touched ${touched} task${touched === 1 ? "" : "s"}`);
  }

  return NextResponse.json({ ok: true, touched, taskIds, action });
}
