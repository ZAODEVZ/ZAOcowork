#!/usr/bin/env node
// Copies the docs listed in research-public/allowlist.json out of a local clone
// of the private research library (ZAODEVZ/ZAOresearch) into research-public/docs/,
// rendered to HTML. Run by hand (or by an agent in a PR), never by the site build:
// the Vercel build has no access to the private repo, and needs none.
//
//   node scripts/sync-research.mjs <path-to-ZAOresearch-clone>
//
// Only allowlisted ids are read. Markdown is rendered by GitHub's own Markdown
// API (`gh api markdown`), so no renderer dependency is added; YAML frontmatter
// is stripped first because it holds internal fields (original-query etc).
// It never deletes: a rendered copy of a doc taken off the allowlist stays on
// disk and is not built (`npm run build` lists it as "not built").
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { loadAllowlist, DOC_ID_RE } from "./research-pages.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "..", "research-public", "docs");

export function stripFrontmatter(md) {
  // Tolerates a byte-order mark and blank lines before the opening fence.
  return md.replace(/^\uFEFF?\s*---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

// The doc's first H1, without the leading "NNNN - " the library puts on titles.
export function docTitle(md) {
  const m = stripFrontmatter(md).match(/^#\s+(.+?)\s*#*\s*$/m);
  if (!m) return null;
  return m[1].replace(/^\d+\s*[-:]\s*/, "").trim() || null;
}

// Removes the first H1 so the page header is the only title.
export function dropFirstH1(md) {
  return md.replace(/^#\s+.+$/m, "");
}

function render(markdown) {
  return execFileSync("gh", ["api", "markdown", "--input", "-"], {
    input: JSON.stringify({ text: markdown, mode: "markdown" }),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function gitHead(repo) {
  try {
    return execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function main() {
  const repo = process.argv[2];
  if (!repo || !existsSync(join(repo, "research"))) {
    console.error("usage: node scripts/sync-research.mjs <path-to-ZAOresearch-clone>");
    process.exit(2);
  }
  const { ids, invalid, error } = loadAllowlist();
  if (error) {
    console.error(error);
    process.exit(2);
  }
  if (invalid.length) {
    console.error(`invalid allowlist entries: ${JSON.stringify(invalid)}`);
    process.exit(2);
  }
  const head = gitHead(repo);
  let failed = 0;
  for (const id of ids) {
    const src = join(repo, "research", id, "README.md");
    if (!existsSync(src)) {
      console.error(`MISSING ${id}: ${src} not found`);
      failed++;
      continue;
    }
    const md = readFileSync(src, "utf8");
    const title = docTitle(md);
    if (!title) {
      console.error(`NO TITLE ${id}: no H1 in ${src}`);
      failed++;
      continue;
    }
    const html = render(dropFirstH1(stripFrontmatter(md)));
    if (html.trim().length === 0) {
      console.error(`EMPTY ${id}: the Markdown API returned nothing`);
      failed++;
      continue;
    }
    const [, topic, number] = id.match(DOC_ID_RE);
    const out = join(DOCS_DIR, id);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(`${out}.html`, html);
    writeFileSync(`${out}.json`, `${JSON.stringify({ title, topic, number, source_commit: head }, null, 2)}\n`);
    console.log(`synced ${id}: ${title}`);
  }
  if (failed) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
