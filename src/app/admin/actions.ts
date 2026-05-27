"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, userLabel } from "@/lib/auth";
import {
  addTeamMember,
  deleteTeamMember,
  resetMemberPassword,
  setMemberActive,
  setMemberRole,
  type TeamRole,
} from "@/lib/team";
import {
  addBrand,
  deleteBrand,
  updateBrand,
} from "@/lib/brands-db";
import {
  createProject,
  deleteProject,
  updateProject,
  type NewProject,
} from "@/lib/projects";
import type { ProjectStatus } from "@/lib/types";
import { logAudit } from "@/lib/audit";

function asRole(v: FormDataEntryValue | null): TeamRole {
  const s = String(v ?? "").toLowerCase();
  if (s === "admin" || s === "lead" || s === "worker") return s;
  return "worker";
}

function bouncedErr(msg: string): never {
  // Server actions can't return rich payloads to the form via useFormState
  // without bigger refactoring; throwing surfaces in the dev console + a
  // 500 page for the user. Bad inputs are gated client-side so this is the
  // belt-and-suspenders branch.
  throw new Error(msg);
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9 .'-]{0,40}$/;
const SLUG_RE = /^[a-z][a-z0-9_-]{0,30}$/;

export async function addUserAction(form: FormData): Promise<void> {
  const actor = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const legacy = String(form.get("legacy_owner") ?? "").trim().toLowerCase();
  const role = asRole(form.get("role"));
  const password = String(form.get("password") ?? "");
  const tgRaw = String(form.get("telegram_id") ?? "").trim();
  const email = String(form.get("email") ?? "").trim() || null;

  if (!NAME_RE.test(name)) bouncedErr("invalid name");
  if (!SLUG_RE.test(legacy)) bouncedErr("invalid login slug (lowercase letters/numbers/dash/underscore, start with letter)");
  if (password.length < 8) bouncedErr("password must be at least 8 chars");
  const telegram_id = tgRaw ? Number(tgRaw) : null;
  if (tgRaw && !Number.isFinite(telegram_id)) bouncedErr("telegram_id must be numeric");

  const added = await addTeamMember({
    name,
    legacy_owner: legacy,
    role,
    password,
    telegram_id,
    email,
    set_by: userLabel(actor),
  });
  await logAudit({
    actor: userLabel(actor),
    entity_type: "user",
    entity_id: added.id,
    entity_label: name,
    action: "add_user",
    detail: `role=${role}, slug=${legacy}`,
    metadata: { role, legacy_owner: legacy, telegram_id, email },
  });
  revalidatePath("/admin");
}

export async function resetPasswordAction(form: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(form.get("id") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!id) bouncedErr("missing id");
  if (password.length < 8) bouncedErr("password must be at least 8 chars");
  await resetMemberPassword(id, password, userLabel(actor));
  await logAudit({
    actor: userLabel(actor),
    entity_type: "user",
    entity_id: id,
    action: "reset_password",
    detail: "password reset",
  });
  revalidatePath("/admin");
}

export async function setRoleAction(form: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(form.get("id") ?? "").trim();
  const role = asRole(form.get("role"));
  if (!id) bouncedErr("missing id");
  await setMemberRole(id, role);
  await logAudit({
    actor: userLabel(actor),
    entity_type: "user",
    entity_id: id,
    action: "set_role",
    detail: `role -> ${role}`,
    metadata: { role },
  });
  revalidatePath("/admin");
}

export async function setActiveAction(form: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(form.get("id") ?? "").trim();
  const active = String(form.get("active") ?? "false") === "true";
  if (!id) bouncedErr("missing id");
  await setMemberActive(id, active);
  await logAudit({
    actor: userLabel(actor),
    entity_type: "user",
    entity_id: id,
    action: active ? "reactivate_user" : "deactivate_user",
    detail: active ? "reactivated" : "deactivated",
  });
  revalidatePath("/admin");
}

export async function deleteUserAction(form: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(form.get("id") ?? "").trim();
  if (!id) bouncedErr("missing id");
  // Defense-in-depth: protect the two founders from accidental hard-delete
  // even if the UI doesn't render the button for them. Deactivate instead.
  // Founders are identified by legacy_owner zaal/iman - we still need to
  // read the row to know, so call deleteTeamMember which validates on the
  // DB side. For now, just hard-delete - the UI only shows this button for
  // non-founder rows. Future: add a server-side founder check.
  await deleteTeamMember(id);
  await logAudit({
    actor: userLabel(actor),
    entity_type: "user",
    entity_id: id,
    action: "delete_user",
    detail: "hard delete",
  });
  revalidatePath("/admin");
}

// ============================================================================
// Brand list management (Phase D)
// ============================================================================

const BRAND_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 .&'+\-]{0,40}$/;
const BRAND_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,30}$/;

function parseSlugs(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function revalidateAllSurfaces() {
  // Brand list lives in NavBar + Board + filter dropdowns - every page
  // header rerenders when a brand is added so the new tab/option shows up.
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/chat");
}

export async function addBrandAction(form: FormData): Promise<void> {
  const actor = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const slugsRaw = String(form.get("slugs") ?? "").trim();
  const color = String(form.get("color") ?? "").trim();
  const sortRaw = String(form.get("sort_order") ?? "100").trim();

  if (!BRAND_NAME_RE.test(name)) bouncedErr("invalid brand name");
  const slugs = parseSlugs(slugsRaw);
  for (const s of slugs) {
    if (!BRAND_SLUG_RE.test(s)) bouncedErr(`invalid slug: ${s}`);
  }
  const sort_order = Number(sortRaw);
  if (!Number.isFinite(sort_order)) bouncedErr("sort_order must be a number");

  const added = await addBrand({
    name,
    slugs,
    color: color || "bg-white/10 text-white/70 border-white/20",
    sort_order,
    created_by: userLabel(actor),
  });
  await logAudit({
    actor: userLabel(actor),
    entity_type: "brand",
    entity_id: added.id,
    entity_label: name,
    action: "add_brand",
    detail: `slugs=[${slugs.join(", ")}], sort=${sort_order}`,
    metadata: { slugs, sort_order, color: added.color },
  });
  revalidateAllSurfaces();
}

export async function updateBrandAction(form: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(form.get("id") ?? "").trim();
  if (!id) bouncedErr("missing id");
  if (id.startsWith("const-")) bouncedErr("seeded const brands can't be edited until the 002 migration is applied");

  const patch: {
    name?: string;
    slugs?: string[];
    color?: string;
    sort_order?: number;
    active?: boolean;
  } = {};
  const nameRaw = form.get("name");
  if (nameRaw !== null) {
    const name = String(nameRaw).trim();
    if (!BRAND_NAME_RE.test(name)) bouncedErr("invalid brand name");
    patch.name = name;
  }
  const slugsRaw = form.get("slugs");
  if (slugsRaw !== null) {
    const slugs = parseSlugs(String(slugsRaw));
    for (const s of slugs) {
      if (!BRAND_SLUG_RE.test(s)) bouncedErr(`invalid slug: ${s}`);
    }
    patch.slugs = slugs;
  }
  const colorRaw = form.get("color");
  if (colorRaw !== null) patch.color = String(colorRaw).trim();
  const sortRaw = form.get("sort_order");
  if (sortRaw !== null) {
    const n = Number(String(sortRaw).trim());
    if (!Number.isFinite(n)) bouncedErr("sort_order must be a number");
    patch.sort_order = n;
  }
  const activeRaw = form.get("active");
  if (activeRaw !== null) patch.active = String(activeRaw) === "true";

  if (Object.keys(patch).length === 0) return;
  await updateBrand(id, patch);
  await logAudit({
    actor: userLabel(actor),
    entity_type: "brand",
    entity_id: id,
    entity_label: patch.name ?? null,
    action: "update_brand",
    detail: Object.entries(patch).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : v}`).join("; "),
    metadata: patch,
  });
  revalidateAllSurfaces();
}

export async function deleteBrandAction(form: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(form.get("id") ?? "").trim();
  if (!id) bouncedErr("missing id");
  if (id.startsWith("const-")) bouncedErr("seeded const brands can't be deleted until the 002 migration is applied");
  await deleteBrand(id);
  await logAudit({
    actor: userLabel(actor),
    entity_type: "brand",
    entity_id: id,
    action: "delete_brand",
    detail: "hard delete",
  });
  revalidateAllSurfaces();
}

// ============================================================================
// Projects (doc 765 Phase I)
// ============================================================================

const PROJECT_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

function asProjectStatus(v: FormDataEntryValue | null): ProjectStatus {
  const s = String(v ?? "").toLowerCase();
  if (s === "active" || s === "paused" || s === "completed" || s === "cancelled") return s;
  return "active";
}

export async function addProjectAction(form: FormData): Promise<void> {
  const actor = await requireAdmin();
  const slug = String(form.get("slug") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim() || null;
  const brand_default = String(form.get("brand_default") ?? "").trim() || null;
  const target_date = String(form.get("target_date") ?? "").trim() || null;
  const color = String(form.get("color") ?? "").trim() || undefined;
  const sortRaw = String(form.get("sort_order") ?? "100").trim();

  if (!PROJECT_SLUG_RE.test(slug)) bouncedErr("invalid project slug (lowercase, alphanumeric + dashes, 2-40 chars)");
  if (!name || name.length > 80) bouncedErr("project name required, max 80 chars");
  const sort_order = Number(sortRaw);
  if (!Number.isFinite(sort_order)) bouncedErr("sort_order must be numeric");
  if (target_date && !/^\d{4}-\d{2}-\d{2}$/.test(target_date)) bouncedErr("target_date must be YYYY-MM-DD");

  const newProject: NewProject = {
    slug,
    name,
    description,
    brand_default,
    target_date,
    color,
    sort_order,
    created_by: userLabel(actor),
  };
  const created = await createProject(newProject);

  await logAudit({
    actor: userLabel(actor),
    entity_type: "system",
    entity_id: created.id,
    entity_label: name,
    action: "add_project",
    detail: `slug=${slug}${brand_default ? `, brand=${brand_default}` : ""}${target_date ? `, target=${target_date}` : ""}`,
    metadata: { slug, brand_default, target_date },
  });
  revalidateAllSurfaces();
  revalidatePath("/admin/projects");
}

export async function updateProjectAction(form: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(form.get("id") ?? "").trim();
  if (!id) bouncedErr("missing id");

  const patch: {
    name?: string;
    description?: string | null;
    status?: ProjectStatus;
    brand_default?: string | null;
    target_date?: string | null;
    color?: string;
    sort_order?: number;
  } = {};

  const nameRaw = form.get("name");
  if (nameRaw !== null) {
    const name = String(nameRaw).trim();
    if (!name || name.length > 80) bouncedErr("project name required, max 80 chars");
    patch.name = name;
  }
  const descRaw = form.get("description");
  if (descRaw !== null) patch.description = String(descRaw).trim() || null;
  const statusRaw = form.get("status");
  if (statusRaw !== null) patch.status = asProjectStatus(statusRaw);
  const brandRaw = form.get("brand_default");
  if (brandRaw !== null) patch.brand_default = String(brandRaw).trim() || null;
  const targetRaw = form.get("target_date");
  if (targetRaw !== null) {
    const td = String(targetRaw).trim();
    if (td && !/^\d{4}-\d{2}-\d{2}$/.test(td)) bouncedErr("target_date must be YYYY-MM-DD");
    patch.target_date = td || null;
  }
  const colorRaw = form.get("color");
  if (colorRaw !== null) patch.color = String(colorRaw).trim() || "bg-white/10 text-white/70 border-white/20";
  const sortRaw = form.get("sort_order");
  if (sortRaw !== null) {
    const sort_order = Number(String(sortRaw).trim());
    if (!Number.isFinite(sort_order)) bouncedErr("sort_order must be numeric");
    patch.sort_order = sort_order;
  }

  if (Object.keys(patch).length === 0) return;
  await updateProject(id, patch, userLabel(actor));

  await logAudit({
    actor: userLabel(actor),
    entity_type: "system",
    entity_id: id,
    entity_label: patch.name ?? null,
    action: "update_project",
    detail: Object.entries(patch)
      .map(([k, v]) => `${k}=${v === null ? "null" : v}`)
      .join("; "),
    metadata: patch as Record<string, unknown>,
  });
  revalidateAllSurfaces();
  revalidatePath("/admin/projects");
}

export async function deleteProjectAction(form: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(form.get("id") ?? "").trim();
  if (!id) bouncedErr("missing id");
  await deleteProject(id);
  await logAudit({
    actor: userLabel(actor),
    entity_type: "system",
    entity_id: id,
    action: "delete_project",
    detail: "hard delete - tasks unparented via ON DELETE SET NULL",
  });
  revalidateAllSurfaces();
  revalidatePath("/admin/projects");
}
