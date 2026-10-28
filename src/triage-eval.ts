// Runs the triage eval through promptfoo's Node API: every prompt version over every eval set,
// graded by the code graders and the escalation llm-rubric. Returns one row per (version, case).
//
// Import this module only after turning promptfoo telemetry off (see src/run-eval.ts): promptfoo
// reads PROMPTFOO_DISABLE_TELEMETRY when it loads.
import { evaluate, type EvaluateResult } from "promptfoo";
import type { Ticket } from "./claude-ticket-client.ts";
import { ClaudeJudgeProvider, ClaudeTriageProvider } from "./claude-eval-providers.ts";
import { buildTestCases, type CaseMetadata, type EvalSet } from "./eval-test-cases.ts";
import type { EvalRow, Metric } from "./regression-table.ts";
import type { ClaudeRunner } from "./run-claude-process.ts";
import { METRICS, parseTriage } from "./triage-graders.ts";
import type { TriagePrompt } from "./triage-prompt.ts";

export interface TriageEvalOptions {
  prompts: TriagePrompt[];
  sets: EvalSet[];
  tickets: Ticket[];
  maxConcurrency?: number;
  triageRun?: ClaudeRunner; // tests pass fakes; the default is the real `claude -p`
  judgeRun?: ClaudeRunner;
}

export async function runTriageEval(options: TriageEvalOptions): Promise<EvalRow[]> {
  const judge = new ClaudeJudgeProvider(options.judgeRun);
  const tickets = new Map(options.tickets.map((t) => [t.id, t]));
  const evalRecord = await evaluate(
    {
      // Each prompt is the system prompt text; the provider adds the ticket from the test vars.
      prompts: options.prompts.map((p) => ({ raw: p.text, label: p.version })),
      providers: [new ClaudeTriageProvider(options.tickets, options.triageRun)],
      tests: buildTestCases(options.sets, tickets, judge),
      writeLatestResults: false, // no local results database, and nothing to share
      sharing: false,
    },
    { maxConcurrency: options.maxConcurrency ?? 4, cache: false, showProgressBar: false },
  );
  const summary = await evalRecord.toEvaluateSummary();
  return summary.results.map((r) => toEvalRow(r as EvaluateResult));
}

export function toEvalRow(result: EvaluateResult): EvalRow {
  const meta = result.testCase.metadata as CaseMetadata;
  const output = typeof result.response?.output === "string" ? result.response.output : "";
  const parsed = parseTriage(output);
  const components = result.gradingResult?.componentResults ?? [];
  const grader = (metric: Metric) => {
    const found = components.find((c) => c.assertion?.metric === metric);
    // A provider error means promptfoo graded nothing: count every grader as failed.
    return found
      ? { pass: found.pass, reason: found.reason }
      : { pass: false, reason: result.error ?? result.response?.error ?? "not graded" };
  };
  return {
    set: meta.set,
    promptVersion: result.prompt.label,
    ticketId: meta.ticketId,
    caseType: meta.caseType,
    expected: meta.expected,
    triage: parsed.ok ? parsed.triage : null,
    graders: {
      [METRICS.schema]: grader(METRICS.schema),
      [METRICS.category]: grader(METRICS.category),
      [METRICS.severity]: grader(METRICS.severity),
      [METRICS.escalation]: grader(METRICS.escalation),
    },
  };
}
