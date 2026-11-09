// Hidden check, ISSUE-001: a missing --set file gives a short error naming the path, a non-zero exit and
// no stack trace; the default run still works.
import { expectThat, finish, runNode } from "./check-helpers.mjs";

const missing = runNode(["src/run-retrieval-check.ts", "--set", "evals/no-such-set.jsonl"]);
expectThat(missing.status !== 0 && missing.status !== null, `missing file exits non-zero (got ${missing.status})`);
expectThat(!/^\s+at\s/m.test(missing.out) && !/node:internal|Node\.js v\d/.test(missing.out), "no stack trace");
expectThat(missing.out.includes("evals/no-such-set.jsonl"), "the message names the path");
expectThat(missing.out.trim().split("\n").length <= 3, `a short message (${missing.out.trim().split("\n").length} lines)`);

const normal = runNode(["src/run-retrieval-check.ts"]);
expectThat(normal.status === 0 && /recall@5:\s+0\.944/.test(normal.stdout), "the default run still exits 0 with recall@5 0.944");
finish();
