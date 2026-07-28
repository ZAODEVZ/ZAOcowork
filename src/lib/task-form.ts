import { userLabel } from "@/lib/auth";
import {
  normalizeItem,
  type ActionItem,
  type ActionStatus,
  type Priority,
  type Phase,
  type TaskType,
  type ActivityEvent,
  STATUSES,
  PRIORITIES,
  PHASES,
  CATEGORIES,
  TASK_TYPES,
  SERVICE_CLASSES,
  type ServiceClass,
} from "@/lib/data";

/**
 * The pure half of src/app/actions.ts.
 *
 * These lived inside actions.ts, which is a "use server" module - and Next
 * only permits async exports from those. That meant none of this could be
 * exported, and therefore none of it could be unit tested. That is the
 * mechanical reason a 1600-line file owning every mutation on the board had
 * essentially no coverage: not neglect, a module constraint.
 *
 * Nothing here touches the DB, the session or the network. This is a pure
 * relocation - actions.ts imports these and behaves identically.
 */

export function asStatus(v: unknown): ActionStatus {
  return STATUSES.includes(v as ActionStatus) ? (v as ActionStatus) : "TODO";
}
export function asPriority(v: unknown): Priority {
  return PRIORITIES.includes(v as Priority) ? (v as Priority) : "P2";
}
export function asPhase(v: unknown): Phase {
  return PHASES.includes(v as Phase) ? (v as Phase) : "Define";
}

// Smart DMAIC default based on context
export function smartDefaultPhase(priority: Priority, due: string, status: ActionStatus): Phase {
  if (status === "DONE") return "Control"; // Done = control
  if (due && new Date(due).getTime() < Date.now()) return "Improve"; // Overdue = improve/fix
  if (due && new Date(due).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000) return "Measure"; // Due soon = measure progress
  if (priority === "P1") return "Improve"; // High priority = improve
  return "Define"; // Default = define
}
export function asCategory(v: unknown): string {
  const s = String(v ?? "Other").trim();
  return CATEGORIES.includes(s as (typeof CATEGORIES)[number]) ? s : "Other";
}
export function asBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}
export function asTaskType(v: unknown): TaskType | undefined {
  return TASK_TYPES.includes(v as TaskType) ? (v as TaskType) : undefined;
}
export function asServiceClass(v: unknown): ServiceClass {
  return SERVICE_CLASSES.includes(v as ServiceClass) ? (v as ServiceClass) : "Standard";
}
// User-provided link fields (videoUrl) are rendered as <a href>. Only accept
// https URLs so a javascript:/data: scheme can't be stored and executed on
// click (security audit). Empty/invalid -> null.
export function safeHttpUrl(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  try {
    return new URL(s).protocol === "https:" ? s : null;
  } catch {
    return null;
  }
}

export function displayName(user: string): string {
  return user.charAt(0).toUpperCase() + user.slice(1);
}

export function makeActivity(
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

export function readForm(form: FormData, id: string, actor: string, prev?: ActionItem): ActionItem {
  const now = new Date().toISOString();
  const taskTypeRaw = form.get("taskType");
  const hasApprovalField = form.get("_hasRequiresApproval") === "1";
  const ownerVal = String(form.get("owner") ?? prev?.owner ?? "Open").trim();
  // Brands come from the QuickAdd NL parser (web) or hashtag parsing (bot).
  // Multiple `brands` FormData entries -> array. Unknown brand strings are
  // tolerated here; canonicalization happens in normalizeItem/data.ts.
  const brandEntries = form.getAll("brands").map((v) => String(v).trim()).filter(Boolean);
  const brands = brandEntries.length > 0 ? brandEntries : prev?.brands ?? [];

  // Prepare values for smart defaulting
  const status = asStatus(form.get("status") ?? prev?.status);
  const priority = asPriority(form.get("priority") ?? prev?.priority);
  const due = String(form.get("due") ?? prev?.due ?? "").trim();

  // Smart DMAIC default: if phase not explicitly provided, infer from context
  const phaseExplicit = form.get("phase");
  const phase = phaseExplicit
    ? asPhase(phaseExplicit)
    : prev?.phase ? prev.phase
    : smartDefaultPhase(priority, due, status);

  const next = normalizeItem({
    id,
    // Carry the Supabase UUID through so applyDiff() targets the existing row
    // for an UPDATE. Without it the item looks new and applyDiff attempts an
    // INSERT, which trips the UNIQUE(legacy_source, legacy_id) constraint and
    // 500s every full "Save Changes" (owner/title/status) from the task panel.
    dbId: prev?.dbId,
    title: String(form.get("title") ?? prev?.title ?? "").trim(),
    createdBy: prev?.createdBy || actor,
    owner: ownerVal,
    status,
    category: asCategory(form.get("category") ?? prev?.category),
    priority,
    important: asBool(form.get("important") ?? prev?.important),
    urgent: asBool(form.get("urgent") ?? prev?.urgent),
    phase,
    due,
    notes: String(form.get("notes") ?? prev?.notes ?? "").trim(),
    brands,
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
    // Doc 763 F2: service class (Standard/FixedDate/Expedite/Intangible)
    serviceClass:
      form.get("serviceClass") != null
        ? asServiceClass(form.get("serviceClass"))
        : prev?.serviceClass ?? "Standard",
    // Doc 763 F4: archive flag survives edits
    archivedAt: prev?.archivedAt ?? null,
    // Doc 763 F3: PR linkage carried through
    prUrl: prev?.prUrl ?? null,
    prNumber: prev?.prNumber ?? null,
    prState: prev?.prState ?? null,
    // Doc 764 F5: video walkthrough URL (Loom / YouTube / Vimeo)
    videoUrl: (form.get("videoUrl") != null
      ? safeHttpUrl(form.get("videoUrl"))
      : prev?.videoUrl ?? null),
    // Doc 765 Phase I: project layer
    projectId: (form.get("projectId") != null
      ? String(form.get("projectId") ?? "").trim() || null
      : prev?.projectId ?? null),
    // Doc 765 decision 2: source taxonomy. New rows from web are
    // human-web; if a writer (bot / meeting / research) set it explicitly
    // they pass via form, else inherit prev. Default "human-web" since
    // readForm is called from server actions invoked by the web UI.
    source: ((form.get("source") as string) ?? prev?.source ?? "human-web") as ActionItem["source"],
    // Event fields: tasks that are flagged as events with a scheduled date/time
    isEvent: form.get("isEvent") === "true" || form.get("isEvent") === "1" || (taskTypeRaw === "event") || prev?.isEvent,
    eventAt: (form.get("eventAt") != null
      ? String(form.get("eventAt") ?? "").trim() || null
      : prev?.eventAt ?? null),
    eventLocation: (form.get("eventLocation") != null
      ? String(form.get("eventLocation") ?? "").trim() || null
      : prev?.eventLocation ?? null),
    eventUrl: (form.get("eventUrl") != null
      ? safeHttpUrl(form.get("eventUrl"))
      : prev?.eventUrl ?? null),
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

export function ownerFromAssignees(slugs: string[]): string {
  if (slugs.length === 0) return "Open";
  if (slugs.length === 1) return userLabel(slugs[0]);
  return "Both";
}
export function idsFromForm(form: FormData): string[] {
  return form
    .getAll("ids")
    .map((v) => String(v).trim())
    .filter(Boolean);
}
export function appendActivity(item: ActionItem, user: string, action: string, detail?: string): void {
  const ev = makeActivity(user, action, detail);
  item.activity = [...(item.activity || []), ev];
  item.updatedAt = ev.createdAt;
}
