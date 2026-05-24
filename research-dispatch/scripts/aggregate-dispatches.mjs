#!/usr/bin/env node

/**
 * aggregate-dispatches.mjs
 *
 * Reads /tmp/zabal-dispatch-*.md files from research subagent runs,
 * extracts BONFIRE_ENTITIES + BONFIRE_EDGES JSON blocks,
 * normalizes to data/bonfire-graph.json schema (id + labels + attributes),
 * dedupes against existing graph, writes merged result back.
 *
 * Usage:
 *   node scripts/aggregate-dispatches.mjs
 *   node scripts/aggregate-dispatches.mjs --dry        # print stats, no write
 *   DISPATCH_GLOB=/tmp/zabal-dispatch-*.md node scripts/aggregate-dispatches.mjs
 *
 * Normalization rules:
 *   - id    = slug(name) using lowercase + non-alphanum -> "-"
 *   - labels: prefer existing `labels` array; else wrap `type` string in array
 *   - attributes: prefer existing `attributes`; else use `properties`
 *   - edges from/to: resolve name -> id via the entity name map
 *
 * Dedupe: entity name is the merge key. First entity wins; later runs add new
 * attributes only when the existing entry lacks them (no overwrite).
 * Edge dedupe key: from+to+type (skip exact duplicates).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'fs/promises'; // node 22+; falls back to manual below

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
// In zaocowork the graph file lives in the SEPARATE zabalgames repo clone.
// Set ZABALGAMES_REPO_PATH on the VPS; falls back to a sibling dir for local dev.
const ZABALGAMES_REPO_PATH = process.env.ZABALGAMES_REPO_PATH
  || path.resolve(REPO_ROOT, '..', 'zabalgames');
const GRAPH_PATH = process.env.GRAPH_PATH
  || path.join(ZABALGAMES_REPO_PATH, 'data', 'bonfire-graph.json');
const DISPATCH_GLOB = process.env.DISPATCH_GLOB || '/tmp';
const DISPATCH_PREFIX = 'zabal-dispatch-';
const DRY = process.argv.includes('--dry');
const PFX = '[aggregate]';

function log(msg) { console.log(`${PFX} ${msg}`); }
function err(msg) { console.error(`${PFX} ERROR: ${msg}`); }

function slug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function extractJsonBlocks(markdown, blockName) {
  // Match: ## BLOCK_NAME ... ```json ... ```
  // We look for a heading or label followed by the next json fence.
  const out = [];
  const lines = markdown.split('\n');
  let inSection = false;
  let inFence = false;
  let buf = [];

  for (const line of lines) {
    if (!inSection) {
      if (line.trim().startsWith(`## ${blockName}`) || line.trim() === `## ${blockName}`) {
        inSection = true;
      }
      continue;
    }
    // We're in the section. Stop when we hit the next ## heading.
    if (!inFence && line.startsWith('## ') && !line.includes(blockName)) {
      break;
    }
    if (!inFence && line.trim().startsWith('```json')) {
      inFence = true;
      buf = [];
      continue;
    }
    if (inFence && line.trim().startsWith('```')) {
      out.push(buf.join('\n'));
      inFence = false;
      // Stop after the first JSON block per section.
      break;
    }
    if (inFence) buf.push(line);
  }
  return out;
}

function tryParseJson(text, sourceLabel) {
  try { return JSON.parse(text); }
  catch (e) {
    err(`JSON parse failed in ${sourceLabel}: ${e.message}`);
    return null;
  }
}

function normalizeEntity(raw, source) {
  const name = raw.name;
  if (!name) return null;
  const id = raw.id || slug(name);
  const labels = Array.isArray(raw.labels)
    ? raw.labels
    : (raw.type ? [raw.type] : []);
  const attributes = raw.attributes || raw.properties || {};
  // Tag source for traceability.
  if (!attributes._source) attributes._source = source;
  return { id, name, labels, attributes };
}

function normalizeEdge(raw, nameToId) {
  const fromKey = raw.from;
  const toKey = raw.to;
  if (!fromKey || !toKey || !raw.type) return null;
  // Resolve: if value is an entity NAME (matches our map), use the mapped id.
  // Otherwise assume it's already an id.
  const from = nameToId[fromKey] || slug(fromKey);
  const to = nameToId[toKey] || slug(toKey);
  return {
    from,
    to,
    type: raw.type,
    properties: raw.properties || {},
  };
}

async function listDispatchFiles() {
  // Manual glob: list /tmp and filter by prefix.
  if (DISPATCH_GLOB.startsWith('/')) {
    const dir = DISPATCH_GLOB.replace(/\/$/, '');
    let entries;
    try { entries = fs.readdirSync(dir); }
    catch (e) { err(`Cannot list ${dir}: ${e.message}`); return []; }
    return entries
      .filter(n => n.startsWith(DISPATCH_PREFIX) && n.endsWith('.md'))
      .map(n => path.join(dir, n))
      .sort();
  }
  return [];
}

async function main() {
  log(`Reading existing graph: ${GRAPH_PATH}`);
  let graph;
  try {
    graph = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  } catch (e) {
    log(`No existing graph (${e.message}). Starting fresh.`);
    graph = { entities: [], edges: [] };
  }

  // Index existing entities by name (case-insensitive) and id.
  const nameToId = {};
  const idSet = new Set();
  const edgeKeys = new Set();

  for (const ent of graph.entities) {
    nameToId[ent.name] = ent.id;
    nameToId[ent.name.toLowerCase()] = ent.id;
    idSet.add(ent.id);
  }
  for (const e of graph.edges) {
    edgeKeys.add(`${e.from}|${e.type}|${e.to}`);
  }

  const dispatchFiles = await listDispatchFiles();
  log(`Found ${dispatchFiles.length} dispatch report(s)`);
  if (dispatchFiles.length === 0) {
    err('No dispatch files found. Set DISPATCH_GLOB or place reports at /tmp/zabal-dispatch-*.md');
    process.exit(1);
  }

  let addedEntities = 0;
  let mergedAttrs = 0;
  let addedEdges = 0;
  let skippedEdges = 0;

  // First pass: collect entities (so edges can resolve names from later docs).
  const pendingEntities = []; // {entity, source}
  const pendingEdges = [];    // {edge, source}

  for (const file of dispatchFiles) {
    const md = fs.readFileSync(file, 'utf8');
    const source = path.basename(file).replace(/\.md$/, '');

    const entityBlocks = extractJsonBlocks(md, 'BONFIRE_ENTITIES');
    const edgeBlocks = extractJsonBlocks(md, 'BONFIRE_EDGES');

    for (const block of entityBlocks) {
      const arr = tryParseJson(block, source);
      if (!Array.isArray(arr)) continue;
      for (const raw of arr) {
        const norm = normalizeEntity(raw, source);
        if (norm) pendingEntities.push({ entity: norm, source });
      }
    }
    for (const block of edgeBlocks) {
      const arr = tryParseJson(block, source);
      if (!Array.isArray(arr)) continue;
      for (const raw of arr) pendingEdges.push({ raw, source });
    }
  }

  log(`Parsed ${pendingEntities.length} entity rows + ${pendingEdges.length} edge rows from dispatches`);

  // Merge entities.
  for (const { entity, source } of pendingEntities) {
    const existing = graph.entities.find(e => e.name === entity.name)
      || (nameToId[entity.name] ? graph.entities.find(e => e.id === nameToId[entity.name]) : null);

    if (!existing) {
      // Ensure id is unique.
      let id = entity.id;
      let n = 2;
      while (idSet.has(id)) { id = `${entity.id}-${n++}`; }
      entity.id = id;
      graph.entities.push(entity);
      idSet.add(id);
      nameToId[entity.name] = id;
      nameToId[entity.name.toLowerCase()] = id;
      addedEntities++;
    } else {
      // Fill in missing attrs only; don't overwrite.
      for (const k of Object.keys(entity.attributes || {})) {
        if (k === '_source') continue;
        if (!(k in (existing.attributes || {}))) {
          existing.attributes = existing.attributes || {};
          existing.attributes[k] = entity.attributes[k];
          mergedAttrs++;
        }
      }
      // Add new labels.
      const haveLabels = new Set(existing.labels || []);
      for (const l of entity.labels) {
        if (!haveLabels.has(l)) {
          existing.labels = [...(existing.labels || []), l];
          haveLabels.add(l);
        }
      }
    }
  }

  // Second pass: resolve + add edges.
  for (const { raw, source } of pendingEdges) {
    const norm = normalizeEdge(raw, nameToId);
    if (!norm) continue;
    const key = `${norm.from}|${norm.type}|${norm.to}`;
    if (edgeKeys.has(key)) { skippedEdges++; continue; }
    if (!norm.properties._source) norm.properties._source = source;
    graph.edges.push(norm);
    edgeKeys.add(key);
    addedEdges++;
  }

  log(`Result: +${addedEntities} entities, +${mergedAttrs} attrs merged, +${addedEdges} edges (skipped ${skippedEdges} dup)`);
  log(`Totals: ${graph.entities.length} entities, ${graph.edges.length} edges`);

  if (DRY) {
    log('Dry run; not writing.');
    return;
  }

  fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2) + '\n', 'utf8');
  log(`Wrote ${GRAPH_PATH}`);
}

main().catch(e => { err(e.stack || e.message); process.exit(1); });
