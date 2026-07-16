import { NextResponse, type NextRequest } from "next/server";
import { getItem, saveItem } from "@/lib/data";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/related-tasks?taskId=<id>
 * Fetch the list of explicit related task IDs for a given task.
 */
export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const taskId = req.nextUrl.searchParams.get("taskId");
  if (!taskId) return NextResponse.json({ ok: false, error: "Missing taskId" }, { status: 400 });

  try {
    const item = await getItem(taskId);
    if (!item) return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });

    return NextResponse.json({
      ok: true,
      relatedIds: item.relatedIds || [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch related tasks";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/related-tasks
 * Add a related task link.
 * Body: { taskId: string, relatedId: string }
 * Bidirectional: adds relatedId to task's list, and task to relatedId's list.
 */
export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { taskId, relatedId } = body;

    if (!taskId || !relatedId) {
      return NextResponse.json(
        { ok: false, error: "Missing taskId or relatedId" },
        { status: 400 }
      );
    }

    if (taskId === relatedId) {
      return NextResponse.json(
        { ok: false, error: "A task cannot be related to itself" },
        { status: 400 }
      );
    }

    // Fetch both tasks
    const task = await getItem(taskId);
    const relatedTask = await getItem(relatedId);

    if (!task) {
      return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
    }

    if (!relatedTask) {
      return NextResponse.json({ ok: false, error: "Related task not found" }, { status: 404 });
    }

    // Guard: unsaved tasks can't have relations
    if (!task.dbId) {
      return NextResponse.json(
        { ok: false, error: "Task must be saved before adding relations" },
        { status: 400 }
      );
    }

    if (!relatedTask.dbId) {
      return NextResponse.json(
        { ok: false, error: "Related task must be saved" },
        { status: 400 }
      );
    }

    // Add bidirectional links
    const taskRelatedIds = new Set(task.relatedIds || []);
    const relatedTaskRelatedIds = new Set(relatedTask.relatedIds || []);

    // Check if already linked
    if (taskRelatedIds.has(relatedId)) {
      return NextResponse.json(
        { ok: false, error: "Already related" },
        { status: 400 }
      );
    }

    taskRelatedIds.add(relatedId);
    relatedTaskRelatedIds.add(taskId);

    const originalTaskRelatedIds = task.relatedIds || [];
    task.relatedIds = Array.from(taskRelatedIds);
    relatedTask.relatedIds = Array.from(relatedTaskRelatedIds);

    // Save both tasks. If the second save fails, roll back the first so the
    // link never ends up one-directional (task A points at B, B doesn't
    // point back at A).
    await saveItem(task, "system", "Added related task link");
    try {
      await saveItem(relatedTask, "system", "Added related task link");
    } catch (err) {
      task.relatedIds = originalTaskRelatedIds;
      await saveItem(task, "system", "Rollback: related task link failed").catch(() => {});
      throw err;
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to add related task";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/related-tasks
 * Remove a related task link.
 * Query: ?taskId=<id>&relatedId=<id>
 * Bidirectional: removes the link from both tasks.
 */
export async function DELETE(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const taskId = req.nextUrl.searchParams.get("taskId");
    const relatedId = req.nextUrl.searchParams.get("relatedId");

    if (!taskId || !relatedId) {
      return NextResponse.json(
        { ok: false, error: "Missing taskId or relatedId" },
        { status: 400 }
      );
    }

    // Fetch both tasks
    const task = await getItem(taskId);
    const relatedTask = await getItem(relatedId);

    if (!task) {
      return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
    }

    if (!relatedTask) {
      return NextResponse.json({ ok: false, error: "Related task not found" }, { status: 404 });
    }

    if (!task.dbId || !relatedTask.dbId) {
      return NextResponse.json(
        { ok: false, error: "Cannot remove from unsaved task" },
        { status: 400 }
      );
    }

    // Remove bidirectional links
    const originalTaskRelatedIds = task.relatedIds || [];
    task.relatedIds = originalTaskRelatedIds.filter((id) => id !== relatedId);
    relatedTask.relatedIds = (relatedTask.relatedIds || []).filter((id) => id !== taskId);

    // Save both tasks. If the second save fails, roll back the first so the
    // removal never ends up one-directional.
    await saveItem(task, "system", "Removed related task link");
    try {
      await saveItem(relatedTask, "system", "Removed related task link");
    } catch (err) {
      task.relatedIds = originalTaskRelatedIds;
      await saveItem(task, "system", "Rollback: related task unlink failed").catch(() => {});
      throw err;
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to remove related task";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
