// Loads the golden set (evals/golden.jsonl) and scores triage results against its expected labels.
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { TriageResult } from "./ticket-triage-client.ts";
import { TicketTriage } from "./ticket-triage-schema.ts";

export const GoldenCase = z.object({
  id: z.string(),
  case_type: z.enum(["normal", "edge", "ambiguous", "injection", "should_abstain"]),
  expected: TicketTriage.pick({ category: true, severity: true }),
});

export type GoldenCase = z.infer<typeof GoldenCase>;

export interface ScoredCase {
  golden: GoldenCase;
  result: TriageResult;
  categoryCorrect: boolean;
  severityCorrect: boolean;
}

export interface GoldenSummary {
  total: number;
  valid: number;
  categoryCorrect: number;
  severityCorrect: number;
}

// A bad line throws with its line number: a broken answer key should stop the run, not skew it.
export function loadGoldenCases(path: string): GoldenCase[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.trim() !== "")
    .map(({ line, lineNumber }) => {
      let json: unknown;
      try {
        json = JSON.parse(line);
      } catch {
        throw new Error(`${path}:${lineNumber}: not valid JSON`);
      }
      const parsed = GoldenCase.safeParse(json);
      if (!parsed.success) throw new Error(`${path}:${lineNumber}: ${z.prettifyError(parsed.error)}`);
      return parsed.data;
    });
}

// No valid triage counts as wrong on both labels.
export function scoreCase(golden: GoldenCase, result: TriageResult): ScoredCase {
  return {
    golden,
    result,
    categoryCorrect: result.ok && result.triage.category === golden.expected.category,
    severityCorrect: result.ok && result.triage.severity === golden.expected.severity,
  };
}

export function summarize(scored: ScoredCase[]): GoldenSummary {
  return {
    total: scored.length,
    valid: scored.filter((s) => s.result.ok).length,
    categoryCorrect: scored.filter((s) => s.categoryCorrect).length,
    severityCorrect: scored.filter((s) => s.severityCorrect).length,
  };
}
