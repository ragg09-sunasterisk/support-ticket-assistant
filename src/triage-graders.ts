// Code graders for the promptfoo eval. Each one reads the provider's output string (the triage as
// JSON, or "NO VALID TRIAGE: <reason>") and returns a promptfoo grading result. No model calls.
import { z } from "zod";
import type { GoldenCase } from "./golden-set.ts";
import { TicketTriage } from "./ticket-triage-schema.ts";

export interface GraderResult {
  pass: boolean;
  score: number;
  reason: string;
}

// The metric names double as the regression-table columns.
export const METRICS = {
  schema: "schema_valid",
  category: "category_correct",
  severity: "severity_correct",
  escalation: "escalation_pass",
} as const;

export const NO_VALID_TRIAGE = "NO VALID TRIAGE";

// promptfoo records a failed judge call as a normal fail; this marker lets the table count it apart.
export const JUDGE_ERROR = "judge failed";

export function parseTriage(output: string): { ok: true; triage: TicketTriage } | { ok: false; reason: string } {
  if (output.startsWith(NO_VALID_TRIAGE)) return { ok: false, reason: output };
  let json: unknown;
  try {
    json = JSON.parse(output);
  } catch {
    return { ok: false, reason: `output is not JSON: ${output.slice(0, 120)}` };
  }
  const parsed = TicketTriage.safeParse(json);
  return parsed.success ? { ok: true, triage: parsed.data } : { ok: false, reason: z.prettifyError(parsed.error) };
}

const result = (pass: boolean, reason: string): GraderResult => ({ pass, score: pass ? 1 : 0, reason });

export function gradeSchema(output: string): GraderResult {
  const parsed = parseTriage(output);
  return parsed.ok ? result(true, "passes the TicketTriage schema") : result(false, parsed.reason);
}

export function gradeLabel(output: string, expected: GoldenCase["expected"], field: "category" | "severity"): GraderResult {
  const parsed = parseTriage(output);
  if (!parsed.ok) return result(false, `no valid triage, so no ${field}`);
  const got = parsed.triage[field];
  const want = expected[field];
  return result(got === want, got === want ? `${field} ${got}` : `${field} ${got}, expected ${want}`);
}
