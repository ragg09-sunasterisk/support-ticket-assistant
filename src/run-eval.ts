// Part 3 lab: evaluate triage prompt versions with promptfoo on the golden and held-out sets, then
// write the per-case results and the regression table.
//
//   npm run eval -- [--prompts v1,v2] [--concurrency 4]
//
// Runs on the Team seat through `claude -p`. promptfoo telemetry and update checks are turned off,
// results are not written to promptfoo's database, and nothing is shared. Note: promptfoo 0.125.1
// still sends one "telemetry disabled" event per run; no setting stops it (see logs/part-03-step-log.md).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { loadTickets } from "./claude-ticket-client.ts";
import { loadGoldenCases } from "./golden-set.ts";
import { buildRegressionTable } from "./regression-table.ts";
import { loadTriagePrompt } from "./triage-prompt.ts";

const { values } = parseArgs({
  options: {
    prompts: { type: "string", default: "v1,v2" },
    concurrency: { type: "string", default: "4" },
    golden: { type: "string", default: "evals/golden.jsonl" },
    "held-out": { type: "string", default: "evals/held-out.jsonl" },
    tickets: { type: "string", default: "data/tickets.jsonl" },
    results: { type: "string", default: "evals/eval-results.jsonl" },
    table: { type: "string", default: "evals/regression-table.md" },
  },
});

// Must be set before promptfoo loads, hence the dynamic import below.
process.env.PROMPTFOO_DISABLE_TELEMETRY = "1";
process.env.PROMPTFOO_DISABLE_UPDATE = "1";
process.env.PROMPTFOO_DISABLE_SHARING = "1";
const { runTriageEval } = await import("./triage-eval.ts");

const versions = values.prompts.split(",").map((v) => v.trim());
if (versions.length !== 2 || versions[0] === versions[1]) {
  console.error(`--prompts needs two different versions to compare, e.g. v1,v2. Got "${values.prompts}"`);
  process.exit(1);
}
const concurrency = Number(values.concurrency);
if (!Number.isInteger(concurrency) || concurrency < 1) {
  console.error(`--concurrency must be a positive integer, got "${values.concurrency}"`);
  process.exit(1);
}
const prompts = versions.map((v) => loadTriagePrompt(v));
const sets = [
  { name: "golden", cases: loadGoldenCases(values.golden) },
  { name: "held-out", cases: loadGoldenCases(values["held-out"]) },
];
// The held-out set only means something if v2 never saw it while being tuned on the golden set.
const goldenIds = new Set(sets[0]!.cases.map((c) => c.id));
const overlap = sets[1]!.cases.filter((c) => goldenIds.has(c.id)).map((c) => c.id);
if (overlap.length > 0) {
  console.error(`Held-out cases also in the golden set: ${overlap.join(", ")}`);
  process.exit(1);
}

const caseCount = sets.reduce((n, s) => n + s.cases.length, 0);
console.log(
  `Eval: ${prompts.map((p) => p.version).join(" vs ")} over ${caseCount} cases ` +
    `(${sets.map((s) => `${s.name} ${s.cases.length}`).join(", ")}), concurrency ${values.concurrency}.`,
);
console.log(`About ${caseCount * prompts.length * 2} claude -p calls (triage + judge). Expect several minutes.\n`);

const startedAt = Date.now();
const rows = await runTriageEval({
  prompts,
  sets,
  tickets: loadTickets(values.tickets),
  maxConcurrency: concurrency,
});

for (const path of [values.results, values.table]) mkdirSync(dirname(path), { recursive: true });
writeFileSync(values.results, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
const table = buildRegressionTable(rows, [prompts[0]!.version, prompts[1]!.version], new Date().toISOString());
writeFileSync(values.table, table);

console.log(table);
console.log(`Per-case results: ${values.results}`);
console.log(`Regression table: ${values.table}`);
console.log(`Took ${((Date.now() - startedAt) / 60_000).toFixed(1)} min.`);
