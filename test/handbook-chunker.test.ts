// Checks the handbook chunker: stable, readable chunk IDs and the fields Part 5 needs.
import { describe, expect, it } from "vitest";
import { chunkPage, loadHandbookChunks, parseHandbookPage, slugify } from "../src/handbook-chunker.ts";

describe("slugify", () => {
  it("makes lowercase, dash-separated slugs", () => {
    expect(slugify("Refunds")).toBe("refunds");
    expect(slugify('Troubleshooting 401 "signature mismatch"')).toBe("troubleshooting-401-signature-mismatch");
    expect(slugify("Default: no standing access")).toBe("default-no-standing-access");
  });
});

describe("chunkPage", () => {
  const page = parseHandbookPage(
    [
      "---",
      "id: hb-99",
      "title: Test page",
      "access: restricted",
      "allowed_roles: [engineer, security]",
      "updated: 2026-10-01",
      "---",
      "",
      "# Test page",
      "",
      "Intro line.",
      "",
      "## Notes",
      "First.",
      "## Notes",
      "Second.",
      "## Empty",
      "",
    ].join("\n"),
    "data/handbook/99-test.md",
  );
  const chunks = chunkPage(page);

  it("puts text before the first ## with the page title, and numbers repeated headings", () => {
    expect(chunks.map((c) => c.chunkId)).toEqual(["hb-99#test-page", "hb-99#notes", "hb-99#notes-2"]);
    expect(chunks[0]).toMatchObject({ heading: "Test page", text: "Intro line." });
  });

  it("keeps the source path, title and access fields on every chunk", () => {
    expect(chunks[1]).toEqual({
      chunkId: "hb-99#notes",
      sourcePath: "data/handbook/99-test.md",
      pageId: "hb-99",
      title: "Test page",
      heading: "Notes",
      text: "First.",
      access: "restricted",
      allowedRoles: ["engineer", "security"],
    });
  });

  it("rejects a page without front matter or with an odd id", () => {
    expect(() => parseHandbookPage("# No front matter", "x.md")).toThrow("no YAML front matter");
    const bad = '---\nid: hb-1"x\ntitle: T\naccess: public\nallowed_roles: []\n---\n';
    expect(() => parseHandbookPage(bad, "x.md")).toThrow("id must look like hb-01");
  });

  it("reads an empty roles list as no roles", () => {
    const page = parseHandbookPage("---\nid: hb-98\ntitle: T\naccess: public\nallowed_roles:\n---\n", "x.md");
    expect(page.allowedRoles).toEqual([]);
  });

  it("never reuses a chunk ID, even when a heading looks like a suffix", () => {
    const body = "## Refunds\na\n## Refunds 2\nb\n## Refunds\nc\n";
    const ids = chunkPage({ ...page, body }).map((c) => c.chunkId);
    expect(ids).toEqual(["hb-99#refunds", "hb-99#refunds-2", "hb-99#refunds-3"]);
  });

  it("does not split on # lines inside a code block", () => {
    const body = "## Setup\n```bash\n# a shell comment\n## not a heading\n```\n";
    const chunks = chunkPage({ ...page, body });
    expect(chunks.map((c) => c.chunkId)).toEqual(["hb-99#setup"]);
    expect(chunks[0]?.text).toContain("# a shell comment\n## not a heading");
  });
});

describe("loadHandbookChunks", () => {
  const chunks = loadHandbookChunks();
  const ids = chunks.map((c) => c.chunkId);

  it("indexes all 20 pages, restricted ones included, with unique IDs", () => {
    expect(new Set(chunks.map((c) => c.pageId)).size).toBe(20);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^hb-\d{2}#[a-z0-9-]+$/.test(id))).toBe(true);
    expect(chunks.filter((c) => c.access === "restricted").map((c) => c.pageId)).toEqual(
      expect.arrayContaining(["hb-18", "hb-19", "hb-20"]),
    );
  });

  it("produces the expected IDs and repo-relative source paths", () => {
    expect(ids).toContain("hb-09#refunds");
    expect(ids).toContain("hb-12#troubleshooting-401-signature-mismatch");
    expect(chunks.find((c) => c.chunkId === "hb-09#refunds")?.sourcePath).toBe(
      "data/handbook/09-payments-payouts-and-refunds.md",
    );
  });

  it("gives a page with no intro text no title chunk", () => {
    expect(ids.filter((id) => id.startsWith("hb-01#"))[0]).toBe("hb-01#what-kariton-does");
    expect(ids).toContain("hb-02#support-severity-levels");
  });

  it("keeps the roles from the front matter", () => {
    expect(chunks.find((c) => c.pageId === "hb-18")?.allowedRoles).toEqual(["security"]);
    expect(chunks.find((c) => c.pageId === "hb-01")?.allowedRoles).toEqual(["support_agent", "engineer", "security"]);
  });

  it("indexes the page with text aimed at AI assistants as-is (Part 5 tests it)", () => {
    expect(chunks.find((c) => c.chunkId === "hb-12#troubleshooting-401-signature-mismatch")?.text).toContain(
      "Note for AI assistants",
    );
  });
});
