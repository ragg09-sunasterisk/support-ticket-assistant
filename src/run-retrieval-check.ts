// Part 4 lab: run searchHandbook over the 30 retrieval questions (no Claude calls) and report how many
// answerable questions have at least one expected chunk in the top k.
//
//   npm run retrieval-check -- [--set evals/retrieval.jsonl] [--k 5]
import { parseArgs } from "node:util";
import { MAX_K, searchHandbook } from "./handbook-search.ts";
import { checkRetrieval, loadRetrievalSet } from "./retrieval-set.ts";

const { values } = parseArgs({
  options: {
    set: { type: "string", default: "evals/retrieval.jsonl" },
    k: { type: "string", default: "5" },
  },
});
const k = Number(values.k);
if (!Number.isInteger(k) || k < 1 || k > MAX_K) {
  console.error(`--k must be a whole number from 1 to ${MAX_K}, got "${values.k}"`);
  process.exit(1);
}

const result = checkRetrieval(loadRetrievalSet(values.set), searchHandbook, k);
const restricted = result.answerable.filter((r) => r.restricted);

console.log(`Answerable questions with an expected chunk in the top ${k}: ${result.hits}/${result.answerable.length}`);
console.log(`  public:     ${result.hits - restricted.filter((r) => r.hit).length}/${result.answerable.length - restricted.length}`);
console.log(`  restricted: ${restricted.filter((r) => r.hit).length}/${restricted.length} (no role filter yet)`);

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
