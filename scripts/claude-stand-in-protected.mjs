// Part 9: a stand-in for `claude` that "fixes" an issue by editing a protected path, the way a worker that
// got past the deny rules would: it loosens the acceptance test's question count in its own throwaway
// worktree (cwd) and reports success. `npm run fix-issues -- --worker-stand-in protected` uses it to show
// the protected-path stop, because the real worker refused (no-diff). Never calls Claude; never touches
// the person's checkout.
import { readFileSync, writeFileSync } from "node:fs";

const file = "test/acceptance/handbook-search.acceptance.test.ts";
writeFileSync(file, readFileSync(file, "utf8").replace("toHaveLength(30)", "toHaveLength(32)"));
const result = { type: "result", subtype: "success", is_error: false, num_turns: 1, total_cost_usd: 0, result: `stand-in: edited ${file}` };
process.stdout.write(`${JSON.stringify({ type: "system", subtype: "init" })}\n${JSON.stringify(result)}\n`);
