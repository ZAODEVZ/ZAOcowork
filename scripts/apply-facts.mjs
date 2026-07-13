// Substitutes {{TOKEN}} placeholders from data/facts.json into every file
// under templates/, writing the result to the matching path under public/.
// See docs/shared-facts.md for the full workflow. Throws on a token with no
// matching fact (typo protection); warns on a fact that no template uses
// (dead-fact protection). --check diffs against the current public/ files
// without writing, for CI/PR review.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const TEMPLATES_DIR = join(REPO_ROOT, "templates");
const PUBLIC_DIR = join(REPO_ROOT, "public");
const FACTS_PATH = join(REPO_ROOT, "data", "facts.json");

const TOKEN_PATTERN = /\{\{([A-Z0-9_]+)\}\}/g;

export function loadFacts(factsPath = FACTS_PATH) {
  const raw = JSON.parse(readFileSync(factsPath, "utf8"));
  const facts = {};
  for (const [key, entry] of Object.entries(raw)) {
    facts[key] = entry.value;
  }
  return facts;
}

export function listTemplateFiles(dir = TEMPLATES_DIR) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...listTemplateFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

export function renderTemplate(content, facts, { sourceLabel = "<template>" } = {}) {
  const usedTokens = new Set();
  const missing = [];
  const rendered = content.replace(TOKEN_PATTERN, (match, tokenName) => {
    usedTokens.add(tokenName);
    if (!(tokenName in facts)) {
      missing.push(tokenName);
      return match;
    }
    return facts[tokenName];
  });
  if (missing.length > 0) {
    throw new Error(
      `${sourceLabel}: unknown token(s) ${missing.map((t) => `{{${t}}}`).join(", ")} - add them to data/facts.json or fix the template.`
    );
  }
  return { rendered, usedTokens };
}

function outputPathFor(templatePath) {
  const rel = relative(TEMPLATES_DIR, templatePath);
  return join(PUBLIC_DIR, rel);
}

export function applyFacts({ check = false } = {}) {
  const facts = loadFacts();
  const templateFiles = listTemplateFiles();
  const allUsedTokens = new Set();
  const drifted = [];

  for (const templatePath of templateFiles) {
    const rel = relative(REPO_ROOT, templatePath);
    const content = readFileSync(templatePath, "utf8");
    const { rendered, usedTokens } = renderTemplate(content, facts, { sourceLabel: rel });
    for (const t of usedTokens) allUsedTokens.add(t);

    const outPath = outputPathFor(templatePath);
    if (check) {
      let existing;
      try {
        existing = readFileSync(outPath, "utf8");
      } catch {
        existing = null;
      }
      if (existing !== rendered) {
        drifted.push(relative(REPO_ROOT, outPath));
      }
    } else {
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, rendered, "utf8");
    }
  }

  const unusedFacts = Object.keys(loadFactsRaw()).filter((k) => !allUsedTokens.has(k));
  if (unusedFacts.length > 0) {
    console.warn(
      `[apply-facts] warning: fact(s) defined in data/facts.json but not used in any template: ${unusedFacts.join(", ")}`
    );
  }

  if (check) {
    if (drifted.length > 0) {
      console.error(
        `[apply-facts] drift detected - the following generated files no longer match their template + facts.json:\n` +
          drifted.map((p) => `  - ${p}`).join("\n") +
          `\nRun \`npm run facts:apply\` and commit the result.`
      );
      process.exitCode = 1;
    } else {
      console.log(`[apply-facts] check passed - all ${templateFiles.length} generated files are in sync.`);
    }
  } else {
    console.log(`[apply-facts] wrote ${templateFiles.length} file(s) from templates/ + data/facts.json.`);
  }
}

function loadFactsRaw(factsPath = FACTS_PATH) {
  return JSON.parse(readFileSync(factsPath, "utf8"));
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes("--check");
  applyFacts({ check });
}
