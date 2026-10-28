// Turns a golden-format eval set (evals/golden.jsonl, evals/held-out.jsonl) into promptfoo test
// cases: three code graders plus an llm-rubric grader for escalation_reason.
import type { ApiProvider, TestCase } from "promptfoo";
import type { Ticket } from "./claude-ticket-client.ts";
import { escalationRubric, escalationSection } from "./escalation-rubric.ts";
import type { GoldenCase } from "./golden-set.ts";
import { gradeLabel, gradeSchema, METRICS } from "./triage-graders.ts";

export interface EvalSet {
  name: string; // "golden" or "held-out"
  cases: GoldenCase[];
}

export interface CaseMetadata {
  set: string;
  ticketId: string;
  caseType: GoldenCase["case_type"];
  expected: GoldenCase["expected"];
}

export function buildTestCases(sets: EvalSet[], tickets: Map<string, Ticket>, judge: ApiProvider): TestCase[] {
  const section = escalationSection();
  return sets.flatMap(({ name, cases }) =>
    cases.map((c): TestCase => {
      const ticket = tickets.get(c.id);
      if (!ticket) throw new Error(`${name}: ticket ${c.id} not found`);
      const metadata: CaseMetadata = { set: name, ticketId: c.id, caseType: c.case_type, expected: c.expected };
      return {
        description: `${name} ${c.id} (${c.case_type})`,
        vars: { ticket_id: c.id },
        metadata,
        assert: [
          { type: "javascript", metric: METRICS.schema, value: (output: string) => gradeSchema(output) },
          { type: "javascript", metric: METRICS.category, value: (output: string) => gradeLabel(output, c.expected, "category") },
          { type: "javascript", metric: METRICS.severity, value: (output: string) => gradeLabel(output, c.expected, "severity") },
          // promptfoo renders assertion values with Nunjucks; raw keeps "{{" or "{%" in merchant text literal.
          { type: "llm-rubric", metric: METRICS.escalation, value: `{% raw %}${escalationRubric(ticket, section)}{% endraw %}`, provider: judge },
        ],
      };
    }),
  );
}
