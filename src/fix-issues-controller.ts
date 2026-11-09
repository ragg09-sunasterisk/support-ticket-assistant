// Part 9: the issue-fixing loop's controller (docs/loop-design.md, section 6). Plain code, no model: it
// checks the run stops, picks one issue, runs one worker in a fresh worktree, has the verifier judge it,
// applies the issue rules in order, writes state and one log line per iteration. Everything it touches
// comes in through `FixIssuesDeps`, so tests pass fakes for git, the worker and the verifier.
import { MISSING_COST_USD, type LoopLimits } from "./fix-issues-limits.ts";
import { renderEscalation } from "./fix-issues-escalation.ts";
import { decideIssue } from "./fix-issues-rules.ts";
import { verifierEvidence, type VerifierResult } from "./fix-issues-verifier.ts";
import { buildWorkerPrompt, runWorker } from "./fix-issues-worker.ts";
import { isPickable, pickNextIssue, type Issue, type IssueStatus, type Progress, type ToggleRead } from "./issue-files.ts";
import type { ClaudeRunner } from "./run-claude-process.ts";

export type RunStopRule = "toggle-off" | "budget" | "max-iterations" | "queue-empty";

export interface Workspace { dir: string }

export interface FixIssuesDeps {
  readToggle(): ToggleRead;
  loadIssues(): Issue[];
  loadProgress(): Progress;
  saveProgress(progress: Progress): void;
  setIssueStatus(issue: Issue, status: IssueStatus): void;
  writeEscalation(id: string, markdown: string): void;
  /** Commits the state files for this issue (or just the log, with null). Returns the SHA or null. */
  commitState(id: string | null, message: string): string | null;
  createWorkspace(branch: string): Workspace;
  removeWorkspace(ws: Workspace): void;
  runnerFor(ws: Workspace): ClaudeRunner;
  verify(ws: Workspace, full: boolean): VerifierResult;
  commitFix(ws: Workspace, message: string): string;
  log(record: Record<string, unknown>): void;
  branchFor(id: string): string;
}

export interface FixIssuesResult {
  stopRule: RunStopRule;
  iterations: number;
  runCostUsd: number;
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

export async function runFixIssues(deps: FixIssuesDeps, limits: LoopLimits, runId = new Date().toISOString()): Promise<FixIssuesResult> {
  const progress = deps.loadProgress();
  let iterations = 0;
  let runCost = 0;
  const stopRun = (stopRule: RunStopRule, compared: Record<string, unknown>): FixIssuesResult => {
    const left = deps.loadIssues().filter((i) => i.status === "in-progress").map((i) => i.id);
    deps.log({ run_id: runId, at: new Date().toISOString(), event: "run-stop", scope: "run", stop_rule: stopRule, ...compared,
      iterations, run_cost_usd: round(runCost), left_in_progress: left });
    return { stopRule, iterations, runCostUsd: round(runCost) };
  };

  // Recovery (review finding): a run that died during an issue's last allowed attempt (Ctrl-C, a kill, a
  // throw) leaves it in-progress with attempts == max: never picked again, never escalated. Escalate it now.
  if (deps.readToggle().enabled) {
    for (const stuck of deps.loadIssues().filter((i) => i.status === "in-progress" && !isPickable(i, progress, limits.maxAttempts))) {
      const id = stuck.id;
      const compared = { attempts: progress.attempts[id] ?? 0, max_attempts: limits.maxAttempts, interrupted: true };
      progress.needs_human.push(id);
      deps.writeEscalation(id, renderEscalation({ id, title: stuck.title, rule: "max-attempts", compared, branch: deps.branchFor(id), history: progress.history[id] ?? [] }));
      deps.saveProgress(progress);
      deps.setIssueStatus(stuck, "needs-human");
      deps.log({ run_id: runId, at: new Date().toISOString(), event: "recovered", issue: id, stop_rule: "max-attempts", scope: "issue", ...compared, status_after: "needs-human" });
      deps.commitState(id, `chore(loop): ${id} -> needs-human (max-attempts, interrupted run)`);
    }
  }

  for (;;) {
    // Run stops, in section 6's order. The toggle is read again before every iteration.
    const toggle = deps.readToggle();
    if (!toggle.enabled) return stopRun("toggle-off", { toggle_read: toggle.read });
    if (runCost >= limits.maxRunCostUsd) return stopRun("budget", { threshold: limits.maxRunCostUsd });
    if (iterations >= limits.maxIterations) return stopRun("max-iterations", { max_iterations: limits.maxIterations });
    const issues = deps.loadIssues();
    const issue = pickNextIssue(issues, progress, limits.maxAttempts);
    if (!issue) return stopRun("queue-empty", { labelled: issues.filter((i) => i.autoFix).map((i) => `${i.id}:${i.status}`) });

    iterations++;
    const id = issue.id;
    if (issue.status === "open") {
      // A fresh start (also after a person reopened it): earlier attempts no longer count.
      progress.attempts[id] = 0;
      progress.last_fingerprint[id] = null;
      delete progress.feedback[id];
      progress.history[id] = [];
      for (const list of [progress.done, progress.needs_human]) if (list.includes(id)) list.splice(list.indexOf(id), 1);
    }
    const attempt = (progress.attempts[id] ?? 0) + 1;
    progress.attempts[id] = attempt;
    deps.saveProgress(progress);
    deps.setIssueStatus(issue, "in-progress");
    deps.commitState(id, `chore(loop): ${id} attempt ${attempt} -> in-progress`);

    const branch = deps.branchFor(id);
    const started = Date.now();
    const ws = deps.createWorkspace(branch);
    try {
      const prompt = buildWorkerPrompt(issue, attempt, progress.feedback[id]);
      const worker = await runWorker(deps.runnerFor(ws), prompt, limits);
      runCost += worker.costUsd ?? MISSING_COST_USD;
      const crashed = worker.exitCode !== 0 && worker.subtype === "no result";
      const verifier = deps.verify(ws, !crashed);
      const decision = decideIssue(worker, verifier, attempt, progress.last_fingerprint[id], limits);

      let status: IssueStatus = "in-progress";
      let commit: string | null = null;
      if (decision.action === "commit") {
        commit = deps.commitFix(ws, `fix(${id}): ${issue.title}\n\nMade by npm run fix-issues, attempt ${attempt}; npm run check green in the verifier.`);
        status = "ready-for-review";
      } else if (decision.action === "escalate") {
        status = "needs-human";
      }
      const outcome = decision.rule ?? `retry (${verifier.failingStep ?? "no failing step"} failed)`;
      const history = progress.history[id] ?? [];
      history.push({
        attempt, turns: worker.turns, cost_usd: worker.costUsd, files_changed: verifier.changedFiles, diff_stat: verifier.diffStat,
        check: Object.fromEntries(verifier.steps.map((s) => [s.step, s.exitCode])), failing_step: verifier.failingStep,
        failing_detail: verifier.failingDetail, fingerprint: verifier.fingerprint, outcome, worker_message: worker.lastMessage,
      });
      progress.history[id] = history;
      if (verifier.fingerprint !== null) progress.last_fingerprint[id] = verifier.fingerprint;
      if (decision.action === "retry") progress.feedback[id] = verifierEvidence(verifier);
      else delete progress.feedback[id];
      if (status === "ready-for-review") progress.done.push(id);
      if (status === "needs-human") {
        progress.needs_human.push(id);
        deps.writeEscalation(id, renderEscalation({ id, title: issue.title, rule: decision.rule ?? "max-attempts", compared: decision.compared, branch, history }));
      }
      const after = deps.loadIssues().map((i) => (i.id === id ? { ...i, status } : i));
      progress.next = after.filter((i) => isPickable(i, progress, limits.maxAttempts)).map((i) => i.id);
      deps.saveProgress(progress);
      deps.setIssueStatus(issue, status);

      deps.log({
        run_id: runId, at: new Date().toISOString(), event: "iteration", iteration: iterations, issue: id, attempt, branch,
        worker: { exit_code: worker.exitCode, subtype: worker.subtype, is_error: worker.isError, turns: worker.turns,
          cost_usd: worker.costUsd, duration_ms: worker.durationMs },
        check: Object.fromEntries(verifier.steps.map((s) => [s.step, s.exitCode])),
        changed_files: verifier.changedFiles, protected_paths: verifier.protectedPaths, diff_stat: verifier.diffStat,
        failing_step: verifier.failingStep, failing: verifier.failingDetail.slice(0, 20), fingerprint: verifier.fingerprint,
        ...(decision.rule ? { stop_rule: decision.rule, scope: "issue", ...decision.compared } : { stop_rule: null, retry: true }),
        commit, status_after: status, run_cost_usd: round(runCost), iteration_ms: Date.now() - started,
      });
      deps.commitState(id, `chore(loop): ${id} -> ${status}${decision.rule ? ` (${decision.rule})` : ""}`);
    } finally {
      deps.removeWorkspace(ws);
    }
  }
}
