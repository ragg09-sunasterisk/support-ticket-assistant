// Acceptance tests: behaviour the course already promises for handbook search (Parts 4 and 5). Owned
// by the course, not by agents: the PreToolUse hook in .claude/hooks blocks edits under test/acceptance/.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../src/handbook-chunker.ts";
import { runSearchHandbook, type SearchHandbookOutput } from "../../src/handbook-mcp-tool.ts";
import { search_handbook } from "../../src/handbook-search.ts";
import { loadRetrievalSet } from "../../src/retrieval-set.ts";

const questions = loadRetrievalSet(fileURLToPath(new URL("../../evals/retrieval.jsonl", import.meta.url)));
const RESTRICTED_PAGES = ["hb-18", "hb-19", "hb-20"];

describe("acceptance: search_handbook", () => {
  it("returns results that carry a chunk ID and the source path of a real handbook page", () => {
    const results = search_handbook("refund stuck in processing", 5);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.chunk_id).toMatch(/^hb-\d{2}#[a-z0-9-]+$/);
      expect(r.source_path).toMatch(/^data\/handbook\/\d{2}-[a-z0-9-]+\.md$/);
      expect(existsSync(join(REPO_ROOT, r.source_path))).toBe(true);
    }
  });

  it("never gives hb-18 to hb-20 to support_agent, for any retrieval question, through the MCP tool", () => {
    for (const q of questions) {
      const output = runSearchHandbook("support_agent", undefined, { query: q.question, k: 10 })
        .structuredContent as SearchHandbookOutput;
      const pages = output.results.map((r) => r.chunk_id.split("#")[0]);
      expect(pages.filter((p) => RESTRICTED_PAGES.includes(p ?? "")), q.id).toEqual([]);
    }
  });

  it("ignores a role the model adds to the tool call", () => {
    const output = runSearchHandbook("support_agent", undefined, { query: "payment provider keys rotated", k: 10, role: "security" })
      .structuredContent as SearchHandbookOutput;
    expect(output.role).toBe("support_agent");
  });
});

describe("acceptance: retrieval set", () => {
  it("has 30 questions: 27 answerable (3 of them restricted) and 3 unanswerable", () => {
    expect(questions).toHaveLength(30);
    expect(questions.filter((q) => q.answerable)).toHaveLength(27);
    expect(questions.filter((q) => q.restricted)).toHaveLength(3);
  });
});
