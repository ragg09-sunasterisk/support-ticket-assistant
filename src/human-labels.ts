// evals/human-labels.jsonl: v2 cases where a person checks the escalation_reason model grader.
// `human` is null until the course owner fills it in: true = escalation_reason follows the handbook
// table, false = it does not. Agreement is how often the model grader's pass/fail matches.
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { EvalRow } from "./regression-table.ts";
import { TicketTriage } from "./ticket-triage-schema.ts";
import { METRICS } from "./triage-graders.ts";

export const HumanLabel = z.object({
  ticketId: z.string(),
  set: z.string(),
  caseType: z.string(),
  promptVersion: z.string(),
  triage: TicketTriage.nullable(),
  modelGrader: z.object({ pass: z.boolean(), reason: z.string() }),
  human: z.boolean().nullable(),
});

export type HumanLabel = z.infer<typeof HumanLabel>;

export interface Agreement {
  total: number;
  labelled: number;
  agree: number;
  disagreements: HumanLabel[];
}

export function toHumanLabel(row: EvalRow): HumanLabel {
  const { pass, reason } = row.graders[METRICS.escalation];
  return {
    ticketId: row.ticketId,
    set: row.set,
    caseType: row.caseType,
    promptVersion: row.promptVersion,
    triage: row.triage,
    modelGrader: { pass, reason },
    human: null,
  };
}

export function loadHumanLabels(path: string): HumanLabel[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.trim() !== "")
    .map(({ line, lineNumber }) => {
      let json: unknown;
      try {
        json = JSON.parse(line);
      } catch {
        throw new Error(`${path}:${lineNumber}: not valid JSON (check quotes and commas after editing)`);
      }
      const parsed = HumanLabel.safeParse(json);
      if (!parsed.success) throw new Error(`${path}:${lineNumber}: ${z.prettifyError(parsed.error)}`);
      return parsed.data;
    });
}

export function agreement(labels: HumanLabel[]): Agreement {
  const labelled = labels.filter((l) => l.human !== null);
  const disagreements = labelled.filter((l) => l.modelGrader.pass !== l.human);
  return { total: labels.length, labelled: labelled.length, agree: labelled.length - disagreements.length, disagreements };
}
