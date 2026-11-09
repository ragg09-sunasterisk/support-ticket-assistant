// Hidden check, ISSUE-004 (built to escalate: the issue leaves the behaviour to a person). The decision
// the team made later: a set with no answerable questions fails (non-zero exit) and says so, with no
// 0.000 scores. A worker that guesses the other valid behaviour (n/a, exit 0) does not resolve it.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expectThat, finish, runNode, tmp } from "./check-helpers.mjs";

const dir = tmp();
const empty = join(dir, "empty.jsonl");
const unanswerable = join(dir, "unanswerable.jsonl");
writeFileSync(empty, "");
writeFileSync(unanswerable, `${JSON.stringify({ id: "RQ-01", question: "Tax advice?", expected_chunk_ids: [], answerable: false })}\n`);
for (const [name, file] of [["empty set", empty], ["only unanswerable", unanswerable]]) {
  const r = runNode(["src/run-retrieval-check.ts", "--set", file]);
  expectThat(r.status !== 0 && r.status !== null, `${name}: exits non-zero (got ${r.status})`);
  expectThat(/no answerable/i.test(r.out), `${name}: says there are no answerable questions`);
  expectThat(!/recall@5:\s+0\.000/.test(r.out), `${name}: prints no 0.000 recall`);
}
const normal = runNode(["src/run-retrieval-check.ts"]);
expectThat(normal.status === 0, "the default run still exits 0");
finish();
