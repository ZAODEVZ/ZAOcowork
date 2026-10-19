import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildPages, loadAllowlist, readRenderedDoc, resolveDocLink, transformBody } from "./research-pages.mjs";
import { docTitle, stripFrontmatter, dropFirstH1 } from "./sync-research.mjs";

const doc = (title, html = "<p>body</p>") => ({ meta: { title }, html });

describe("buildPages", () => {
  it("builds only allowlisted docs, even when other rendered copies exist", () => {
    const rendered = {
      "dev-workflows/1306-x-thread": doc("X thread"),
      "business/1912-sales-leads": doc("Sales leads"),
    };
    const reads = [];
    const { files } = buildPages(["dev-workflows/1306-x-thread"], (id) => {
      reads.push(id);
      return rendered[id] ?? null;
    });
    expect(Object.keys(files).sort()).toEqual(["dev-workflows/1306-x-thread.html", "index.html"]);
    expect(reads).toEqual(["dev-workflows/1306-x-thread"]);
    expect(files["index.html"]).not.toContain("Sales leads");
  });

  it("an empty allowlist builds an index with no docs", () => {
    const { files } = buildPages([], () => doc("never read"));
    expect(Object.keys(files)).toEqual(["index.html"]);
    expect(files["index.html"]).toContain("No research docs are public yet.");
  });

  it("skips a listed doc with no rendered copy instead of failing", () => {
    const { files, skipped } = buildPages(["infra/12-missing"], () => null);
    expect(skipped).toEqual(["infra/12-missing"]);
    expect(Object.keys(files)).toEqual(["index.html"]);
  });

  it("escapes the title on the page and in the index", () => {
    const { files } = buildPages(["infra/7-t"], () => doc('<script>alert(1)</script> & "q"'));
    for (const html of Object.values(files)) {
      expect(html).not.toContain("<script>alert(1)</script>");
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;");
    }
  });

  it("lists docs newest number first", () => {
    const { files } = buildPages(["a/2-two", "b/10-ten"], (id) => doc(id === "a/2-two" ? "Two" : "Ten"));
    const idx = files["index.html"];
    expect(idx.indexOf("Ten")).toBeLessThan(idx.indexOf("Two"));
  });
});

describe("loadAllowlist", () => {
  const write = (body) => {
    const dir = mkdtempSync(join(tmpdir(), "allow-"));
    const p = join(dir, "allowlist.json");
    writeFileSync(p, body);
    return p;
  };

  it("rejects ids that could escape the docs folder or are not doc ids", () => {
    const p = write(
      JSON.stringify({
        docs: ["dev-workflows/1306-x-thread", "../secrets/1-x", "a/b/1-x", "a/1-x.html", "A/1-x", "a/x", 5],
      }),
    );
    const { ids, invalid } = loadAllowlist(p);
    expect(ids).toEqual(["dev-workflows/1306-x-thread"]);
    expect(invalid).toHaveLength(6);
  });

  it("a missing allowlist means nothing is public", () => {
    expect(loadAllowlist(join(tmpdir(), "does-not-exist", "allowlist.json"))).toEqual({ ids: [], invalid: [], error: null });
  });

  it.each([
    ["malformed JSON", '{"docs": ['],
    ["null", "null"],
    ["docs not an array", '{"docs": "a/1-x"}'],
    ["a bare array", '["a/1-x"]'],
  ])("a broken allowlist (%s) means nothing is public, without throwing", (_label, body) => {
    const { ids, error } = loadAllowlist(write(body));
    expect(ids).toEqual([]);
    expect(error).toBeTruthy();
  });
});

describe("readRenderedDoc", () => {
  const docsDir = () => {
    const dir = mkdtempSync(join(tmpdir(), "docs-"));
    mkdirSync(join(dir, "a"));
    return dir;
  };

  it("skips a doc whose meta file is malformed, instead of throwing", () => {
    const dir = docsDir();
    writeFileSync(join(dir, "a", "1-x.html"), "<p>x</p>");
    writeFileSync(join(dir, "a", "1-x.json"), "{not json");
    expect(readRenderedDoc("a/1-x", dir)).toBeNull();
  });

  it("skips a doc whose meta is null or has no title", () => {
    const dir = docsDir();
    writeFileSync(join(dir, "a", "1-x.html"), "<p>x</p>");
    writeFileSync(join(dir, "a", "1-x.json"), "null");
    expect(readRenderedDoc("a/1-x", dir)).toBeNull();
    writeFileSync(join(dir, "a", "1-x.json"), "{}");
    expect(readRenderedDoc("a/1-x", dir)).toBeNull();
  });

  it("reads a good copy", () => {
    const dir = docsDir();
    writeFileSync(join(dir, "a", "1-x.html"), "<p>x</p>");
    writeFileSync(join(dir, "a", "1-x.json"), '{"title":"X"}');
    expect(readRenderedDoc("a/1-x", dir)).toEqual({ meta: { title: "X" }, html: "<p>x</p>" });
  });
});

describe("transformBody", () => {
  const publicIds = new Set(["dev-workflows/1306-x-thread", "business/2257-public"]);
  const id = "dev-workflows/1306-x-thread";

  it("points a relative link to another public doc at its public page", () => {
    const out = transformBody('<a href="../../business/2257-public/">see</a>', id, publicIds);
    expect(out).toBe('<a href="/research/business/2257-public">see</a>');
  });

  it("unlinks a relative link to a doc that is not public, keeping the text", () => {
    const out = transformBody('<a href="../../business/1912-sales-leads/README.md">leads</a>', id, publicIds);
    expect(out).toBe("leads");
  });

  it("unlinks any link into the private research repo", () => {
    const out = transformBody(
      '<a href="https://github.com/ZAODEVZ/ZAOresearch/tree/main/research/x/1-y">repo</a>',
      id,
      publicIds,
    );
    expect(out).toBe("repo");
  });

  it.each([
    "https://raw.githubusercontent.com/ZAODEVZ/ZAOresearch/main/research/x/1-y/README.md",
    "https://GITHUB.com/zaodevz/zaoresearch/blob/main/x.md",
  ])("unlinks private-repo link %s", (href) => {
    expect(transformBody(`<a href="${href}">repo</a>`, id, publicIds)).toBe("repo");
  });

  it("drops absolute images hosted in the private repo, keeping alt text", () => {
    for (const src of [
      "https://github.com/ZAODEVZ/ZAOresearch/raw/main/chart.png",
      "https://raw.githubusercontent.com/ZAODEVZ/ZAOresearch/main/chart.png",
    ]) {
      const out = transformBody(`<p><img src="${src}" alt="chart"></p>`, id, publicIds);
      expect(out).not.toMatch(/ZAOresearch/i);
      expect(out).toContain("<em>[image: chart]</em>");
    }
  });

  it("keeps a public absolute image", () => {
    const img = '<img src="https://thezao.xyz/papers-og.png" alt="og">';
    expect(transformBody(img, id, publicIds)).toBe(img);
  });

  it("keeps external links and in-page hashes", () => {
    const ext = '<a href="https://docs.x.com/x-api">X docs</a>';
    expect(transformBody(ext, id, publicIds)).toBe(ext);
    expect(transformBody('<a href="#cost">cost</a>', id, publicIds)).toBe('<a href="#cost">cost</a>');
  });

  it("drops GitHub heading permalinks and relative images", () => {
    const html =
      '<div class="markdown-heading"><h2 class="heading-element">Cost</h2><a id="user-content-cost" class="anchor" aria-label="Permalink: Cost" href="#cost"><span aria-hidden="true" class="octicon octicon-link"></span></a></div>' +
      '<p><a target="_blank" rel="noopener noreferrer" href="chart.png"><img src="chart.png" alt="cost chart" style="max-width: 100%;"></a></p>';
    const out = transformBody(html, id, publicIds);
    expect(out).not.toContain("user-content-cost");
    expect(out).not.toContain("chart.png");
    expect(out).toContain("<em>[image: cost chart]</em>");
  });
});

describe("resolveDocLink", () => {
  it("does not let a link climb out of research/", () => {
    expect(resolveDocLink("../../../../etc/passwd", "a/1-x", new Set(["a/1-x"]))).toBeNull();
  });
});

describe("sync helpers", () => {
  const md = `---\noriginal-query: "internal ask"\ntier: STANDARD\n---\n\n# 1306 - X thread for new docs\n\nBody.\n`;

  it("strips frontmatter so internal fields never reach the page", () => {
    expect(stripFrontmatter(md)).not.toContain("original-query");
  });

  it("strips frontmatter after a byte-order mark or leading blank lines", () => {
    expect(stripFrontmatter(`\uFEFF${md}`)).not.toContain("original-query");
    expect(stripFrontmatter(`\n\n${md}`)).not.toContain("original-query");
  });

  it("takes the title from the first H1 without the doc number", () => {
    expect(docTitle(md)).toBe("X thread for new docs");
  });

  it("removes the H1 from the body so the title is not shown twice", () => {
    expect(dropFirstH1(stripFrontmatter(md))).not.toContain("# 1306");
  });
});
