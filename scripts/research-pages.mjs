// Builds the public ZAO Research pages at thezao.xyz/research from the docs
// Zaal has marked public. Runs in `npm run build`, before `next build`.
//
// The research library itself (ZAODEVZ/ZAOresearch) is private. A doc is public
// only if its id ("<topic>/<NNNN-slug>") is listed in research-public/allowlist.json.
// Not listed = not built, even if a rendered copy sits in research-public/docs/
// (default NOT public). The rendered copies are made by scripts/sync-research.mjs.
//
// Output is plain static HTML under public/research/ (gitignored), served via
// rewrites in next.config.mjs and excluded from the auth middleware, so a page
// view runs no function and no middleware. Never fails the site build: a listed
// doc with no rendered copy is skipped with a warning (the rest of the site
// still ships).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SOURCE_DIR = join(REPO_ROOT, "research-public");
const OUT_DIR = join(REPO_ROOT, "public", "research");
const SITE = "https://thezao.xyz";

// "<topic>/<NNNN-slug>", lowercase, no dots or slashes beyond the one separator,
// so an allowlist entry can never point outside research-public/docs/.
export const DOC_ID_RE = /^([a-z0-9][a-z0-9-]*)\/([0-9]+)-([a-z0-9][a-z0-9-]*)$/;

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Returns { ids, invalid, error }. A missing, unparseable or wrongly shaped
// allowlist means no public docs (never a build crash); `error` says why.
export function loadAllowlist(path = join(SOURCE_DIR, "allowlist.json")) {
  if (!existsSync(path)) return { ids: [], invalid: [], error: null };
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return { ids: [], invalid: [], error: `unreadable allowlist (${err instanceof Error ? err.message : String(err)})` };
  }
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.docs)) {
    return { ids: [], invalid: [], error: 'allowlist must be an object with a "docs" array' };
  }
  const ids = [];
  const invalid = [];
  for (const id of raw.docs) {
    if (typeof id === "string" && DOC_ID_RE.test(id)) {
      if (!ids.includes(id)) ids.push(id);
    } else {
      invalid.push(id);
    }
  }
  return { ids, invalid, error: null };
}

// Any address inside the private research repo, on github.com or its raw host.
export const PRIVATE_REPO_RE = /(github|githubusercontent)\.com\/ZAODEVZ\/ZAOresearch/i;

function isRelative(href) {
  return !/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href);
}

// Where a relative link in doc <id> points, as a public page path, or null if
// the target is not a public doc. Docs live at research/<topic>/<doc>/README.md
// in the private repo, so relative links resolve against that folder.
export function resolveDocLink(href, id, publicIds) {
  const [path, hash = ""] = href.split("#");
  const target = posix.normalize(posix.join("research", id, path || "."));
  const m = target.match(/^research\/([^/]+)\/([^/]+?)(?:\/README\.md|\/)?$/);
  if (!m) return null;
  const targetId = `${m[1]}/${m[2]}`;
  if (!publicIds.has(targetId)) return null;
  return `/research/${targetId}${hash ? `#${hash}` : ""}`;
}

// Turns the GitHub-rendered fragment of one doc into page body HTML:
// - drops GitHub's heading permalink anchors (their ids do not survive the trip)
// - relative links to another PUBLIC doc point at its public page
// - every other relative link, and any link into the private repo, keeps its
//   text but loses the link, so a reader never lands on a 404 or a login wall
// - relative images are dropped (their files are not published); alt text stays
export function transformBody(html, id, publicIds) {
  let out = html.replace(/<a id="user-content-[^"]*" class="anchor"[^>]*>[\s\S]*?<\/a>/g, "");
  out = out.replace(/<img\b[^>]*>/g, (tag) => {
    const src = (tag.match(/\ssrc="([^"]*)"/) || [])[1] || "";
    if (src && !isRelative(src) && !PRIVATE_REPO_RE.test(src)) return tag;
    const alt = (tag.match(/\salt="([^"]*)"/) || [])[1] || "";
    return alt ? `<em>[image: ${alt}]</em>` : "";
  });
  out = out.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/g, (whole, attrs, text) => {
    const href = (attrs.match(/\shref="([^"]*)"/) || [])[1];
    if (href === undefined) return whole;
    if (PRIVATE_REPO_RE.test(href)) return text;
    if (!isRelative(href)) return whole;
    const target = resolveDocLink(href.replace(/&amp;/g, "&"), id, publicIds);
    return target ? `<a href="${escapeHtml(target)}">${text}</a>` : text;
  });
  return out;
}

const STYLE = `
  :root {
    --ground: #141e27; --surface: #1b2732; --ink: #e8e4c4;
    --ink-soft: rgba(232,228,196,0.70); --ink-faint: rgba(232,228,196,0.45);
    --accent: #f5a623; --line: rgba(232,228,196,0.14);
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    --serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: light) {
    :root { --ground:#f3efe2; --surface:#faf7ec; --ink:#1a2530; --ink-soft:rgba(26,37,48,0.72); --ink-faint:rgba(26,37,48,0.45); --accent:#b06f13; --line:rgba(26,37,48,0.13); }
  }
  :root[data-theme="dark"]{--ground:#141e27;--surface:#1b2732;--ink:#e8e4c4;--ink-soft:rgba(232,228,196,0.70);--ink-faint:rgba(232,228,196,0.45);--accent:#f5a623;--line:rgba(232,228,196,0.14);}
  :root[data-theme="light"]{--ground:#f3efe2;--surface:#faf7ec;--ink:#1a2530;--ink-soft:rgba(26,37,48,0.72);--ink-faint:rgba(26,37,48,0.45);--accent:#b06f13;--line:rgba(26,37,48,0.13);}
  * { box-sizing: border-box; }
  body { margin:0; background:var(--ground); color:var(--ink); font-family:var(--serif); font-size:clamp(1rem,2vw,1.125rem); line-height:1.7; -webkit-font-smoothing:antialiased; }
  .wrap { max-width: 46rem; margin:0 auto; padding:0 clamp(1rem,4vw,1.5rem); }
  header.hero { border-bottom:1px solid var(--line); padding: clamp(2.5rem,10vh,6rem) 0 clamp(1.5rem,5vh,3rem); }
  .eyebrow { font-family:var(--sans); font-size:clamp(0.65rem,1.5vw,0.72rem); letter-spacing:0.22em; text-transform:uppercase; color:var(--accent); font-weight:600; margin:0 0 1.2rem; }
  .eyebrow a { color:inherit; text-decoration:none; }
  header.hero h1 { font-family:var(--sans); font-weight:800; letter-spacing:-0.03em; font-size:clamp(1.9rem,7vw,3.4rem); line-height:1.02; margin:0 0 1.2rem; }
  .lede { font-size:clamp(1.05rem,2.6vw,1.3rem); line-height:1.45; max-width:34rem; margin:0; color:var(--ink-soft); }
  main { padding: clamp(2rem,6vh,3.5rem) 0 4rem; }
  a { color:var(--accent); }
  a:focus-visible { outline:2px solid var(--accent); outline-offset:3px; border-radius:4px; }
  .docs { list-style:none; padding:0; margin:0; display:grid; gap:1.1rem; }
  .doc { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:1.3rem 1.5rem; }
  .doc .num { font-family:var(--sans); font-size:0.72rem; letter-spacing:0.14em; text-transform:uppercase; color:var(--accent); font-weight:600; }
  .doc h2 { font-family:var(--sans); font-weight:700; letter-spacing:-0.01em; font-size:1.25rem; margin:0.3rem 0 0; }
  .doc h2 a { color:var(--ink); text-decoration:none; }
  .doc h2 a:hover { color:var(--accent); }
  .note { font-family:var(--sans); font-size:0.9rem; color:var(--ink-soft); background:var(--surface); border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:8px; padding:1rem 1.2rem; margin:1.6rem 0 0; }
  article h1, article h2, article h3, article h4 { font-family:var(--sans); letter-spacing:-0.01em; line-height:1.25; margin:2.2rem 0 0.8rem; }
  article h1 { font-size:1.7rem; } article h2 { font-size:1.4rem; } article h3 { font-size:1.15rem; } article h4 { font-size:1rem; }
  article { overflow-wrap:anywhere; }
  article p, article ul, article ol { margin:0 0 1.1rem; }
  article li { margin:0.25rem 0; }
  article blockquote { margin:1.4rem 0; padding:0.2rem 1.2rem; border-left:3px solid var(--accent); color:var(--ink-soft); }
  article code { font-family:var(--mono); font-size:0.86em; background:var(--surface); border:1px solid var(--line); border-radius:5px; padding:0.05em 0.35em; }
  article pre { background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:1rem 1.1rem; overflow-x:auto; line-height:1.5; }
  article pre code { border:0; padding:0; background:none; font-size:0.84rem; }
  article .markdown-heading { display:block; }
  article table { display:block; overflow-x:auto; border-collapse:collapse; margin:1.4rem 0; font-family:var(--sans); font-size:0.88rem; line-height:1.45; }
  article th, article td { border:1px solid var(--line); padding:0.5rem 0.7rem; text-align:left; vertical-align:top; }
  article th { background:var(--surface); }
  article hr { border:0; border-top:1px solid var(--line); margin:2.2rem 0; }
  article img { max-width:100%; }
  footer { padding:2.5rem 0 4rem; font-family:var(--sans); font-size:0.82rem; color:var(--ink-faint); border-top:1px solid var(--line); }
  footer a { color:var(--accent); text-decoration:none; }
`;

function page({ title, description, path, body }) {
  const url = `${SITE}${path}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(url)}">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

export function renderDocPage({ id, meta, bodyHtml }) {
  const [, topic, number] = id.match(DOC_ID_RE);
  const title = `${meta.title} - ZAO Research ${number}`;
  return page({
    title,
    description: `ZAO Research doc ${number} (${topic}).`,
    path: `/research/${id}`,
    body: `<header class="hero">
  <div class="wrap">
    <p class="eyebrow"><a href="/research">ZAO Research</a> - doc ${escapeHtml(number)} - ${escapeHtml(topic)}</p>
    <h1>${escapeHtml(meta.title)}</h1>
  </div>
</header>
<main>
  <div class="wrap">
    <article>
${bodyHtml}
    </article>
  </div>
</main>
<footer>
  <div class="wrap">
    ZAO Research doc ${escapeHtml(number)}, published by The ZAO. <a href="/research">All public research</a> - <a href="/papers">The Papers</a>.
  </div>
</footer>`,
  });
}

export function renderIndexPage(entries) {
  const sorted = [...entries].sort((a, b) => Number(b.number) - Number(a.number));
  const list = sorted.length
    ? `<ul class="docs">
${sorted
  .map(
    (e) => `      <li class="doc">
        <span class="num">Doc ${escapeHtml(e.number)} - ${escapeHtml(e.topic)}</span>
        <h2><a href="/research/${escapeHtml(e.id)}">${escapeHtml(e.title)}</a></h2>
      </li>`,
  )
  .join("\n")}
    </ul>`
    : `<p class="note">No research docs are public yet.</p>`;
  return page({
    title: "The ZAO - Research",
    description: "Public research docs from The ZAO's research library.",
    path: "/research",
    body: `<header class="hero">
  <div class="wrap">
    <p class="eyebrow">The ZAO - Research</p>
    <h1>Research</h1>
    <p class="lede">Research docs from The ZAO's library that are published for everyone to read.</p>
  </div>
</header>
<main>
  <div class="wrap">
    ${list}
  </div>
</main>
<footer>
  <div class="wrap">
    Published by The ZAO. <a href="/papers">The Papers</a>.
  </div>
</footer>`,
  });
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

// Pure core: given the allowlist and a reader for rendered docs, returns the
// files to write. Only ids in the allowlist are ever read or emitted.
export function buildPages(ids, readDoc) {
  const publicIds = new Set();
  const loaded = [];
  const skipped = [];
  for (const id of ids) {
    const doc = readDoc(id);
    if (!doc) {
      skipped.push(id);
      continue;
    }
    publicIds.add(id);
    loaded.push({ id, ...doc });
  }
  const files = {};
  const entries = [];
  for (const { id, meta, html } of loaded) {
    const [, topic, number] = id.match(DOC_ID_RE);
    const bodyHtml = transformBody(html, id, publicIds);
    files[`${id}.html`] = renderDocPage({ id, meta, bodyHtml });
    entries.push({ id, topic, number, title: meta.title });
  }
  files["index.html"] = renderIndexPage(entries);
  return { files, skipped };
}

// Returns null (the doc is skipped with a warning) for a missing copy or a
// meta file that is unparseable or has no title - never throws.
export function readRenderedDoc(id, docsDir = join(SOURCE_DIR, "docs")) {
  const base = join(docsDir, id);
  if (!existsSync(`${base}.html`) || !existsSync(`${base}.json`)) return null;
  let meta;
  try {
    meta = JSON.parse(readFileSync(`${base}.json`, "utf8"));
  } catch {
    return null;
  }
  if (!meta || typeof meta.title !== "string" || !meta.title) return null;
  return { meta, html: readFileSync(`${base}.html`, "utf8") };
}

function main() {
  const { ids, invalid, error } = loadAllowlist();
  if (error) console.warn(`research-pages: ${error} - building with NO public docs`);
  for (const bad of invalid) console.warn(`research-pages: ignored invalid allowlist entry ${JSON.stringify(bad)}`);
  const { files, skipped } = buildPages(ids, readRenderedDoc);
  for (const id of skipped) console.warn(`research-pages: SKIPPED ${id} - listed public but no usable rendered copy (missing, or its .json is unreadable or has no title; run scripts/sync-research.mjs)`);
  for (const [rel, content] of Object.entries(files)) {
    const out = join(OUT_DIR, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, content);
  }
  // A local build can leave pages from a doc since removed from the allowlist.
  // Vercel builds from a fresh clone, so this only matters locally; say so loudly.
  const expected = new Set(Object.keys(files).map((rel) => join(OUT_DIR, rel)));
  for (const f of listFiles(OUT_DIR)) {
    if (!expected.has(f)) console.warn(`research-pages: STALE ${f} is not in the allowlist; delete it before serving locally`);
  }
  const unlisted = listFiles(join(SOURCE_DIR, "docs"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => f.slice(join(SOURCE_DIR, "docs").length + 1, -".html".length))
    .filter((id) => !ids.includes(id));
  for (const id of unlisted) console.warn(`research-pages: not built ${id} - rendered copy exists but it is not in the allowlist`);
  console.log(`research-pages: built ${Object.keys(files).length - 1} doc page(s) + index from ${ids.length} allowlisted id(s)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
