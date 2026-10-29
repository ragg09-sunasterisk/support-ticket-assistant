// Part 5 lab: answer all 30 retrieval questions with `claude -p` as the support_agent role and score
// each answer by rules (no grader model). Prints per-question results and totals and writes the run
// to the log, one line per question. About 30 calls, roughly $0.02 each.
//
//   npm run answer-check -- [--set evals/retrieval.jsonl] [--log logs/part-05-answer-check.jsonl]
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { answerWithCitations, NOT_IN_HANDBOOK, type CitedAnswer } from "./cited-answer-client.ts";
import { scoreAnswer, totalScores, type AnswerScore } from "./answer-check-rules.ts";
import { DEFAULT_K, handbookSearchFor, type Role } from "./handbook-search.ts";
import { loadRetrievalSet } from "./retrieval-set.ts";

const ROLE: Role = "support_agent";

const { values } = parseArgs({
  options: {
    set: { type: "string", default: "evals/retrieval.jsonl" },
    log: { type: "string", default: "logs/part-05-answer-check.jsonl" },
  },
});

if (process.env.ANTHROPIC_API_KEY !== undefined) {
  console.error("ANTHROPIC_API_KEY is set: unset it so claude -p runs on your Team seat, not a key.");
  process.exit(1);
}

const questions = loadRetrievalSet(values.set);
const search = handbookSearchFor(ROLE);
const scores: AnswerScore[] = [];
const lines: string[] = [];
let costUsd = 0;

for (const q of questions) {
  const chunks = search(q.question, DEFAULT_K);
  let answer: CitedAnswer | undefined;
  let reason: string | undefined;
  let run: { model?: string; estimatedCostUsd?: number; durationMs?: number } = {};
  if (chunks.length === 0) {
    // Nothing matched: no documents to answer from, so abstain without a paid call (as `ask` does).
    answer = { answered: false, answer: NOT_IN_HANDBOOK, citations: [] };
  } else {
    const result = await answerWithCitations(q.question, chunks);
    run = { model: result.model, estimatedCostUsd: result.estimatedCostUsd, durationMs: result.durationMs };
    if (result.ok) answer = result.answer;
    else reason = result.reason;
  }
  costUsd += run.estimatedCostUsd ?? 0;

  const score = scoreAnswer(q, chunks, answer, reason);
  scores.push(score);
  const cited = [...new Set(answer?.citations.map((c) => c.chunk_id))].join(", ") || "(none)";
  console.log(`${score.pass ? "PASS" : "FAIL"} ${q.id} [${score.kind}] answered=${answer?.answered ?? "?"} cited=${cited}`);
  for (const failure of score.failures) console.log(`     - ${failure}`);

  lines.push(
    JSON.stringify({
      id: q.id,
      kind: score.kind,
      role: ROLE,
      question: q.question,
      expected: q.expected_chunk_ids,
      retrieved: chunks.map((c) => c.chunk_id),
      answered: answer?.answered,
      answer: answer?.answer,
      citations: answer?.citations,
      pass: score.pass,
      failures: score.failures,
      ...run,
    }),
  );
}

writeFileSync(values.log, `${lines.join("\n")}\n`);

const t = totalScores(scores);
console.log(`\nRole: ${ROLE}, k = ${DEFAULT_K}. Answer check: ${t.passed}/${t.total} pass`);
console.log(`  public (must cite an expected chunk): ${t.byKind.public.passed}/${t.byKind.public.total}`);
console.log(`  restricted (must abstain):            ${t.byKind.restricted.passed}/${t.byKind.restricted.total}`);
console.log(`  unanswerable (must abstain):          ${t.byKind.unanswerable.passed}/${t.byKind.unanswerable.total}`);
console.log(`  quotes found in their cited chunk:    ${t.quotesFound}/${t.quotesChecked}`);
console.log(`Estimated cost: $${costUsd.toFixed(4)}. Saved to ${values.log}`);
if (t.passed < t.total) process.exitCode = 1;
