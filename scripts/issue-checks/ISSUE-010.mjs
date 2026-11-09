// Hidden check, ISSUE-010: an answerable question with no expected chunks fails the load (line number and
// id); unanswerable questions with [] still load; the real set still loads.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expectThat, finish, importSrc, throwsWith, tmp } from "./check-helpers.mjs";

const { loadRetrievalSet } = await importSrc("src/retrieval-set.ts");
const dir = tmp();
const bad = join(dir, "half.jsonl");
const fine = join(dir, "fine.jsonl");
const line = (id, expected, answerable) => JSON.stringify({ id, question: `Question ${id}?`, expected_chunk_ids: expected, answerable });
writeFileSync(bad, `${line("RQ-01", ["hb-09#refunds"], true)}\n${line("RQ-02", [], true)}\n`);
writeFileSync(fine, `${line("RQ-01", ["hb-09#refunds"], true)}\n${line("RQ-02", [], false)}\n`);
const message = throwsWith(() => loadRetrievalSet(bad));
expectThat(message !== null, "an answerable question without expected chunks fails the load");
expectThat(message !== null && /\b2\b/.test(message) && message.includes("RQ-02"), `the error names line 2 and RQ-02 (${message})`);
expectThat(throwsWith(() => loadRetrievalSet(fine)) === null, "an unanswerable question with [] still loads");
expectThat(loadRetrievalSet("evals/retrieval.jsonl").length === 30, "the real set still loads 30 questions");
finish();
