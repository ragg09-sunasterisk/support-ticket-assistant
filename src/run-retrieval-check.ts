// Part 4 lab, extended in Part 5: run the handbook search over the 30 retrieval questions (no Claude
// calls). Reports recall@k and precision@k, how many answerable questions have at least one expected
// chunk in the top k, and the misses. The default role is security, the one that can see every page.
//
//   npm run retrieval-check -- [--set evals/retrieval.jsonl] [--k 5] [--role security]
import { parseArgs } from "node:util";
import { handbookSearchFor, isRole, MAX_K, ROLES } from "./handbook-search.ts";
import { retrievalMetrics } from "./retrieval-metrics.ts";
import { checkRetrieval, loadRetrievalSet } from "./retrieval-set.ts";

const { values } = parseArgs({
  options: {
    set: { type: "string", default: "evals/retrieval.jsonl" },
    k: { type: "string", default: "5" },
    role: { type: "string", default: "security" },
  },
});
const k = Number(values.k);
if (!Number.isInteger(k) || k < 1 || k > MAX_K) {
  console.error(`--k must be a whole number from 1 to ${MAX_K}, got "${values.k}"`);
  process.exit(1);
}
if (!isRole(values.role)) {
  console.error(`--role must be one of ${ROLES.join(", ")}, got "${values.role}"`);
  process.exit(1);
}

const questions = loadRetrievalSet(values.set);
const search = handbookSearchFor(values.role);
const metrics = retrievalMetrics(questions, search, k);
const result = checkRetrieval(questions, search, k);
const restricted = result.answerable.filter((r) => r.restricted);

console.log(`Role: ${values.role}, k = ${k}, ${metrics.questions} answerable questions`);
console.log(`recall@${k}:    ${metrics.recallAtK.toFixed(3)}  (share of the expected chunks found, averaged)`);
console.log(`precision@${k}: ${metrics.precisionAtK.toFixed(3)}  (expected chunks found / ${k}; best possible ${metrics.precisionCeiling.toFixed(3)})`);

console.log(`\nAnswerable questions with an expected chunk in the top ${k}: ${result.hits}/${result.answerable.length}`);
console.log(`  public:     ${result.hits - restricted.filter((r) => r.hit).length}/${result.answerable.length - restricted.length}`);
console.log(`  restricted: ${restricted.filter((r) => r.hit).length}/${restricted.length}`);

console.log(`\nMisses (${result.misses.length}):`);
for (const miss of result.misses) {
  console.log(`- ${miss.id}: ${miss.question}`);
  console.log(`    expected:  ${miss.expected.join(", ")}`);
  console.log(`    retrieved: ${miss.retrieved.join(", ")}`);
}
if (result.misses.length === 0) console.log("- none");

console.log("\nUnanswerable questions (nothing should answer these; top hits shown for reference):");
for (const row of result.unanswerable) {
  console.log(`- ${row.id}: ${row.question}\n    retrieved: ${row.retrieved.join(", ") || "(nothing)"}`);
}
