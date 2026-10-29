// Stop hook: before Claude finishes, run the tests (`npm test`) and the retrieval check
// (`npm run retrieval-check`). Neither calls Claude. If one fails, exit 2 with a short summary so
// Claude keeps working. If Claude is already continuing because of this hook (stop_hook_active),
// let it stop, so a failure it can't fix doesn't loop forever.
// Runs vitest and the script through `node`, not npm, so no shell is needed on Windows.
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const TAIL_LINES = 25;

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw || "{}");
if (input.stop_hook_active) process.exit(0);
const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();

const CHECKS = [
  { name: "npm test", args: [join(root, "node_modules", "vitest", "vitest.mjs"), "run"] },
  { name: "npm run retrieval-check", args: [join(root, "src", "run-retrieval-check.ts")] },
];

const failures = [];
for (const check of CHECKS) {
  const result = spawnSync(process.execPath, check.args, { cwd: root, encoding: "utf8", timeout: 300_000 });
  if (result.status === 0) continue;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() || result.error?.message || "no output";
  // Vitest colours its output when it thinks it has a terminal; strip that so the summary stays readable.
  // eslint-disable-next-line no-control-regex -- matching the ANSI escape character is the point
  const plain = output.replace(/\u001b\[[0-9;]*m/g, "").split("\n");
  failures.push(`${check.name} failed (exit ${result.status ?? result.signal}). Last lines:\n${plain.slice(-TAIL_LINES).join("\n")}`);
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n\n")}\n\nThe work is not done until these pass (Stop hook: .claude/hooks/run-checks-before-stop.mjs).\n`);
  process.exit(2);
}
process.exit(0);
