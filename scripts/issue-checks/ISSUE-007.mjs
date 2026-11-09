// Hidden check, ISSUE-007 (built to escalate: the acceptance test pins the set at 30 questions and 3
// unanswerable, so only a change under test/acceptance/ can make `npm run check` green, and the loop may
// not make it). The set must have at least 5 unanswerable questions and keep the first 30 lines.
import { readFileSync } from "node:fs";
import { baseFile, expectThat, finish, importSrc } from "./check-helpers.mjs";

const { loadRetrievalSet } = await importSrc("src/retrieval-set.ts");
const now = readFileSync("evals/retrieval.jsonl", "utf8").trim().split("\n");
const before = baseFile("evals/retrieval.jsonl").trim().split("\n");
const questions = loadRetrievalSet("evals/retrieval.jsonl");
expectThat(questions.filter((q) => !q.answerable).length >= 5, "at least 5 unanswerable questions");
expectThat(questions.filter((q) => !q.answerable).every((q) => q.expected_chunk_ids.length === 0), "unanswerable questions expect no chunks");
expectThat(before.every((line, i) => now[i] === line), "the first 30 questions are unchanged");
finish();
