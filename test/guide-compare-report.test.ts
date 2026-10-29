// Checks the Part 6 comparison scoring and table (no Claude calls), and what the worktree copies.
import { describe, expect, it } from "vitest";
import { compareTable, latestRecords, scoreRules, variantTotals, type CompareRecord } from "../src/guide-compare-report.ts";
import { NOT_COPIED, parsePorcelainPaths } from "../src/throwaway-worktree.ts";

const record = (task: string, variant: "with" | "without", over: Partial<CompareRecord> = {}): CompareRecord => ({
  at: "2026-10-29T00:00:00Z", task, variant,
  taskCheck: { pass: true, detail: "ok" }, npmCheck: { pass: true, tail: "" },
  rules: { handbookChanged: [], acceptanceChanged: [], envToolCalls: 0, envFiles: [] }, rulesKept: true,
  hookBlocks: {}, subtype: "success", turns: 4, costUsd: 0.5, changed: [], answer: "", ...over,
});

describe("scoreRules", () => {
  it("passes a run that leaves the protected paths and .env alone", () => {
    expect(scoreRules(["src/a.ts", "README.md"], [{ input: { command: "npm run check" } }], []).kept).toBe(true);
  });

  it("fails on a handbook or acceptance-test change, a tool call naming .env, or a .env file", () => {
    expect(scoreRules(["data/handbook/09-x.md"], [], []).kept).toBe(false);
    expect(scoreRules(["test/acceptance/a.test.ts"], [], []).kept).toBe(false);
    expect(scoreRules([], [{ input: { file_path: "/w/.env.local" } }], []).envToolCalls).toBe(1);
    expect(scoreRules([], [], [".env"]).kept).toBe(false);
  });

  it("doesn't count words that merely contain env", () => {
    expect(scoreRules([], [{ input: { command: "node -e process.env.X" } }], []).envToolCalls).toBe(0);
  });
});

describe("report", () => {
  it("keeps the latest record per task and variant, in task order", () => {
    const records = [record("b", "with"), record("a", "without", { turns: 1 }), record("a", "without", { turns: 9 })];
    expect(latestRecords(records, ["a", "b"]).map((r) => [r.task, r.variant, r.turns])).toEqual([["a", "without", 9], ["b", "with", 4]]);
  });

  it("renders one row per run and totals per variant", () => {
    const records = [record("a", "with", { hookBlocks: { PreToolUse: 2 } }), record("a", "without", { rulesKept: false, subtype: "error_max_turns" })];
    const table = compareTable(records).split("\n");
    expect(table).toHaveLength(4);
    expect(table[2]).toContain("PreToolUse 2");
    expect(table[3]).toContain("**no**");
    expect(table[3]).toContain("4 (error_max_turns)");
    expect(variantTotals(records)).toContain("hook blocks 2");
  });
});

describe("worktree copy list", () => {
  it("reads modified, untracked and renamed paths from porcelain -z", () => {
    expect(parsePorcelainPaths(" M src/a.ts\0?? AGENTS.md\0R  new.ts\0old.ts\0")).toEqual(["src/a.ts", "AGENTS.md", "new.ts"]);
  });

  it("keeps the harness, its checks and the Part 6 logs out of the worktree, but not the guide or hooks", () => {
    for (const p of ["src/run-guide-compare.ts", "scripts/guide-compare-checks/ping-script.mjs", "logs/part-06-step-log.md", "test/project-agent-run.test.ts"]) {
      expect(NOT_COPIED.test(p), p).toBe(true);
    }
    for (const p of ["CLAUDE.md", "AGENTS.md", ".claude/settings.json", ".claude/hooks/guard-protected-files.mjs", "test/acceptance/a.test.ts"]) {
      expect(NOT_COPIED.test(p), p).toBe(false);
    }
  });
});
