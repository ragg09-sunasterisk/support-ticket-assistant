// Part 9: the issue-scope stop rules, in the order section 6 of docs/loop-design.md gives them (first match
// wins). Pure: it reads the worker's result, the verifier's result and the progress counters, and returns
// what to do plus the values it compared, which go into the log line as they are.
import { isWorkerError, type WorkerResult } from "./fix-issues-worker.ts";
import type { VerifierResult } from "./fix-issues-verifier.ts";
import type { LoopLimits } from "./fix-issues-limits.ts";

export type IssueStopRule =
  | "worker-error" | "protected-path" | "green" | "turn-limit" | "budget" | "no-diff" | "repeated-failure" | "max-attempts";

export interface IssueDecision {
  /** null: no rule fired; the issue stays in-progress and is retried with the verifier's evidence. */
  rule: IssueStopRule | null;
  action: "commit" | "escalate" | "retry";
  /** The values the rule compared, logged with it. */
  compared: Record<string, unknown>;
}

export function decideIssue(
  worker: WorkerResult, verifier: VerifierResult, attempt: number, lastFingerprint: string | null | undefined, limits: LoopLimits,
): IssueDecision {
  const escalate = (rule: IssueStopRule, compared: Record<string, unknown>): IssueDecision => ({ rule, action: "escalate", compared });
  if (isWorkerError(worker)) {
    return escalate("worker-error", {
      exit_code: worker.exitCode, subtype: worker.subtype, is_error: worker.isError, stderr_tail: worker.stderrTail,
      cost_missing: worker.costUsd === null,
    });
  }
  if (verifier.protectedPaths.length > 0) return escalate("protected-path", { paths: verifier.protectedPaths });
  if (verifier.green) {
    const codes = Object.fromEntries(verifier.steps.map((s) => [s.step, s.exitCode]));
    return { rule: "green", action: "commit", compared: { exit_codes: codes } };
  }
  // Checked after green, so a change that went green on its last turn still ships.
  if (worker.subtype === "error_max_turns") {
    return escalate("turn-limit", { num_turns: worker.turns, subtype: worker.subtype, max_turns: limits.maxTurns });
  }
  if (worker.subtype === "error_max_budget_usd") {
    return escalate("budget", { scope: "issue", subtype: worker.subtype, cost_usd: worker.costUsd, threshold: limits.maxCallCostUsd });
  }
  if (verifier.changedFiles.length === 0) return escalate("no-diff", { worker_message: worker.lastMessage.slice(0, 500) });
  if (verifier.fingerprint !== null && verifier.fingerprint === lastFingerprint) {
    return escalate("repeated-failure", {
      fingerprint: verifier.fingerprint, failing_step: verifier.failingStep, failing: verifier.failingDetail.slice(0, 20),
    });
  }
  if (attempt >= limits.maxAttempts) return escalate("max-attempts", { attempts: attempt, max_attempts: limits.maxAttempts });
  return { rule: null, action: "retry", compared: { attempts: attempt, max_attempts: limits.maxAttempts } };
}
