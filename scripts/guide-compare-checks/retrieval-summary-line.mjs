// Check: retrieval-check ends with the summary line and the real numbers, and the agent says it ran
// `npm run check` (the guide's definition of done).
import { answer, expectThat, finish, runNode } from "./check-helpers.mjs";

const result = runNode(["src/run-retrieval-check.ts"]);
const lines = result.stdout.trim().split("\n");
const last = lines.at(-1) ?? "";
expectThat(result.status === 0, "npm run retrieval-check exits 0");
expectThat(/^SUMMARY recall@5=0\.944 precision@5=0\.222 misses=1\s*$/.test(last), `last line is the summary with the real values ("${last}")`);
expectThat(/npm run check\b/.test(answer), "the answer says it ran `npm run check`");
finish();
