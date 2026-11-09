// Hidden check, ISSUE-005: a repeated question id fails the load, naming the id and the line; the real
// set still loads.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expectThat, finish, importSrc, throwsWith, tmp } from "./check-helpers.mjs";

const { loadRetrievalSet } = await importSrc("src/retrieval-set.ts");
const file = join(tmp(), "dup.jsonl");
const q = (question) => JSON.stringify({ id: "RQ-01", question, expected_chunk_ids: ["hb-09#refunds"], answerable: true });
writeFileSync(file, `${q("How long does a card refund take?")}\n${q("Can a buyer change the address?")}\n`);
const message = throwsWith(() => loadRetrievalSet(file));
expectThat(message !== null, "loading a set with a repeated id throws");
expectThat(message !== null && message.includes("RQ-01"), `the error names the id (${message})`);
expectThat(message !== null && /\b2\b/.test(message), "the error names line 2");
expectThat(loadRetrievalSet("evals/retrieval.jsonl").length === 30, "the real set still loads 30 questions");
finish();
