#!/usr/bin/env node

/**
 * push-to-bonfire.mjs
 *
 * Reads data/bonfire-graph.json (entities + edges) and pushes to ZABAL Bonfire.
 *
 * Usage:
 *   export BONFIRE_API_KEY="<bearer-token>"
 *   export BONFIRE_ID="69ef871f0d22ed7e6f2b243a"
 *   node scripts/push-to-bonfire.mjs
 *
 * Environment Variables:
 *   BONFIRE_API_KEY     Bearer token (required, exit 1 if missing)
 *   BONFIRE_ID          Bonfire ID (optional, defaults to 69ef871f0d22ed7e6f2b243a)
 *   BONFIRE_API_URL     API base URL (optional, defaults to https://tnt-v2.api.bonfires.ai)
 *
 * Data Format (data/bonfire-graph.json):
 *   {
 *     "entities": [
 *       { "id": "e1", "name": "Entity Name", "labels": ["Type1", "Type2"], "attributes": {...} },
 *       ...
 *     ],
 *     "edges": [
 *       { "from": "e1", "to": "e2", "type": "REL_TYPE", "properties": {...} },
 *       ...
 *     ]
 *   }
 *
 * Rate Limiting: 250ms delay between HTTP calls for politeness.
 * Deduplication: If entity name already exists in graph, logs "EXISTS: <name>" and skips.
 * Exit Codes: 0 on success, 1 on fatal error.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREFIX = '[bonfire-push]';
const RATE_LIMIT_MS = 250;
const API_URL = process.env.BONFIRE_API_URL || 'https://tnt-v2.api.bonfires.ai';
const BONFIRE_ID = process.env.BONFIRE_ID || '69ef871f0d22ed7e6f2b243a';
const API_KEY = process.env.BONFIRE_API_KEY;

if (!API_KEY) {
  console.error(`${PREFIX} FATAL: BONFIRE_API_KEY env var not set`);
  process.exit(1);
}

function log(msg) {
  console.log(`${PREFIX} ${msg}`);
}

function logError(msg) {
  console.error(`${PREFIX} ERROR: ${msg}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function httpPost(endpoint, payload) {
  const url = `${API_URL}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    return {
      status: res.status,
      ok: res.ok,
      data,
      text,
    };
  } catch (err) {
    throw new Error(`Network error: ${err.message}`);
  }
}

async function pushEntity(entity) {
  const { id, name, labels, attributes } = entity;

  const payload = {
    name,
    labels: labels || [],
    attributes: attributes || {},
  };

  try {
    const res = await httpPost('/kg/entities', payload);

    if (res.ok) {
      const responseId = res.data?.id || res.data?.uuid || id;
      log(`CREATE ${name} (${responseId})`);
      return { success: true, id: responseId, originalId: id };
    } else if (res.status === 409) {
      log(`EXISTS ${name}`);
      return { success: true, id, originalId: id, existed: true };
    } else {
      logError(`Entity ${name}: HTTP ${res.status} - ${res.text || res.data?.error || 'unknown error'}`);
      return { success: false, id, originalId: id };
    }
  } catch (err) {
    logError(`Entity ${name}: ${err.message}`);
    return { success: false, id, originalId: id };
  }
}

async function pushEdge(edge, entityMap) {
  const { from, to, type, properties } = edge;

  const fromId = entityMap[from] || from;
  const toId = entityMap[to] || to;

  const payload = {
    source_uuid: fromId,
    target_uuid: toId,
    name: type,
    fact: properties?.fact || `${fromId} ${type} ${toId}`,
    ...properties,
  };

  try {
    const res = await httpPost('/kg/edges', payload);

    if (res.ok) {
      log(`EDGE ${from} -[${type}]-> ${to}`);
      return { success: true };
    } else if (res.status === 409) {
      log(`EDGE_EXISTS ${from} -[${type}]-> ${to}`);
      return { success: true, existed: true };
    } else {
      logError(`Edge ${from} -> ${to}: HTTP ${res.status} - ${res.text || res.data?.error || 'unknown error'}`);
      return { success: false };
    }
  } catch (err) {
    logError(`Edge ${from} -> ${to}: ${err.message}`);
    return { success: false };
  }
}

async function main() {
  // In zaocowork the graph lives in the SEPARATE zabalgames repo clone.
  // Set ZABALGAMES_REPO_PATH or GRAPH_PATH explicitly.
  const ZABALGAMES_REPO_PATH = process.env.ZABALGAMES_REPO_PATH
    || path.resolve(__dirname, '..', '..', 'zabalgames');
  const graphPath = process.env.GRAPH_PATH
    || path.join(ZABALGAMES_REPO_PATH, 'data', 'bonfire-graph.json');

  log(`Reading graph from ${graphPath}`);
  let graphData;
  try {
    const raw = fs.readFileSync(graphPath, 'utf8');
    graphData = JSON.parse(raw);
  } catch (err) {
    logError(`Failed to read/parse ${graphPath}: ${err.message}`);
    process.exit(1);
  }

  const { entities = [], edges = [] } = graphData;

  log(`Parsed ${entities.length} entities, ${edges.length} edges`);

  if (entities.length === 0 && edges.length === 0) {
    log('No entities or edges to push. Done.');
    process.exit(0);
  }

  const entityMap = {};
  let entitySuccessCount = 0;
  let entityFailCount = 0;

  log('Pushing entities...');
  for (const entity of entities) {
    const result = await pushEntity(entity);
    if (result.success) {
      entitySuccessCount++;
      if (result.id) {
        entityMap[result.originalId] = result.id;
      }
    } else {
      entityFailCount++;
    }
    await sleep(RATE_LIMIT_MS);
  }

  log(`Entities: ${entitySuccessCount} success, ${entityFailCount} failed`);

  let edgeSuccessCount = 0;
  let edgeFailCount = 0;

  log('Pushing edges...');
  for (const edge of edges) {
    const result = await pushEdge(edge, entityMap);
    if (result.success) {
      edgeSuccessCount++;
    } else {
      edgeFailCount++;
    }
    await sleep(RATE_LIMIT_MS);
  }

  log(`Edges: ${edgeSuccessCount} success, ${edgeFailCount} failed`);

  const totalFailed = entityFailCount + edgeFailCount;
  if (totalFailed > 0) {
    log(`Finished with ${totalFailed} failures.`);
    process.exit(1);
  } else {
    log('All entities and edges pushed successfully.');
    process.exit(0);
  }
}

main().catch(err => {
  logError(`Unhandled error: ${err.message}`);
  process.exit(1);
});
