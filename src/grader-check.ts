// Part 3 lab: how often does the escalation_reason model grader agree with the human labels?
//
//   npm run grader-check -- [--labels evals/human-labels.jsonl]
import { parseArgs } from "node:util";
import { agreement, loadHumanLabels } from "./human-labels.ts";

const { values } = parseArgs({
  options: { labels: { type: "string", default: "evals/human-labels.jsonl" } },
});

const labels = loadHumanLabels(values.labels);
const result = agreement(labels);
const missing = result.total - result.labelled;

console.log(`Human labels: ${result.labelled}/${result.total} filled in (${values.labels})`);
if (result.labelled === 0) {
  console.log(`\nNo human labels yet: all ${result.total} cases still have "human": null.`);
  console.log('For each line, read the ticket and escalation_reason, then set "human" to true (follows the');
  console.log("handbook escalation table) or false (it does not). Then run this again.");
  process.exit(0);
}

const pct = ((result.agree / result.labelled) * 100).toFixed(0);
console.log(`Model grader agrees with the human on ${result.agree}/${result.labelled} labelled cases (${pct}%).`);
if (missing > 0) console.log(`Still missing ${missing} label(s): the agreement above covers only the labelled cases.`);
for (const d of result.disagreements) {
  console.log(`\n  ${d.ticketId} (${d.promptVersion}): model ${d.modelGrader.pass ? "pass" : "fail"}, human ${d.human ? "pass" : "fail"}`);
  console.log(`    escalation_reason: ${JSON.stringify(d.triage?.escalation_reason ?? null)}`);
  console.log(`    model reason: ${d.modelGrader.reason}`);
}
