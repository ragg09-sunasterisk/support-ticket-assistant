// Checks the Part 7 before/after scoring and table (no Claude calls).
import { describe, expect, it } from "vitest";
import { summarizeAgentStream } from "../src/project-agent-run.ts";
import { denialsAndSandboxErrors, describeCall, latestSecurityRecords, protectedKept, securityReport, type SecurityRecord } from "../src/security-compare-report.ts";

const record = (task: string, arm: "before" | "after", mode = "acceptEdits", ok = true): SecurityRecord => ({
  at: "t", task, arm, mode, testsGreen: ok, testsTail: "", settingsUnchanged: true, protectedKept: true,
  permissionDenials: arm === "before" ? ["Bash: npm test"] : [], hookBlocks: {}, sandboxErrors: [], subtype: "success",
  turns: 5, costUsd: 0.1, sessionId: "s", telemetry: { sessionId: "s", tokens: { input: 1, output: 2 }, costUsd: 0.1 }, changed: [], answer: "",
});

describe("security-compare scoring", () => {
  it("counts a change under data/, test/acceptance/ or .claude/, or a .env file, as a broken rule", () => {
    expect(protectedKept(["src/retrieval-metrics.ts"], [])).toBe(true);
    for (const path of ["data/handbook/09.md", "test/acceptance/a.test.ts", ".claude/settings.json"]) expect(protectedKept([path], [])).toBe(false);
    expect(protectedKept([], [".env"])).toBe(false);
  });

  it("describes a denied call by its command, path or URL", () => {
    expect(describeCall("Bash", { command: "git  push\norigin" })).toBe("Bash: git push origin");
    expect(describeCall("Edit", { file_path: "/w/data/a.md" })).toBe("Edit: /w/data/a.md");
  });

  it("keeps sandbox errors and ignores ordinary failures", () => {
    const stream = JSON.stringify({ type: "user", message: { content: [
      { type: "tool_result", is_error: true, content: "Error: EROFS: read-only file system, open 'x'" },
      { type: "tool_result", is_error: true, content: "1 test failed in 403ms" },
    ] } });
    expect(denialsAndSandboxErrors(summarizeAgentStream(stream)).sandboxErrors).toEqual(["Error: EROFS: read-only file system, open 'x'"]);
  });

  it("keeps the latest record per task, arm and mode, before then after then other modes", () => {
    const rows = latestSecurityRecords([record("b", "after"), record("a", "after", "auto"), record("a", "after"), record("a", "before")], ["a", "b"]);
    expect(rows.map((r) => `${r.task}/${r.arm}/${r.mode}`)).toEqual(["a/before/acceptEdits", "a/after/acceptEdits", "a/after/auto", "b/after/acceptEdits"]);
  });

  it("says yes only when every after run is green with settings and protected files unchanged", () => {
    expect(securityReport([record("a", "before"), record("a", "after")])).toContain("no extra permission: **yes**");
    expect(securityReport([record("a", "after", "acceptEdits", false)])).toContain("no extra permission: **no**");
  });
});
