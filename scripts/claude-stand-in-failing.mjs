// Part 9: a stand-in for `claude` that makes the same wrong change on every attempt (it breaks mean() in
// src/retrieval-metrics.ts, like the rollback drill) and reports success. With it the verifier fails the
// same way twice, so `npm run fix-issues -- --worker-stand-in failing` shows the repeated-failure stop, and
// with `--max-attempts 1` the max-attempts stop. Works only in its own throwaway worktree (cwd); no Claude.
import { readFileSync, writeFileSync } from "node:fs";

const file = "src/retrieval-metrics.ts";
writeFileSync(file, readFileSync(file, "utf8").replace("/ values.length);", "/ (values.length + 1));"));
const result = { type: "result", subtype: "success", is_error: false, num_turns: 1, total_cost_usd: 0, result: `stand-in: changed ${file}` };
process.stdout.write(`${JSON.stringify({ type: "system", subtype: "init" })}\n${JSON.stringify(result)}\n`);
