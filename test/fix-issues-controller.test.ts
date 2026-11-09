// Part 9: the issue-fixing controller with every outside effect faked (no Claude, no git, no npm).
// One test per stop rule, plus the toggle being read before every iteration and resuming from progress.
import { describe, expect, it } from "vitest";
import { runFixIssues } from "../src/fix-issues-controller.ts";
import { DEFAULT_LIMITS } from "../src/fix-issues-limits.ts";
import { crash, fakeWorld, issue, stream, verified } from "./fix-issues-test-fakes.ts";

const limits = DEFAULT_LIMITS;
const iterations = (logs: Record<string, unknown>[]) => logs.filter((l) => l.event === "iteration");
const runStop = (logs: Record<string, unknown>[]) => logs.find((l) => l.event === "run-stop");

describe("runFixIssues: issue rules", () => {
  it("green: commits on the branch, marks ready-for-review, then stops on an empty queue", async () => {
    const w = fakeWorld({ workers: [stream()], verifies: [verified("green")] });
    const result = await runFixIssues(w.deps, limits);
    expect(iterations(w.logs)[0]).toMatchObject({ stop_rule: "green", commit: "sha-fix", status_after: "ready-for-review", branch: "fix/ISSUE-001" });
    expect(iterations(w.logs)[0]?.exit_codes).toEqual({ typecheck: 0, lint: 0, test: 0, "check:secrets": 0 });
    expect(w.fixes).toHaveLength(1);
    expect(w.issues.get("ISSUE-001")?.status).toBe("ready-for-review");
    expect(w.progress().done).toEqual(["ISSUE-001"]);
    expect(result.stopRule).toBe("queue-empty");
    expect(w.removed).toBe(1);
  });

  it("green wins over the turn limit when the change passed on the last turn", async () => {
    const w = fakeWorld({ workers: [stream({ subtype: "error_max_turns", isError: true, turns: 30, code: 1 })], verifies: [verified("green")] });
    await runFixIssues(w.deps, limits);
    expect(iterations(w.logs)[0]?.stop_rule).toBe("green");
  });

  it("turn limit: escalates when the worker ran out of turns without going green", async () => {
    const w = fakeWorld({ workers: [stream({ subtype: "error_max_turns", isError: true, turns: 30, code: 1 })], verifies: [verified("fail")] });
    await runFixIssues(w.deps, limits);
    expect(iterations(w.logs)[0]).toMatchObject({ stop_rule: "turn-limit", num_turns: 30, max_turns: 30, status_after: "needs-human" });
    expect(w.escalations.get("ISSUE-001")).toContain("turn limit");
  });

  it("no diff: escalates with the worker's last message", async () => {
    const w = fakeWorld({ workers: [stream({ result: "The issue needs a decision." })], verifies: [verified("none")] });
    await runFixIssues(w.deps, limits);
    expect(iterations(w.logs)[0]).toMatchObject({ stop_rule: "no-diff", worker_message: "The issue needs a decision." });
    expect(w.fixes).toEqual([]);
  });

  it("repeated failure: the second identical fingerprint escalates; the retry got the verifier's evidence", async () => {
    const w = fakeWorld({ workers: [stream(), stream()], verifies: [verified("fail", "same"), verified("fail", "same")] });
    await runFixIssues(w.deps, limits);
    const its = iterations(w.logs);
    expect(its.map((l) => l.stop_rule)).toEqual([null, "repeated-failure"]);
    expect(its[1]).toMatchObject({ attempt: 2, fingerprint: "same", failing_step: "test" });
    expect(w.prompts[0]).not.toContain("<previous_attempt");
    expect(w.prompts[1]).toContain('<previous_attempt attempt="1">');
    expect(w.prompts[1]).toContain("npm run test -> exit 1");
    const summary = w.escalations.get("ISSUE-001") ?? "";
    for (const part of ["## What was tried", "## Evidence", "## Decision needed", "1. Attempt 1", "2. Attempt 2", "`npm run test` → exit 1"]) {
      expect(summary).toContain(part);
    }
  });

  it("max attempts: three different failures escalate on attempt 3", async () => {
    const w = fakeWorld({ workers: [stream(), stream(), stream()], verifies: [verified("fail", "a"), verified("fail", "b"), verified("fail", "c")] });
    await runFixIssues(w.deps, limits);
    expect(iterations(w.logs).map((l) => l.stop_rule)).toEqual([null, null, "max-attempts"]);
    expect(iterations(w.logs)[2]).toMatchObject({ attempts: 3, max_attempts: 3 });
  });

  it("protected path: escalates at once and never retries", async () => {
    const w = fakeWorld({ workers: [stream(), stream()], verifies: [verified("protected"), verified("green")] });
    await runFixIssues(w.deps, limits);
    expect(iterations(w.logs)).toHaveLength(1);
    expect(iterations(w.logs)[0]).toMatchObject({ stop_rule: "protected-path", paths: ["test/acceptance/x.test.ts"] });
  });

  it("worker error: escalates and counts $1.00 when the cost is missing", async () => {
    const w = fakeWorld({ workers: [crash()], verifies: [verified("none")] });
    const result = await runFixIssues(w.deps, limits);
    expect(iterations(w.logs)[0]).toMatchObject({ stop_rule: "worker-error", exit_code: 1, subtype: "no result", cost_missing: true });
    expect(result.runCostUsd).toBe(1);
  });

  it("per-call budget: error_max_budget_usd escalates the issue", async () => {
    const w = fakeWorld({ workers: [stream({ subtype: "error_max_budget_usd", isError: true, cost: 1.01, code: 1 })], verifies: [verified("fail")] });
    await runFixIssues(w.deps, limits);
    expect(iterations(w.logs)[0]).toMatchObject({ stop_rule: "budget", scope: "issue", threshold: 1 });
  });
});

describe("runFixIssues: run stops", () => {
  it("toggle off: stops before anything, commits nothing, calls no worker", async () => {
    const w = fakeWorld({ workers: [stream()], verifies: [verified("green")] });
    w.toggle.enabled = false;
    const result = await runFixIssues(w.deps, limits);
    expect(result).toMatchObject({ stopRule: "toggle-off", iterations: 0 });
    expect(runStop(w.logs)).toMatchObject({ stop_rule: "toggle-off", toggle_read: '{"enabled":false}' });
    expect(w.commits).toEqual([]);
    expect(w.prompts).toEqual([]);
  });

  it("reads the toggle before every iteration: switching it off mid-run stops at the next one", async () => {
    const w = fakeWorld({
      issues: [issue(1), issue(2)], workers: [stream(), stream()], verifies: [verified("green"), verified("green")],
      onIteration: (world) => (world.toggle.enabled = false),
    });
    const result = await runFixIssues(w.deps, limits);
    expect(result).toMatchObject({ stopRule: "toggle-off", iterations: 1 });
    expect(w.issues.get("ISSUE-002")?.status).toBe("open");
  });

  it("budget: stops the run once the summed cost reaches the cap", async () => {
    const w = fakeWorld({ issues: [issue(1), issue(2)], workers: [stream({ cost: 0.3 }), stream()], verifies: [verified("green"), verified("green")] });
    const result = await runFixIssues(w.deps, { ...limits, maxRunCostUsd: 0.25 });
    expect(result).toMatchObject({ stopRule: "budget", iterations: 1, runCostUsd: 0.3 });
    expect(runStop(w.logs)).toMatchObject({ threshold: 0.25, run_cost_usd: 0.3 });
  });

  it("max iterations: stops at the cap and leaves a half-done issue in-progress for the next run", async () => {
    const w = fakeWorld({ issues: [issue(1), issue(2)], workers: [stream(), stream()], verifies: [verified("green"), verified("fail")] });
    const result = await runFixIssues(w.deps, { ...limits, maxIterations: 2 });
    expect(result.stopRule).toBe("max-iterations");
    expect(runStop(w.logs)).toMatchObject({ max_iterations: 2, left_in_progress: ["ISSUE-002"] });
    expect(w.progress().next).toEqual(["ISSUE-002"]);
  });

  it("queue empty: never picks an issue without the auto-fix label", async () => {
    const w = fakeWorld({ issues: [issue(1, false)], workers: [], verifies: [] });
    const result = await runFixIssues(w.deps, limits);
    expect(result).toMatchObject({ stopRule: "queue-empty", iterations: 0 });
  });

  it("escalates an issue a crashed run left in-progress on its last attempt, instead of stranding it", async () => {
    const w = fakeWorld({ issues: [issue(1, true, "in-progress")], workers: [], verifies: [] });
    w.deps.saveProgress({ ...w.progress(), attempts: { "ISSUE-001": 3 } });
    const result = await runFixIssues(w.deps, limits);
    expect(w.logs[0]).toMatchObject({ event: "recovered", stop_rule: "max-attempts", interrupted: true, status_after: "needs-human" });
    expect(w.issues.get("ISSUE-001")?.status).toBe("needs-human");
    expect(w.escalations.get("ISSUE-001")).toContain("## Decision needed");
    expect(result.stopRule).toBe("queue-empty");
  });

  it("resumes an in-progress issue from progress.json with its attempt count", async () => {
    const w = fakeWorld({ issues: [issue(1, true, "in-progress")], workers: [stream()], verifies: [verified("green")] });
    w.deps.saveProgress({ ...w.progress(), attempts: { "ISSUE-001": 2 }, feedback: { "ISSUE-001": "npm run lint -> exit 1" } });
    await runFixIssues(w.deps, limits);
    expect(iterations(w.logs)[0]).toMatchObject({ attempt: 3, stop_rule: "green" });
    expect(w.prompts[0]).toContain("npm run lint -> exit 1");
  });
});
