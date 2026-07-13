"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSession, isLead, isAdmin } from "@/lib/auth";
import { createPhoto, updatePhoto, uploadPhotoFile, deletePhotoFile, type QuestionStatus } from "@/lib/photos";
import { logAudit } from "@/lib/audit";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function s(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

async function requireLead(user: string): Promise<void> {
  if (isLead(user)) return;
  if (await isAdmin(user)) return;
  throw new Error("not authorized");
}

export async function uploadPhotoAction(form: FormData): Promise<void> {
  const user = await requireSession();
  await requireLead(user);

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("a photo file is required");
  if (file.size > MAX_FILE_SIZE) throw new Error("photo is too large (max 25MB)");
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("unsupported file type - use JPEG, PNG, WebP, or GIF");
  const caption = s(form, "caption");
  if (!caption) throw new Error("caption is required");

  const ext = file.name.split(".").pop() || "jpg";
  const storagePath = `${randomUUID()}.${ext}`;
  await uploadPhotoFile(file, storagePath);

  const priceRaw = s(form, "priceUsd");
  let photo;
  try {
    photo = await createPhoto({
      storagePath,
      caption,
      credit: s(form, "credit") || undefined,
      event: s(form, "event") || undefined,
      photoDate: s(form, "photoDate") || undefined,
      priceUsd: priceRaw ? Number(priceRaw) : undefined,
      createdBy: user,
    });
  } catch (error) {
    await deletePhotoFile(storagePath).catch(() => {});
    throw error;
  }

  await logAudit({
    actor: user,
    entity_type: "system",
    entity_id: photo.id,
    entity_label: caption,
    action: "create_photo",
  });
  revalidatePath("/photos");
}

export async function setPhotoStatusAction(form: FormData): Promise<void> {
  const user = await requireSession();
  await requireLead(user);

  const id = s(form, "id");
  const status = s(form, "status");
  if (!id) throw new Error("missing id");
  if (!["draft", "ready", "posted"].includes(status)) throw new Error("bad status");

  const fotocasterUrl = status === "posted" ? s(form, "fotocasterUrl") || null : undefined;
  await updatePhoto(id, { status: status as "draft" | "ready" | "posted", fotocasterUrl });

  await logAudit({ actor: user, entity_type: "system", entity_id: id, action: "set_photo_status", detail: status });
  revalidatePath("/photos");
}

export async function logPhotoCollectorAction(form: FormData): Promise<void> {
  const user = await requireSession();
  await requireLead(user);

  const id = s(form, "id");
  if (!id) throw new Error("missing id");

  await updatePhoto(id, {
    collected: true,
    collectorHandle: s(form, "collectorHandle") || null,
  });

  await logAudit({ actor: user, entity_type: "system", entity_id: id, action: "log_photo_collector" });
  revalidatePath("/photos");
}

export async function logPhotoQuestionAction(form: FormData): Promise<void> {
  const user = await requireSession();
  await requireLead(user);

  const id = s(form, "id");
  const questionStatus = s(form, "questionStatus");
  if (!id) throw new Error("missing id");
  if (!["none", "received", "scheduled", "answered"].includes(questionStatus)) {
    throw new Error("bad question status");
  }

  await updatePhoto(id, {
    question: s(form, "question") || null,
    questionStatus: questionStatus as QuestionStatus,
    livestreamTime: s(form, "livestreamTime") || null,
    livestreamUrl: s(form, "livestreamUrl") || null,
  });

  await logAudit({ actor: user, entity_type: "system", entity_id: id, action: "log_photo_question" });
  revalidatePath("/photos");
}
