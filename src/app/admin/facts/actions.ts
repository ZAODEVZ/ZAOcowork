"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { writeFactToGitHub } from "@/lib/facts-repo";

// Shape checks for the facts whose format matters mechanically (an address
// or date substituted into a paper wrong is worse than a rejected save).
// WEEK_COUNT has no entry - its own description says it's deliberately
// freeform ("100+", "104", etc) so any non-empty value is valid.
const VALIDATORS: Record<string, { pattern: RegExp; hint: string }> = {
  OG_RESPECT_CONTRACT: { pattern: /^0x[a-fA-F0-9]{40}$/, hint: "must be a 0x-prefixed 40-hex-char address" },
  ZOR_RESPECT_CONTRACT: { pattern: /^0x[a-fA-F0-9]{40}$/, hint: "must be a 0x-prefixed 40-hex-char address" },
  OG_HOLDER_COUNT: { pattern: /^\d+$/, hint: "must be a whole number" },
  OG_HOLDER_ASOF_DATE: { pattern: /^\d{4}-\d{2}-\d{2}$/, hint: "must be YYYY-MM-DD" },
  WAVEWARZ_RETENTION_PCT: { pattern: /^\d+(\.\d+)?$/, hint: "must be a plain number, e.g. 98.5" },
};

export async function updateFactAction(form: FormData): Promise<void> {
  await requireAdmin();
  const key = String(form.get("key") ?? "").trim();
  const value = String(form.get("value") ?? "").trim();

  if (!key) throw new Error("missing fact key");
  if (!value) throw new Error("value can't be empty");

  const validator = VALIDATORS[key];
  if (validator && !validator.pattern.test(value)) {
    throw new Error(`Invalid value for ${key}: ${validator.hint}`);
  }

  await writeFactToGitHub(key, value);
  revalidatePath("/admin/facts");
}
