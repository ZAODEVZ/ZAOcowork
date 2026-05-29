#!/usr/bin/env node
// One-shot, INSERT-ONLY importer for data/actions.json -> Supabase `tasks` table.
//
// Why this exists: src/lib/data.ts moved the board to Supabase (doc 692), so
// data/actions.json is no longer read by the app. Cards added to the json
// (e.g. the 2026-05-29 Leeward + batch-2 epics) must be inserted into the live
// table to show up. saveActions() is NOT safe for this: it diffs against the
// whole table and would UPDATE/DELETE live rows. This script only INSERTs.
//
// Safety properties:
//   * Never updates an existing row. Never deletes anything.
//   * legacy_id is globally UNIQUE in the table. We read existing legacy_ids
//     first; collisions are SKIPPED by default (--on-collision=renumber to
//     instead append them at the current max numeric id).
//   * Dry-run by default. Nothing is written without --commit.
//
// Usage (run where SUPABASE_URL + SUPABASE_SERVICE_KEY are set):
//   npm ci
//   node scripts/import-actions.mjs                 # dry run, from id 19
//   node scripts/import-actions.mjs --from=19       # only ids >= 19
//   node scripts/import-actions.mjs --ids=19,20,49  # explicit set
//   node scripts/import-actions.mjs --commit        # actually insert
//   node scripts/import-actions.mjs --commit --on-collision=renumber

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.join(__dirname, "..", "data", "actions.json");
const LEGACY_SOURCE = "cowork-actions.json";

// ---- args ----
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (k, d) => {
  const a = args.find((x) => x.startsWith(`${k}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const COMMIT = has("--commit");
const ON_COLLISION = val("--on-collision", "skip"); // skip | renumber
const FROM = parseInt(val("--from", "19"), 10);
const IDS = val("--ids", "");
const explicitIds = IDS ? new Set(IDS.split(",").map((s) => s.trim())) : null;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY not set. Run where the creds live.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const STATUS_TO_DB = { TRIAGE: "triage", TODO: "todo", WIP: "in_progress", BLOCKED: "blocked", DONE: "done" };
const nowIso = () => new Date().toISOString();

function buildMetadata(item) {
  const m = {};
  if (item.due) m.due = item.due;
  for (const k of ["taskType", "requiresApproval", "assignedTo", "claimable", "comments", "updates", "activity"]) {
    if (item[k] !== undefined) m[k] = item[k];
  }
  for (const k of ["prUrl", "prNumber", "prState", "videoUrl"]) {
    if (item[k] !== undefined && item[k] !== null) m[k] = item[k];
  }
  return m;
}

function itemToRow(item, ownerToId, legacyId) {
  const ownerStr = String(item.owner ?? "");
  const ownerKey = ownerStr && ownerStr !== "Both" && ownerStr !== "Open" ? ownerStr.toLowerCase() : null;
  const dateDue = /^\d{4}-\d{2}-\d{2}$/.test(item.due || "");
  return {
    legacy_source: LEGACY_SOURCE,
    legacy_id: legacyId,
    kind: "task",
    project: /wavewarz/i.test(String(item.category)) ? "wavewarz" : "zaodevz",
    title: item.title,
    status: STATUS_TO_DB[item.status] ?? "todo",
    owner_id: ownerKey ? (ownerToId.get(ownerKey) ?? null) : null,
    created_by: item.createdBy ? (ownerToId.get(item.createdBy.toLowerCase()) ?? null) : null,
    completed_by: item.completedBy ? (ownerToId.get(item.completedBy.toLowerCase()) ?? null) : null,
    category: item.category || null,
    priority: item.priority || null,
    phase: item.phase || null,
    important: Boolean(item.important),
    urgent: Boolean(item.urgent),
    due: dateDue ? item.due : null,
    notes: item.notes || null,
    completed_at: item.completedAt || null,
    created_at: item.createdAt || nowIso(),
    updated_at: nowIso(),
    metadata: buildMetadata(item),
    brands: Array.isArray(item.brands) ? item.brands : [],
    service_class: item.serviceClass ?? "Standard",
    archived_at: item.archivedAt ?? null,
    project_id: item.projectId ?? null,
    source: item.source ?? "human-web",
  };
}

async function main() {
  const doc = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  const all = doc.items || [];

  // owner name -> uuid
  const { data: team, error: teErr } = await db.from("team_members").select("id, legacy_owner");
  if (teErr) throw new Error(`team_members read failed: ${teErr.message}`);
  const ownerToId = new Map();
  for (const r of team || []) if (r.legacy_owner) ownerToId.set(r.legacy_owner.toLowerCase(), r.id);

  // existing legacy_ids (global - the unique constraint is table-wide)
  const { data: existing, error: exErr } = await db.from("tasks").select("legacy_id");
  if (exErr) throw new Error(`tasks read failed: ${exErr.message}`);
  const existingIds = new Set((existing || []).map((r) => r.legacy_id).filter(Boolean));
  let maxNum = 0;
  for (const id of existingIds) {
    const n = parseInt(id, 10);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  }

  // which json items to import
  const candidates = all.filter((it) => {
    if (explicitIds) return explicitIds.has(it.id);
    const n = parseInt(it.id, 10);
    return Number.isFinite(n) && n >= FROM;
  });

  const rows = [];
  const skipped = [];
  const remapped = [];
  let nextId = maxNum;
  for (const it of candidates) {
    if (existingIds.has(it.id)) {
      if (ON_COLLISION === "renumber") {
        nextId += 1;
        const newId = String(nextId);
        remapped.push([it.id, newId, it.title]);
        rows.push(itemToRow(it, ownerToId, newId));
      } else {
        skipped.push([it.id, it.title]);
      }
    } else {
      rows.push(itemToRow(it, ownerToId, it.id));
    }
  }

  console.log(`\n=== import-actions (${COMMIT ? "COMMIT" : "DRY RUN"}) ===`);
  console.log(`json items: ${all.length} | candidates(>= ${explicitIds ? "[ids]" : FROM}): ${candidates.length}`);
  console.log(`existing legacy_ids in table: ${existingIds.size} | max numeric id: ${maxNum}`);
  console.log(`to INSERT: ${rows.length} | collisions: ${skipped.length + remapped.length} (mode=${ON_COLLISION})`);
  if (remapped.length) {
    console.log(`renumbered:`);
    for (const [o, n, t] of remapped) console.log(`   ${o} -> ${n}  ${t.slice(0, 50)}`);
  }
  if (skipped.length) {
    console.log(`skipped (legacy_id already exists - rerun with --on-collision=renumber to import anyway):`);
    for (const [id, t] of skipped) console.log(`   #${id}  ${t.slice(0, 50)}`);
  }

  if (!COMMIT) {
    console.log(`\nDRY RUN - nothing written. Re-run with --commit to insert.\n`);
    return;
  }
  if (!rows.length) {
    console.log(`\nNothing to insert.\n`);
    return;
  }
  const { error: insErr } = await db.from("tasks").insert(rows);
  if (insErr) throw new Error(`insert failed: ${insErr.message}`);
  console.log(`\nINSERTED ${rows.length} rows.\n`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
