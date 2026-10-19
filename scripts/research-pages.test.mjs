import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildPages, loadAllowlist, resolveDocLink, transformBody } from "./research-pages.mjs";
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
    expect(loadAllowlist(join(tmpdir(), "does-not-exist", "allowlist.json"))).toEqual({ ids: [], invalid: [] });
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

  it("takes the title from the first H1 without the doc number", () => {
    expect(docTitle(md)).toBe("X thread for new docs");
  });

  it("removes the H1 from the body so the title is not shown twice", () => {
    expect(dropFirstH1(stripFrontmatter(md))).not.toContain("# 1306");
  });
});
