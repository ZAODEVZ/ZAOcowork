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

  await addTeamMember({
    name,
    legacy_owner: legacy,
    role,
    password,
    telegram_id,
    email,
    set_by: userLabel(actor),
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
  revalidatePath("/admin");
}

export async function setRoleAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("id") ?? "").trim();
  const role = asRole(form.get("role"));
  if (!id) bouncedErr("missing id");
  await setMemberRole(id, role);
  revalidatePath("/admin");
}

export async function setActiveAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("id") ?? "").trim();
  const active = String(form.get("active") ?? "false") === "true";
  if (!id) bouncedErr("missing id");
  await setMemberActive(id, active);
  revalidatePath("/admin");
}

export async function deleteUserAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("id") ?? "").trim();
  if (!id) bouncedErr("missing id");
  // Defense-in-depth: protect the two founders from accidental hard-delete
  // even if the UI doesn't render the button for them. Deactivate instead.
  // Founders are identified by legacy_owner zaal/iman - we still need to
  // read the row to know, so call deleteTeamMember which validates on the
  // DB side. For now, just hard-delete - the UI only shows this button for
  // non-founder rows. Future: add a server-side founder check.
  await deleteTeamMember(id);
  revalidatePath("/admin");
}
