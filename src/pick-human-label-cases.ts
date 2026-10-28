// Part 3 lab: copy chosen v2 cases from the last eval run into evals/human-labels.jsonl, with
// "human": null for a person to fill in. Refuses to overwrite a file that already has labels.
//
//   npm run human-labels -- --ids TCK-1002,TCK-1014,TCK-1040,... [--prompt v2]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { agreement, loadHumanLabels, toHumanLabel } from "./human-labels.ts";
import type { EvalRow } from "./regression-table.ts";

const { values } = parseArgs({
  options: {
    ids: { type: "string" },
    prompt: { type: "string", default: "v2" },
    results: { type: "string", default: "evals/eval-results.jsonl" },
    labels: { type: "string", default: "evals/human-labels.jsonl" },
  },
});

if (!values.ids) {
  console.error("Pass the ticket ids to label, e.g. --ids TCK-1002,TCK-1014,TCK-1040");
  process.exit(1);
}
if (existsSync(values.labels) && agreement(loadHumanLabels(values.labels)).labelled > 0) {
  console.error(`${values.labels} already has human labels. Move it away first if you really want new cases.`);
  process.exit(1);
}

const version = `triage-${values.prompt}`;
const rows = readFileSync(values.results, "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line) as EvalRow)
  .filter((r) => r.promptVersion === version);

const ids = [...new Set(values.ids.split(",").map((id) => id.trim()).filter((id) => id !== ""))];
const picked = ids.map((id) => {
  const row = rows.find((r) => r.ticketId === id);
  if (!row) throw new Error(`${id} has no ${version} row in ${values.results}`);
  return toHumanLabel(row);
});

writeFileSync(values.labels, picked.map((l) => JSON.stringify(l)).join("\n") + "\n");
for (const l of picked) {
  const reason = l.triage?.escalation_reason ?? null;
  console.log(`${l.ticketId} ${l.caseType.padEnd(14)} escalation ${reason === null ? "null" : "set"}, model grader ${l.modelGrader.pass ? "pass" : "fail"}`);
}
console.log(`\nWrote ${picked.length} cases to ${values.labels} with "human": null.`);
