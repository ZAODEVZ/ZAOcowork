#!/usr/bin/env node

/**
 * run-dispatch.mjs
 *
 * The orchestrator. Spawns N parallel Claude Code subprocesses, one per
 * research dimension, each with a focused prompt. Waits for all to complete,
 * then runs aggregate + push + commit.
 *
 * Usage:
 *   node scripts/run-dispatch.mjs --slug <topic-slug>
 *   node scripts/run-dispatch.mjs --next            # pop next pending topic from queue
 *   node scripts/run-dispatch.mjs --slug <slug> --dry  # show what would run, do nothing
 *
 * Env:
 *   ZABALGAMES_REPO_PATH    Path to zabalgames clone (required for commit)
 *   ZAOCOWORK_REPO_PATH     Path to this repo's clone (defaults to script's parent)
 *   BONFIRE_API_KEY         Required for push step (otherwise skipped with warning)
 *   CLAUDE_CODE_BIN         Path to claude CLI (defaults to "claude")
 *   GH_TOKEN                Required for git push (read by gh CLI)
 *   TELEGRAM_NOTIFY_CHAT_ID Optional - post progress to this chat via TELEGRAM_BOT_TOKEN
 *   TELEGRAM_BOT_TOKEN      Optional - Telegram bot token for notifications
 *   MAX_TURNS_PER_SUBAGENT  Default 40
 *   SUBAGENT_TIMEOUT_MS     Default 900000 (15 min per subagent)
 *
 * Exit codes:
 *   0 - success
 *   1 - any failure (subagent fail, aggregate fail, push fail, commit fail)
 *   2 - queue empty (only with --next)
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// REPO_ROOT here is the research-dispatch dir (sibling of agent/ inside ZAOcowork).
// Env override: RESEARCH_DISPATCH_DIR. The parent ZAOcowork repo is REPO_ROOT/..
const REPO_ROOT = process.env.RESEARCH_DISPATCH_DIR
  || process.env.ZAOCOWORK_REPO_PATH // legacy alias
  || path.resolve(__dirname, '..');
const ZAOCOWORK_REPO = path.resolve(REPO_ROOT, '..'); // parent (the ZAOcowork repo root)
const PFX = '[run-dispatch]';
const RUN_TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16); // YYYY-MM-DDTHH-mm
const RUN_DATE = new Date().toISOString().slice(0, 10).replace(/-/g, '');   // YYYYMMDD

const CLAUDE_BIN = process.env.CLAUDE_CODE_BIN || 'claude';
const MAX_TURNS = parseInt(process.env.MAX_TURNS_PER_SUBAGENT || '40', 10);
const SUBAGENT_TIMEOUT = parseInt(process.env.SUBAGENT_TIMEOUT_MS || '900000', 10);
const RUNS_DIR = path.join(REPO_ROOT, 'dispatch-runs', RUN_TS);

function log(msg) { console.log(`${PFX} ${msg}`); }
function warn(msg) { console.error(`${PFX} WARN: ${msg}`); }
function err(msg) { console.error(`${PFX} ERROR: ${msg}`); }

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { slug: null, next: false, dry: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--slug') out.slug = args[++i];
    else if (args[i] === '--next') out.next = true;
    else if (args[i] === '--dry') out.dry = true;
  }
  return out;
}

function readQueue() {
  const queuePath = path.join(REPO_ROOT, 'data', 'research-queue.json');
  if (!fs.existsSync(queuePath)) {
    err(`Queue file not found: ${queuePath}`);
    process.exit(1);
  }
  return { queuePath, data: JSON.parse(fs.readFileSync(queuePath, 'utf8')) };
}

function writeQueue(queuePath, data) {
  fs.writeFileSync(queuePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function readTemplate() {
  const templatePath = path.join(REPO_ROOT, 'prompts', 'subagent-template.md');
  return fs.readFileSync(templatePath, 'utf8');
}

function interpolate(template, vars) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(String(v));
  }
  return out;
}

function dispatchOutputPath(topicSlug, dimensionSlug) {
  return `/tmp/zabal-dispatch-${topicSlug}-${dimensionSlug}-${RUN_DATE}.md`;
}

async function notify(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_NOTIFY_CHAT_ID;
  if (!token || !chat) return;
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
    });
  } catch (e) { warn(`Telegram notify failed: ${e.message}`); }
}

function spawnSubagent({ topicSlug, dimension, prompt, logPath }) {
  return new Promise((resolve) => {
    const args = [
      '-p', prompt,
      '--allowedTools', 'Read Write Edit Bash Grep Glob WebFetch WebSearch',
      '--output-format', 'text',
      '--max-turns', String(MAX_TURNS),
    ];

    log(`SPAWN  ${topicSlug}/${dimension.slug} (timeout ${Math.floor(SUBAGENT_TIMEOUT / 1000)}s, max ${MAX_TURNS} turns)`);

    const child = spawn(CLAUDE_BIN, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const logStream = fs.createWriteStream(logPath, { flags: 'w' });
    logStream.write(`=== DIMENSION: ${dimension.name} ===\n=== SLUG: ${dimension.slug} ===\n=== STARTED: ${new Date().toISOString()} ===\n\n`);

    child.stdout.on('data', (chunk) => logStream.write(chunk));
    child.stderr.on('data', (chunk) => logStream.write(chunk));

    const timeout = setTimeout(() => {
      warn(`TIMEOUT ${topicSlug}/${dimension.slug} - killing subprocess`);
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, SUBAGENT_TIMEOUT);

    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      logStream.end(`\n=== EXIT code=${code} signal=${signal} at ${new Date().toISOString()} ===\n`);
      const outputPath = dispatchOutputPath(topicSlug, dimension.slug);
      const wrote = fs.existsSync(outputPath);
      log(`${wrote ? 'OK    ' : 'NO_OUT'} ${topicSlug}/${dimension.slug} (code=${code}, output=${wrote ? outputPath : 'MISSING'})`);
      resolve({ dimension, success: code === 0 && wrote, outputPath, wrote, exitCode: code });
    });

    child.on('error', (e) => {
      clearTimeout(timeout);
      err(`SPAWN_FAIL ${topicSlug}/${dimension.slug}: ${e.message}`);
      resolve({ dimension, success: false, outputPath: null, wrote: false, exitCode: -1 });
    });
  });
}

function runSyncCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  const args = parseArgs();
  fs.mkdirSync(RUNS_DIR, { recursive: true });

  const { queuePath, data: queue } = readQueue();

  // Resolve topic.
  let topic;
  if (args.slug) {
    topic = queue.topics.find(t => t.slug === args.slug);
    if (!topic) { err(`No topic with slug "${args.slug}" in queue`); process.exit(1); }
  } else if (args.next) {
    topic = queue.topics.find(t => t.status === 'pending');
    if (!topic) { log('Queue empty (no pending topics).'); process.exit(2); }
  } else {
    err('Usage: --slug <slug> | --next');
    process.exit(1);
  }

  log(`Topic: ${topic.name} (slug=${topic.slug})`);
  log(`Dimensions: ${topic.dimensions.length}`);
  log(`Run dir: ${RUNS_DIR}`);

  await notify(`*Dispatch start*\nTopic: \`${topic.slug}\`\nDimensions: ${topic.dimensions.length}\nRun: \`${RUN_TS}\``);

  if (args.dry) {
    log('DRY RUN - prompts that would be sent:');
    const template = readTemplate();
    for (const dim of topic.dimensions) {
      const prompt = interpolate(template, {
        TOPIC_NAME: topic.name,
        TOPIC_SLUG: topic.slug,
        DIMENSION_NAME: dim.name,
        DIMENSION_FOCUS: dim.focus,
        OUTPUT_PATH: dispatchOutputPath(topic.slug, dim.slug),
      });
      const previewPath = path.join(RUNS_DIR, `prompt-${dim.slug}.md`);
      fs.writeFileSync(previewPath, prompt, 'utf8');
      log(`  ${dim.slug}: prompt written to ${previewPath}`);
    }
    log('DRY RUN complete. No subprocesses spawned.');
    return;
  }

  // Fan out subagents.
  const template = readTemplate();
  const tasks = topic.dimensions.map(dim => {
    const prompt = interpolate(template, {
      TOPIC_NAME: topic.name,
      TOPIC_SLUG: topic.slug,
      DIMENSION_NAME: dim.name,
      DIMENSION_FOCUS: dim.focus,
      OUTPUT_PATH: dispatchOutputPath(topic.slug, dim.slug),
    });
    const logPath = path.join(RUNS_DIR, `subagent-${dim.slug}.log`);
    return spawnSubagent({ topicSlug: topic.slug, dimension: dim, prompt, logPath });
  });

  log(`Waiting for ${tasks.length} subagents...`);
  const results = await Promise.all(tasks);

  const successes = results.filter(r => r.success);
  const failures = results.filter(r => !r.success);

  log(`Subagents: ${successes.length} success, ${failures.length} failed`);
  if (failures.length > 0) {
    for (const f of failures) {
      warn(`  FAIL ${f.dimension.slug} (exit=${f.exitCode}, wrote=${f.wrote})`);
    }
  }

  if (successes.length === 0) {
    err('No subagent produced output. Aborting.');
    await notify(`*Dispatch FAIL*\nTopic: \`${topic.slug}\`\nAll ${failures.length} subagents failed. See \`${RUNS_DIR}\` for logs.`);
    process.exit(1);
  }

  // Aggregate.
  log('Aggregating...');
  try {
    await runSyncCmd(process.execPath, [path.join(REPO_ROOT, 'scripts', 'aggregate-dispatches.mjs')]);
  } catch (e) {
    err(`Aggregate failed: ${e.message}`);
    await notify(`*Dispatch FAIL*\nTopic: \`${topic.slug}\`\nAggregate step failed.`);
    process.exit(1);
  }

  // Push to live Bonfire.
  if (process.env.BONFIRE_API_KEY) {
    log('Pushing to live Bonfire...');
    try {
      await runSyncCmd(process.execPath, [path.join(REPO_ROOT, 'scripts', 'push-to-bonfire.mjs')]);
    } catch (e) {
      warn(`Bonfire push failed: ${e.message}. Continuing with commit.`);
    }
  } else {
    warn('BONFIRE_API_KEY not set - skipping live push. Graph file still updated locally.');
  }

  // Commit + push to zabalgames.
  const zgPath = process.env.ZABALGAMES_REPO_PATH;
  if (!zgPath) {
    warn('ZABALGAMES_REPO_PATH not set - skipping commit step. Graph file updated locally only.');
  } else {
    log(`Committing to ${zgPath}...`);
    try {
      await runSyncCmd('git', ['-C', zgPath, 'add', 'data/bonfire-graph.json'], {});
      // Check if there's anything to commit.
      const diff = spawn('git', ['-C', zgPath, 'diff', '--cached', '--quiet']);
      const hasChanges = await new Promise((res) => {
        diff.on('exit', (code) => res(code !== 0));
      });
      if (hasChanges) {
        const msg = `feat(bonfire): autonomous dispatch - ${topic.slug}

Topic: ${topic.name}
Dimensions: ${successes.map(s => s.dimension.slug).join(', ')}
Subagent failures: ${failures.length}
Run: ${RUN_TS} (zaocowork)
Trigger: ${process.env.DISPATCH_TRIGGER || 'manual'}

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`;
        await runSyncCmd('git', ['-C', zgPath, 'commit', '-m', msg]);
        await runSyncCmd('git', ['-C', zgPath, 'push', 'origin', 'main']);
        log('Pushed to zabalgames main.');
      } else {
        log('No changes in zabalgames - nothing to commit (graph already up to date).');
      }
    } catch (e) {
      err(`zabalgames commit/push failed: ${e.message}`);
    }
  }

  // Mark queue item done + commit zaocowork.
  topic.status = 'done';
  topic.last_run = new Date().toISOString();
  topic.last_run_dispatches = successes.map(s => s.dimension.slug);
  if (!topic.history) topic.history = [];
  topic.history.push({ run: RUN_TS, successes: successes.length, failures: failures.length });
  writeQueue(queuePath, queue);

  log(`Queue updated: ${topic.slug} marked done.`);

  // Commit ZAOcowork too (queue file is inside research-dispatch/ subdir of the parent repo).
  try {
    await runSyncCmd('git', ['-C', ZAOCOWORK_REPO, 'add', 'research-dispatch/data/research-queue.json']);
    await runSyncCmd('git', ['-C', ZAOCOWORK_REPO, 'commit', '-m', `chore(queue): mark ${topic.slug} done (run ${RUN_TS})`]);
    await runSyncCmd('git', ['-C', ZAOCOWORK_REPO, 'push', 'origin', 'main']);
  } catch (e) {
    warn(`ZAOcowork queue commit failed: ${e.message}`);
  }

  await notify(`*Dispatch DONE*\nTopic: \`${topic.slug}\`\nSuccess: ${successes.length}/${tasks.length}\nGraph + queue updated.`);
  log('Dispatch complete.');
}

main().catch(e => { err(e.stack || e.message); process.exit(1); });
