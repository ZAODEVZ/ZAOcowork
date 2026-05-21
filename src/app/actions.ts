"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { destroySession, requireSession, isLead } from "@/lib/auth";
import {
  getActions,
  saveActions,
  newId,
  normalizeItem,
  type ActionItem,
  type ActionStatus,
  type Priority,
  type Phase,
  type TaskType,
  type Comment,
  type TaskUpdate,
  type ActivityEvent,
  type ReviewStatus,
  STATUSES,
  PRIORITIES,
  PHASES,
  CATEGORIES,
  TASK_TYPES,
} from "@/lib/data";

function asStatus(v: unknown): ActionStatus {
  return STATUSES.includes(v as ActionStatus) ? (v as ActionStatus) : "TODO";
}
function asPriority(v: unknown): Priority {
  return PRIORITIES.includes(v as Priority) ? (v as Priority) : "P2";
}
function asPhase(v: unknown): Phase {
  return PHASES.includes(v as Phase) ? (v as Phase) : "Define";
}
function asCategory(v: unknown): string {
  const s = String(v ?? "Other").trim();
  return CATEGORIES.includes(s as (typeof CATEGORIES)[number]) ? s : "Other";
}
function asBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}
function asTaskType(v: unknown): TaskType | undefined {
  return TASK_TYPES.includes(v as TaskType) ? (v as TaskType) : undefined;
}

function displayName(user: string): string {
  return user.charAt(0).toUpperCase() + user.slice(1);
}

function makeActivity(
  user: string,
  action: string,
  detail?: string,
  at?: string,
): ActivityEvent {
  return {
    id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId: user,
    displayName: displayName(user),
    action,
    detail,
    createdAt: at || new Date().toISOString(),
  };
}

function readForm(form: FormData, id: string, actor: string, prev?: ActionItem): ActionItem {
  const now = new Date().toISOString();
  const taskTypeRaw = form.get("taskType");
  const hasApprovalField = form.get("_hasRequiresApproval") === "1";
  const ownerVal = String(form.get("owner") ?? prev?.owner ?? "Open").trim();
  const next = normalizeItem({
    id,
    title: String(form.get("title") ?? prev?.title ?? "").trim(),
    createdBy: prev?.createdBy || actor,
    owner: ownerVal,
    status: asStatus(form.get("status") ?? prev?.status),
    category: asCategory(form.get("category") ?? prev?.category),
    priority: asPriority(form.get("priority") ?? prev?.priority),
    important: asBool(form.get("important") ?? prev?.important),
    urgent: asBool(form.get("urgent") ?? prev?.urgent),
    phase: asPhase(form.get("phase") ?? prev?.phase),
    due: String(form.get("due") ?? prev?.due ?? "").trim(),
    notes: String(form.get("notes") ?? prev?.notes ?? "").trim(),
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    completedAt: prev?.completedAt || "",
    completedBy: prev?.completedBy || "",
    // Operational fields
    taskType: asTaskType(taskTypeRaw) ?? prev?.taskType,
    requiresApproval: hasApprovalField
      ? asBool(form.get("requiresApproval"))
      : prev?.requiresApproval,
    assignedTo: String(form.get("assignedTo") ?? prev?.assignedTo ?? "").trim() || undefined,
    // Preserve operational data unchanged
    comments: prev?.comments,
    updates: prev?.updates,
    activity: prev?.activity,
    // Auto-claimable: Open owner means anyone can claim it
    claimable: ownerVal === "Open",
  });
  if (prev) {
    if (prev.status !== "DONE" && next.status === "DONE") {
      next.completedAt = now;
      next.completedBy = actor;
    } else if (next.status !== "DONE") {
      next.completedAt = "";
      next.completedBy = "";
    }
  }
  return next;
}

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/music");
  revalidatePath("/marketing");
}

export async function createItem(form: FormData): Promise<void> {
  const user = await requireSession();
  const doc = await getActions();
  const id = newId(doc.items);
  const item = readForm(form, id, user);
  if (!item.title) return;
  item.activity = [makeActivity(user, "created", undefined, item.createdAt)];
  doc.items.push(item);
  await saveActions(doc, user, `add #${id} ${item.title.slice(0, 40)}`);
  revalidateAll();
}

export async function quickCreate(form: FormData): Promise<void> {
  const user = await requireSession();
  const title = String(form.get("title") ?? "").trim();
  if (!title) return;
  const doc = await getActions();
  const id = newId(doc.items);
  const status = asStatus(form.get("status"));
  const category = asCategory(form.get("category"));
  const item = readForm(form, id, user);
  item.title = title;
  item.status = status;
  item.category = category;
  item.activity = [makeActivity(user, "created", undefined, item.createdAt)];
  doc.items.push(item);
  await saveActions(doc, user, `quick-add #${id} ${title.slice(0, 40)}`);
  revalidateAll();
}

export async function updateItem(form: FormData): Promise<void> {
  const user = await requireSession();
  const id = String(form.get("id") ?? "");
  if (!id) return;
  const doc = await getActions();
  const idx = doc.items.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const prev = doc.items[idx];
  const next = readForm(form, id, user, prev);
  // Log status change in activity
  if (prev.status !== next.status) {
    next.activity = [
      ...(next.activity || []),
      makeActivity(user, "status_changed", `${prev.status} → ${next.status}`),
    ];
  }
  doc.items[idx] = next;
  await saveActions(doc, user, `edit #${id}`);
  revalidateAll();
}

export async function patchField(form: FormData): Promise<void> {
  const user = await requireSession();
  const id = String(form.get("id") ?? "");
  const field = String(form.get("field") ?? "");
  const value = String(form.get("value") ?? "");
  if (!id || !field) return;
  const doc = await getActions();
  const idx = doc.items.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const cur = doc.items[idx];
  const next: ActionItem = { ...cur, updatedAt: new Date().toISOString() };
  switch (field) {
    case "title":
      next.title = value.trim();
      break;
    case "owner":
      next.owner = value.trim() || "Open";
      next.claimable = next.owner === "Open";
      break;
    case "status": {
      const prevStatus = cur.status;
      const newStatus = asStatus(value);
      // Workers cannot directly mark DONE — must go through review
      if (!isLead(user) && newStatus === "DONE") return;
      next.status = newStatus;
      if (cur.status !== "DONE" && next.status === "DONE") {
        next.completedAt = next.updatedAt;
        next.completedBy = user;
      } else if (next.status !== "DONE") {
        next.completedAt = "";
        next.completedBy = "";
      }
      if (prevStatus !== next.status) {
        next.activity = [
          ...(cur.activity || []),
          makeActivity(user, "status_changed", `${prevStatus} → ${next.status}`, next.updatedAt),
        ];
      }
      break;
    }
    case "category":
      next.category = asCategory(value);
      break;
    case "priority":
      next.priority = asPriority(value);
      break;
    case "phase":
      next.phase = asPhase(value);
      break;
    case "due":
      next.due = value.trim();
      break;
    case "notes":
      next.notes = value.trim();
      break;
    default:
      return;
  }
  doc.items[idx] = next;
  await saveActions(doc, user, `${field} #${id}`);
  revalidateAll();
}

export async function deleteItem(form: FormData): Promise<void> {
  const user = await requireSession();
  if (!isLead(user)) return;
  const id = String(form.get("id") ?? "");
  if (!id) return;
  const doc = await getActions();
  doc.items = doc.items.filter((x) => x.id !== id);
  await saveActions(doc, user, `delete #${id}`);
  revalidateAll();
}

export async function addComment(form: FormData): Promise<void> {
  const user = await requireSession();
  const id = String(form.get("id") ?? "");
  const content = String(form.get("content") ?? "").trim();
  if (!id || !content) return;
  const doc = await getActions();
  const idx = doc.items.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const now = new Date().toISOString();
  const comment: Comment = {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId: user,
    displayName: displayName(user),
    content,
    createdAt: now,
  };
  const item = doc.items[idx];
  doc.items[idx] = {
    ...item,
    updatedAt: now,
    comments: [...(item.comments || []), comment],
    activity: [
      ...(item.activity || []),
      makeActivity(user, "commented", content.slice(0, 60), now),
    ],
  };
  await saveActions(doc, user, `comment on #${id}`);
  revalidateAll();
}

export async function submitUpdate(form: FormData): Promise<void> {
  const user = await requireSession();
  const id = String(form.get("id") ?? "");
  const content = String(form.get("content") ?? "").trim();
  if (!id || !content) return;
  const doc = await getActions();
  const idx = doc.items.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const now = new Date().toISOString();
  const item = doc.items[idx];
  // Workers always require approval regardless of item setting
  const requiresApproval = !isLead(user) ? true : (item.requiresApproval ?? false);
  const toStatusRaw = form.get("toStatus");
  const toStatus =
    toStatusRaw && STATUSES.includes(toStatusRaw as ActionStatus)
      ? (toStatusRaw as ActionStatus)
      : undefined;
  const update: TaskUpdate = {
    id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    submittedBy: user,
    displayName: displayName(user),
    content,
    fromStatus: item.status,
    toStatus,
    reviewStatus: requiresApproval ? "pending" : "approved",
    createdAt: now,
  };
  let nextStatus = item.status;
  let completedAt = item.completedAt;
  let completedBy = item.completedBy;
  if (!requiresApproval && toStatus) {
    nextStatus = toStatus;
    if (item.status !== "DONE" && toStatus === "DONE") {
      completedAt = now;
      completedBy = user;
    } else if (toStatus !== "DONE") {
      completedAt = "";
      completedBy = "";
    }
  }
  const activityDetail = `${requiresApproval ? "submitted for review" : "submitted update"}${toStatus ? ` → ${toStatus}` : ""}`;
  doc.items[idx] = {
    ...item,
    status: nextStatus,
    completedAt,
    completedBy,
    updatedAt: now,
    updates: [...(item.updates || []), update],
    activity: [
      ...(item.activity || []),
      makeActivity(user, "update_submitted", activityDetail, now),
    ],
  };
  await saveActions(doc, user, `update #${id}`);
  revalidateAll();
}

export async function reviewUpdate(form: FormData): Promise<void> {
  const user = await requireSession();
  if (!isLead(user)) return;
  const id = String(form.get("id") ?? "");
  const updateId = String(form.get("updateId") ?? "");
  const decisionRaw = String(form.get("decision") ?? "");
  const reviewNotes = String(form.get("reviewNotes") ?? "").trim();
  const decision = (["approved", "rejected", "changes_requested"].includes(decisionRaw)
    ? decisionRaw
    : "rejected") as ReviewStatus;
  if (!id || !updateId) return;
  const doc = await getActions();
  const idx = doc.items.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const now = new Date().toISOString();
  const item = doc.items[idx];
  const updates = (item.updates || []).map((u) => {
    if (u.id !== updateId) return u;
    return {
      ...u,
      reviewStatus: decision,
      reviewedBy: user,
      reviewedAt: now,
      reviewNotes: reviewNotes || undefined,
    };
  });
  const reviewed = updates.find((u) => u.id === updateId);
  let nextStatus = item.status;
  let completedAt = item.completedAt;
  let completedBy = item.completedBy;
  if (decision === "approved" && reviewed?.toStatus) {
    nextStatus = reviewed.toStatus;
    if (item.status !== "DONE" && reviewed.toStatus === "DONE") {
      completedAt = now;
      completedBy = user;
    } else if (reviewed.toStatus !== "DONE") {
      completedAt = "";
      completedBy = "";
    }
  }
  doc.items[idx] = {
    ...item,
    status: nextStatus,
    completedAt,
    completedBy,
    updatedAt: now,
    updates,
    activity: [
      ...(item.activity || []),
      makeActivity(
        user,
        `review_${decision}`,
        reviewNotes || decision,
        now,
      ),
    ],
  };
  await saveActions(doc, user, `review #${id}`);
  revalidateAll();
}

export async function todoProcess(
  form: FormData,
): Promise<{ created: number; updated: number }> {
  const user = await requireSession();
  const raw = String(form.get("actions") ?? "[]");
  type TodoAction =
    | {
        type: "create";
        title: string;
        owner: string | null;
        status: ActionStatus;
        priority: Priority;
        notes: string;
        claimable: boolean;
      }
    | { type: "update_status"; itemId: string; newStatus: ActionStatus }
    | { type: "add_note"; itemId: string; note: string };

  let todoActions: TodoAction[];
  try {
    todoActions = JSON.parse(raw) as TodoAction[];
  } catch {
    return { created: 0, updated: 0 };
  }

  const doc = await getActions();
  let created = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const action of todoActions) {
    if (action.type === "create") {
      const id = newId(doc.items);
      const ownerVal = action.owner ?? "Open";
      const item = normalizeItem({
        id,
        title: action.title,
        createdBy: user,
        owner: ownerVal,
        status: action.status,
        category: "Other",
        priority: action.priority,
        important: false,
        urgent: action.priority === "P1",
        phase: "Define",
        due: "",
        notes: action.notes || "",
        createdAt: now,
        updatedAt: now,
        completedAt: "",
        completedBy: "",
        claimable: action.claimable,
      });
      item.activity = [makeActivity(user, "created", "via Todo", now)];
      if (!item.claimable) delete item.claimable;
      doc.items.push(item);
      created++;
    } else if (action.type === "update_status") {
      const idx = doc.items.findIndex((x) => x.id === action.itemId);
      if (idx >= 0) {
        const cur = doc.items[idx];
        const prevStatus = cur.status;
        let completedAt = cur.completedAt;
        let completedBy = cur.completedBy;
        if (prevStatus !== "DONE" && action.newStatus === "DONE") {
          completedAt = now;
          completedBy = user;
        } else if (action.newStatus !== "DONE") {
          completedAt = "";
          completedBy = "";
        }
        doc.items[idx] = {
          ...cur,
          status: action.newStatus,
          completedAt,
          completedBy,
          updatedAt: now,
          activity: [
            ...(cur.activity || []),
            makeActivity(
              user,
              "status_changed",
              `${prevStatus} → ${action.newStatus} (via Todo)`,
              now,
            ),
          ],
        };
        updated++;
      }
    } else if (action.type === "add_note") {
      const idx = doc.items.findIndex((x) => x.id === action.itemId);
      if (idx >= 0) {
        const cur = doc.items[idx];
        const sep = cur.notes ? "\n\n" : "";
        doc.items[idx] = {
          ...cur,
          notes: cur.notes + sep + action.note,
          updatedAt: now,
          activity: [
            ...(cur.activity || []),
            makeActivity(user, "commented", "Note added via Todo", now),
          ],
        };
        updated++;
      }
    }
  }

  if (created > 0 || updated > 0) {
    await saveActions(doc, user, `todo: +${created} created, ~${updated} updated`);
    revalidateAll();
  }

  return { created, updated };
}

export async function claimTask(form: FormData): Promise<void> {
  const user = await requireSession();
  const id = String(form.get("id") ?? "");
  if (!id) return;
  const doc = await getActions();
  const idx = doc.items.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const cur = doc.items[idx];
  const ownerName =
    user === "zaal" ? "Zaal" : user === "iman" ? "Iman" : displayName(user);
  const now = new Date().toISOString();
  doc.items[idx] = {
    ...cur,
    owner: ownerName,
    claimable: false,
    updatedAt: now,
    activity: [
      ...(cur.activity || []),
      makeActivity(user, "claimed", `Claimed by ${ownerName}`, now),
    ],
  };
  await saveActions(doc, user, `claim #${id} by ${user}`);
  revalidateAll();
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
