// Part 9: the two arms of `npm run loop-compare`, plus a checks-only mode that proves each hidden check
// fails on the base commit (and passes with a reference patch). Every worker runs in a throwaway worktree
// without scripts/issue-checks/; the checks are copied in only to score. Same prompt, flags and limits.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runFixIssues } from "./fix-issues-controller.ts";
import { createWorkerWorktree, removeWorkerWorktree } from "./fix-issues-git.ts";
import { DEFAULT_LIMITS, MISSING_COST_USD } from "./fix-issues-limits.ts";
import { realDeps, WORKER_TIMEOUT_MS } from "./fix-issues-real-deps.ts";
import { decideIssue } from "./fix-issues-rules.ts";
import { verifyWorktree } from "./fix-issues-verifier.ts";
import { buildWorkerPrompt, runWorker } from "./fix-issues-worker.ts";
import { loadIssues, type Issue } from "./issue-files.ts";
import { mentionsIssueChecks, runHiddenCheck } from "./issue-check-scorer.ts";
import type { IssueOutcome } from "./loop-compare-report.ts";
import { runClaudeProcess } from "./run-claude-process.ts";

export interface ArmOptions {
  root: string;
  base: string;
  issues: Issue[];
  runId: string;
  log: (record: Record<string, unknown>) => void;
}

export async function runOneShotArm(o: ArmOptions): Promise<IssueOutcome[]> {
  const outcomes: IssueOutcome[] = [];
  for (const issue of o.issues) {
    const wt = createWorkerWorktree(o.root, { ref: o.base });
    try {
      const started = Date.now();
      const runner = (args: string[], input: string) => runClaudeProcess(args, input, WORKER_TIMEOUT_MS, wt.dir);
      const worker = await runWorker(runner, buildWorkerPrompt(issue, 1, undefined), DEFAULT_LIMITS);
      const verifier = verifyWorktree(wt.dir, !(worker.exitCode !== 0 && worker.subtype === "no result"));
      const wallMs = Date.now() - started;
      const hidden = runHiddenCheck(wt.dir, issue.id, o.base);
      const outcome: IssueOutcome = {
        kind: "outcome", run_id: o.runId, arm: "one-shot", base: o.base, issue: issue.id,
        resolved: verifier.green && hidden.pass && !mentionsIssueChecks(worker.stdout), green: verifier.green, hidden_check: hidden.pass, worker_calls: 1,
        turns: worker.turns ?? 0, cost_usd: worker.costUsd ?? 0, cost_missing: worker.costUsd === null ? 1 : 0, wall_ms: wallMs,
        stop_rule: decideIssue(worker, verifier, 1, null, DEFAULT_LIMITS).rule, status: verifier.green ? "green" : "not green",
        transcript_mentions_issue_checks: mentionsIssueChecks(worker.stdout), changed_files: verifier.changedFiles,
      };
      o.log({ ...outcome, hidden_detail: hidden.detail, check: Object.fromEntries(verifier.steps.map((s) => [s.step, s.exitCode])),
        failing: verifier.failingDetail.slice(0, 10), protected_paths: verifier.protectedPaths, subtype: worker.subtype });
      console.log(`one-shot ${issue.id}: ${outcome.resolved ? "RESOLVED" : "not resolved"} (green ${verifier.green}, hidden ${hidden.pass}) ` +
        `${outcome.turns} turns $${outcome.cost_usd.toFixed(2)} ${(wallMs / 60_000).toFixed(1)} min`);
      outcomes.push(outcome);
    } finally {
      removeWorkerWorktree(o.root, wt);
    }
  }
  return outcomes;
}

/** Fresh copies of the issues for the loop arm: status open, auto-fix on, toggle on, no progress. */
function seedIssues(dir: string, issues: Issue[]): void {
  mkdirSync(join(dir, "issues"), { recursive: true });
  for (const issue of issues) writeFileSync(join(dir, "issues", `${issue.id}.md`), `---\nid: ${issue.id}\nstatus: open\nauto-fix: true\n---\n${issue.body}\n`);
  writeFileSync(join(dir, "issues", "auto-fix.json"), '{ "enabled": true }\n');
}

export async function runLoopArm(o: ArmOptions & { maxLoopCostUsd: number }): Promise<IssueOutcome[]> {
  const arm = createWorkerWorktree(o.root, { ref: o.base });
  const prefix = `loop-compare/${o.runId.replace(/[^0-9A-Za-z]/g, "")}/`;
  const records: Record<string, unknown>[] = [];
  const flagged = new Set<string>();
  try {
    // A run of its own: the arm's checkout gets fresh issue files, so nothing it inherits from HEAD counts.
    execFileSync("git", ["rm", "-r", "-q", "--ignore-unmatch", "--cached", "issues"], { cwd: arm.dir });
    seedIssues(arm.dir, o.issues);
    const deps = realDeps({
      // Workers start from the base commit, like one-shot: no issues/, progress or log in their tree.
      root: arm.dir, branchPrefix: prefix, workerBase: o.base, logPath: join(arm.dir, "logs", "part-09-fix-issues.jsonl"),
      wrapRunner: (runner, branch) => async (args, input) => {
        const out = await runner(args, input);
        if (mentionsIssueChecks(out.stdout)) flagged.add(branch.slice(prefix.length));
        return out;
      },
      onLog: (r) => {
        records.push(r);
        o.log({ kind: "loop-record", run_id: o.runId, arm: "loop", record: r });
        if (r.event === "iteration") console.log(`loop ${String(r.issue)} attempt ${String(r.attempt)}: ${String(r.stop_rule ?? "retry")} -> ${String(r.status_after)}`);
        else console.log(`loop run stop: ${String(r.stop_rule)}`);
      },
    });
    const iterations = () => records.filter((r) => r.event === "iteration") as { issue: string; worker: { turns: number | null; cost_usd: number | null }; iteration_ms: number; stop_rule: string | null; changed_files: string[] }[];
    const spent = () => iterations().reduce((n, r) => n + (r.worker.cost_usd ?? MISSING_COST_USD), 0);
    // Several runs (10 iterations each) until the queue is empty or the arm's cost cap is reached.
    for (let run = 0; run < 10 && spent() < o.maxLoopCostUsd; run++) {
      const result = await runFixIssues(deps, { ...DEFAULT_LIMITS, maxRunCostUsd: Math.min(DEFAULT_LIMITS.maxRunCostUsd, o.maxLoopCostUsd - spent()) });
      if (result.stopRule === "queue-empty" || result.stopRule === "toggle-off" || result.iterations === 0) break;
    }
    const final = new Map(loadIssues(join(arm.dir, "issues")).map((i) => [i.id, i.status]));
    const outcomes: IssueOutcome[] = [];
    for (const issue of o.issues) {
      const its = iterations().filter((r) => r.issue === issue.id);
      const status = final.get(issue.id) ?? "?";
      let hidden: { pass: boolean; detail: string } | null = null;
      if (status === "ready-for-review") {
        const wt = createWorkerWorktree(o.root, { ref: `${prefix}${issue.id}` });
        try {
          hidden = runHiddenCheck(wt.dir, issue.id, o.base);
        } finally {
          removeWorkerWorktree(o.root, wt);
        }
      }
      const outcome: IssueOutcome = {
        kind: "outcome", run_id: o.runId, arm: "loop", base: o.base, issue: issue.id,
        // A transcript that names the hidden checks can't count as resolved, whatever the check says.
        resolved: status === "ready-for-review" && hidden?.pass === true && !flagged.has(issue.id), green: status === "ready-for-review", hidden_check: hidden?.pass ?? null,
        worker_calls: its.length, turns: its.reduce((n, r) => n + (r.worker.turns ?? 0), 0),
        cost_usd: its.reduce((n, r) => n + (r.worker.cost_usd ?? 0), 0), cost_missing: its.filter((r) => r.worker.cost_usd === null).length,
        wall_ms: its.reduce((n, r) => n + r.iteration_ms, 0), stop_rule: its.at(-1)?.stop_rule ?? null, status,
        transcript_mentions_issue_checks: flagged.has(issue.id), changed_files: its.at(-1)?.changed_files ?? [],
      };
      o.log({ ...outcome, hidden_detail: hidden?.detail ?? null });
      console.log(`loop ${issue.id}: ${outcome.resolved ? "RESOLVED" : "not resolved"} (${status}, hidden ${hidden?.pass ?? "-"})`);
      outcomes.push(outcome);
    }
    return outcomes;
  } finally {
    removeWorkerWorktree(o.root, arm);
    const branches = execFileSync("git", ["branch", "--list", `${prefix}*`, "--format=%(refname:short)"], { cwd: o.root, encoding: "utf8" }).split("\n").filter(Boolean);
    if (branches.length > 0) execFileSync("git", ["branch", "-D", ...branches], { cwd: o.root });
  }
}
