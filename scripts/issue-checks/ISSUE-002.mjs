// Hidden check, ISSUE-002: an empty golden file stops the run with a non-zero exit, no NaN, no summary
// line in the log and no Claude call.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expectThat, finish, runNode, standInClaude, tmp } from "./check-helpers.mjs";

const dir = tmp();
const golden = join(dir, "empty-golden.jsonl");
const log = join(dir, "golden-test.jsonl");
writeFileSync(golden, "");
const claude = standInClaude();
const r = runNode(["src/run-golden-set.ts", "--golden", golden, "--log", log], { env: claude.env });
expectThat(r.status !== 0 && r.status !== null, `exits non-zero (got ${r.status})`);
expectThat(!/NaN/.test(r.out), "no NaN in the output");
expectThat(/no (golden )?cases|empty|nothing to/i.test(r.out), "says the golden file has no cases");
expectThat(!existsSync(log) || !/"kind":"summary"/.test(readFileSync(log, "utf8")), "no summary line in the log");
expectThat(!claude.called(), "claude was not called");
finish();
