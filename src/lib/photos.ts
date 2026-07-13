// Photos data layer — read-only and write operations over the `photos`
// table plus the `photos` Storage bucket. Server-only (uses the service-role
// client). See docs/superpowers/specs/2026-07-13-photo-dashboard-design.md.

import { serviceClient } from "@/lib/supabase-server";

export type PhotoStatus = "draft" | "ready" | "posted";
export type QuestionStatus = "none" | "received" | "scheduled" | "answered";

export interface Photo {
  id: string;
  storagePath: string;
  caption: string;
  credit: string | null;
  event: string | null;
  photoDate: string | null;
  priceUsd: number;
  status: PhotoStatus;
  fotocasterUrl: string | null;
  collected: boolean;
  collectorHandle: string | null;
  question: string | null;
  questionStatus: QuestionStatus;
  livestreamTime: string | null;
  livestreamUrl: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PhotoRow {
  id: string;
  storage_path: string;
  caption: string;
  credit: string | null;
  event: string | null;
  photo_date: string | null;
  price_usd: string | number;
  status: PhotoStatus;
  fotocaster_url: string | null;
  collected: boolean;
  collector_handle: string | null;
  question: string | null;
  question_status: QuestionStatus;
  livestream_time: string | null;
  livestream_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToPhoto(r: PhotoRow): Photo {
  return {
    id: r.id,
    storagePath: r.storage_path,
    caption: r.caption,
    credit: r.credit,
    event: r.event,
    photoDate: r.photo_date,
    priceUsd: Number(r.price_usd),
    status: r.status,
    fotocasterUrl: r.fotocaster_url,
    collected: r.collected,
    collectorHandle: r.collector_handle,
    question: r.question,
    questionStatus: r.question_status,
    livestreamTime: r.livestream_time,
    livestreamUrl: r.livestream_url,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listPhotos(): Promise<Photo[]> {
  const { data, error } = await serviceClient()
    .from("photos")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as PhotoRow[]).map(rowToPhoto);
}

export async function getPhoto(id: string): Promise<Photo | null> {
  const { data, error } = await serviceClient().from("photos").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? rowToPhoto(data as PhotoRow) : null;
}

export interface CreatePhotoInput {
  storagePath: string;
  caption: string;
  credit?: string;
  event?: string;
  photoDate?: string;
  priceUsd?: number;
  createdBy?: string;
}

export async function createPhoto(input: CreatePhotoInput): Promise<Photo> {
  const { data, error } = await serviceClient()
    .from("photos")
    .insert({
      storage_path: input.storagePath,
      caption: input.caption,
      credit: input.credit || null,
      event: input.event || null,
      photo_date: input.photoDate || null,
      price_usd: input.priceUsd ?? 5.0,
      created_by: input.createdBy || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToPhoto(data as PhotoRow);
}

export interface UpdatePhotoInput {
  status?: PhotoStatus;
  fotocasterUrl?: string | null;
  collected?: boolean;
  collectorHandle?: string | null;
  question?: string | null;
  questionStatus?: QuestionStatus;
  livestreamTime?: string | null;
  livestreamUrl?: string | null;
}

export async function updatePhoto(id: string, input: UpdatePhotoInput): Promise<Photo> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.status !== undefined) patch.status = input.status;
  if (input.fotocasterUrl !== undefined) patch.fotocaster_url = input.fotocasterUrl;
  if (input.collected !== undefined) patch.collected = input.collected;
  if (input.collectorHandle !== undefined) patch.collector_handle = input.collectorHandle;
  if (input.question !== undefined) patch.question = input.question;
  if (input.questionStatus !== undefined) patch.question_status = input.questionStatus;
  if (input.livestreamTime !== undefined) patch.livestream_time = input.livestreamTime;
  if (input.livestreamUrl !== undefined) patch.livestream_url = input.livestreamUrl;

  const { data, error } = await serviceClient().from("photos").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return rowToPhoto(data as PhotoRow);
}

export async function uploadPhotoFile(file: File, storagePath: string): Promise<void> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await serviceClient()
    .storage.from("photos")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });
  if (error) throw error;
}

export async function getPhotoSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await serviceClient()
    .storage.from("photos")
    .createSignedUrl(storagePath, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}
