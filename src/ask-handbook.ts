// Part 4 lab: search the handbook and answer a question with `claude -p`, citing chunk IDs.
//
//   npm run ask -- "<question>" [--k 5]
import { parseArgs } from "node:util";
import { answerWithCitations, NOT_IN_HANDBOOK } from "./cited-answer-client.ts";
import { DEFAULT_K, MAX_K, searchHandbook } from "./handbook-search.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { k: { type: "string", default: String(DEFAULT_K) } },
});
const question = positionals.join(" ").trim();
const k = Number(values.k);
if (question === "" || !Number.isInteger(k) || k < 1 || k > MAX_K) {
  console.error(`Usage: npm run ask -- "<question>" [--k 1..${MAX_K}]`);
  process.exit(1);
}

if (process.env.ANTHROPIC_API_KEY !== undefined) {
  console.error("ANTHROPIC_API_KEY is set: unset it so claude -p runs on your Team seat, not a key.");
  process.exit(1);
}

const chunks = searchHandbook(question, k);
console.log(`Question: ${question}\n`);
if (chunks.length === 0) {
  // Nothing matched (e.g. only stop words): no documents to answer from, so skip the paid call.
  console.log(`${NOT_IN_HANDBOOK}\nRetrieved chunks: (none)`);
  process.exit(0);
}

const result = await answerWithCitations(question, chunks);
if (result.ok) {
  console.log(result.answer.answer);
  console.log(`\nAnswered from the documents: ${result.answer.answered ? "yes" : "no"}`);
  console.log(`Cited chunks: ${result.answer.cited_chunk_ids.join(", ") || "(none)"}`);
  if (result.unknownCitations.length > 0) {
    console.log(`Warning: cited chunks that were not retrieved: ${result.unknownCitations.join(", ")}`);
  }
  for (const warning of result.warnings) console.log(`Warning: ${warning}`);
} else {
  console.log(`No answer. Reason: ${result.reason}`);
  process.exitCode = 1;
}
// No role filter until Part 5, so restricted chunks are marked.
console.log("Retrieved chunks:");
for (const chunk of chunks) {
  const restricted = chunk.access === "public" ? "" : `  [${chunk.access}]`;
  console.log(`  ${chunk.chunk_id}  (${chunk.score})  ${chunk.source_path}${restricted}`);
}

const seconds = result.durationMs === undefined ? "?" : (result.durationMs / 1000).toFixed(1);
console.log(`\nModel: ${result.model ?? "unknown"} | ${seconds}s | est. $${result.estimatedCostUsd?.toFixed(6) ?? "?"}`);
