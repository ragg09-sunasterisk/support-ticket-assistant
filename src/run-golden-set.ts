// Part 2 lab: triage every golden-set ticket, print per-case results, report Zod pass count and
// accuracy, and append the run to a JSONL log (one line per case plus one summary line).
//
//   npm run golden -- [--golden evals/golden.jsonl] [--log logs/part-02-golden-run.jsonl]
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { loadTickets } from "./claude-ticket-client.ts";
import { loadGoldenCases, scoreCase, summarize, type ScoredCase } from "./golden-set.ts";
import { triageTicket } from "./ticket-triage-client.ts";
import { TRIAGE_PROMPT_VERSION } from "./triage-prompt.ts";

const { values } = parseArgs({
  options: {
    golden: { type: "string", default: "evals/golden.jsonl" },
    tickets: { type: "string", default: "data/tickets.jsonl" },
    log: { type: "string", default: "logs/part-02-golden-run.jsonl" },
  },
});

const cases = loadGoldenCases(values.golden);
const tickets = new Map(loadTickets(values.tickets).map((t) => [t.id, t]));
const missing = cases.filter((c) => !tickets.has(c.id)).map((c) => c.id);
if (missing.length > 0) {
  console.error(`Golden ids not found in ${values.tickets}: ${missing.join(", ")}`);
  process.exit(1);
}

const runId = randomUUID();
const startedAt = new Date().toISOString();
mkdirSync(dirname(values.log), { recursive: true });
const log = (entry: object) => appendFileSync(values.log, JSON.stringify({ runId, ...entry }) + "\n");

console.log(`Golden run ${runId}: ${cases.length} cases, prompt ${TRIAGE_PROMPT_VERSION}, log ${values.log}\n`);

const mark = (correct: boolean) => (correct ? "ok " : "MISS");
const scored: ScoredCase[] = [];
let totalCost = 0;
for (const [index, golden] of cases.entries()) {
  // Sequential on purpose: it keeps the seat's rate limits out of the results.
  const result = await triageTicket(tickets.get(golden.id)!);
  const s = scoreCase(golden, result);
  scored.push(s);
  totalCost += result.estimatedCostUsd ?? 0;

  const label = `[${String(index + 1).padStart(2)}/${cases.length}] ${golden.id} ${golden.case_type.padEnd(14)}`;
  const want = `${golden.expected.category}/${golden.expected.severity}`;
  if (result.ok) {
    const { category, severity, confidence } = result.triage;
    console.log(
      `${label} category ${mark(s.categoryCorrect)} severity ${mark(s.severityCorrect)} ` +
        `got ${category}/${severity} (conf ${confidence}) want ${want}`,
    );
  } else {
    console.log(`${label} NO VALID TRIAGE (${result.reason}) want ${want}`);
  }
  log({
    timestamp: new Date().toISOString(),
    kind: "case",
    promptVersion: TRIAGE_PROMPT_VERSION,
    ticketId: golden.id,
    caseType: golden.case_type,
    expected: golden.expected,
    ...result,
    categoryCorrect: s.categoryCorrect,
    severityCorrect: s.severityCorrect,
  });
}

const summary = summarize(scored);
const pct = (n: number) => `${((n / summary.total) * 100).toFixed(0)}%`;
log({
  timestamp: new Date().toISOString(),
  kind: "summary",
  startedAt,
  promptVersion: TRIAGE_PROMPT_VERSION,
  ...summary,
  estimatedCostUsd: Number(totalCost.toFixed(6)),
});

console.log(`\nPassed Zod validation: ${summary.valid}/${summary.total}`);
console.log(`Category accuracy:     ${summary.categoryCorrect}/${summary.total} (${pct(summary.categoryCorrect)})`);
console.log(`Severity accuracy:     ${summary.severityCorrect}/${summary.total} (${pct(summary.severityCorrect)})`);
console.log(`Estimated total cost:  $${totalCost.toFixed(6)}`);
// Accuracy is information for now. Only an invalid output fails the run.
if (summary.valid < summary.total) process.exitCode = 1;
