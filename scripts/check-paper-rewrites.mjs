#!/usr/bin/env node
/**
 * check-paper-rewrites.mjs
 *
 * Validates that every paper in public/papers.json with a clean URL (no .html extension)
 * has a corresponding rewrite entry in next.config.mjs, and that the destination .html
 * file exists.
 *
 * Exit codes:
 *   0 - All clean-URL papers have valid rewrites and destination files exist
 *   1 - One or more clean-URL papers are missing rewrites or destination files
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const configPath = path.join(projectRoot, 'next.config.mjs');
const papersJsonPath = path.join(projectRoot, 'public', 'papers.json');
const publicDir = path.join(projectRoot, 'public');

// Parse next.config.mjs to extract rewrites
function parseNextConfig() {
  const configContent = fs.readFileSync(configPath, 'utf-8');

  // Simple regex to find the rewrites array
  // Matches: { source: '...', destination: '...' }
  const rewriteRegex = /{\s*source:\s*['"]([^'"]+)['"]\s*,\s*destination:\s*['"]([^'"]+)['"]\s*}/g;

  const rewrites = {};
  let match;

  while ((match = rewriteRegex.exec(configContent)) !== null) {
    const source = match[1];
    const destination = match[2];
    rewrites[source] = destination;
  }

  return rewrites;
}

// Parse papers.json to extract paper URLs
function parsePapersJson() {
  const papersContent = fs.readFileSync(papersJsonPath, 'utf-8');
  const data = JSON.parse(papersContent);

  const papers = [];

  // Main papers array
  if (Array.isArray(data.papers)) {
    for (const paper of data.papers) {
      if (paper.url) {
        papers.push({
          id: paper.id,
          title: paper.title,
          url: paper.url,
        });
      }
    }
  }

  return papers;
}

// Extract path from full URL
function getPathFromUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname;
  } catch {
    // If not a valid URL, return as-is
    return url;
  }
}

// Check if a file exists
function fileExists(filePath) {
  try {
    fs.statSync(filePath);
    return true;
  } catch {
    return false;
  }
}

// Main validation logic
function main() {
  console.log('Checking paper rewrites...\n');

  let rewrites;
  let papers;

  try {
    rewrites = parseNextConfig();
    papers = parsePapersJson();
  } catch (error) {
    console.error('ERROR: Failed to parse configuration files');
    console.error(error.message);
    process.exit(1);
  }

  console.log(`Found ${Object.keys(rewrites).length} rewrite entries in next.config.mjs`);
  console.log(`Found ${papers.length} papers in public/papers.json\n`);

  const issues = [];
  let checkedCleanUrls = 0;
  let checkedStaticFiles = 0;

  for (const paper of papers) {
    const paperPath = getPathFromUrl(paper.url);

    // Check if this is a static file URL (ends in .html)
    if (paperPath.endsWith('.html')) {
      checkedStaticFiles++;

      // Verify the static file exists
      const fullPath = path.join(publicDir, paperPath);
      if (!fileExists(fullPath)) {
        issues.push({
          type: 'missing-static-file',
          paper: paper.id,
          title: paper.title,
          path: paperPath,
          file: fullPath,
        });
      }
      continue;
    }

    // This is a clean URL - verify rewrite exists and destination file exists
    checkedCleanUrls++;

    if (!(paperPath in rewrites)) {
      issues.push({
        type: 'missing-rewrite',
        paper: paper.id,
        title: paper.title,
        path: paperPath,
      });
      continue;
    }

    const destination = rewrites[paperPath];
    const fullDestPath = path.join(publicDir, destination);

    if (!fileExists(fullDestPath)) {
      issues.push({
        type: 'missing-destination-file',
        paper: paper.id,
        title: paper.title,
        path: paperPath,
        destination: destination,
        file: fullDestPath,
      });
    }
  }

  console.log(`Checked ${checkedCleanUrls} clean-URL papers`);
  console.log(`Checked ${checkedStaticFiles} static-file papers\n`);

  if (issues.length === 0) {
    console.log('SUCCESS: All papers are properly configured.\n');
    process.exit(0);
  }

  console.error(`FOUND ${issues.length} ISSUE(S):\n`);

  for (const issue of issues) {
    if (issue.type === 'missing-rewrite') {
      console.error(`[MISSING REWRITE] Paper "${issue.title}" (${issue.paper})`);
      console.error(`  Clean URL: ${issue.path}`);
      console.error(`  Action: Add rewrite entry to next.config.mjs`);
      console.error(`  Example: { source: '${issue.path}', destination: '/papers/<file>.html' }\n`);
    } else if (issue.type === 'missing-destination-file') {
      console.error(`[MISSING FILE] Paper "${issue.title}" (${issue.paper})`);
      console.error(`  Clean URL: ${issue.path}`);
      console.error(`  Destination: ${issue.destination}`);
      console.error(`  File should exist: ${issue.file}\n`);
    } else if (issue.type === 'missing-static-file') {
      console.error(`[MISSING STATIC FILE] Paper "${issue.title}" (${issue.paper})`);
      console.error(`  URL: ${issue.path}`);
      console.error(`  File should exist: ${issue.file}\n`);
    }
  }

  console.error(`\nFailed validation. ${issues.length} issue(s) found.\n`);
  process.exit(1);
}

main();
