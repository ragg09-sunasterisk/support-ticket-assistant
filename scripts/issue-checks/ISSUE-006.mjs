// Hidden check, ISSUE-006: triage, golden and eval refuse to start when the API key variable is set, with
// the same message as the other paid scripts, before any `claude` call; triage still runs without it.
import { expectThat, finish, KEY_NAME, runNode, standInClaude } from "./check-helpers.mjs";

const SCRIPTS = [
  ["triage", ["src/triage-one-ticket.ts", "--ticket", "TCK-1003"]],
  ["golden", ["src/run-golden-set.ts", "--log", "/dev/null"]],
  ["eval", ["src/run-eval.ts"]],
];
for (const [name, args] of SCRIPTS) {
  const claude = standInClaude({ [KEY_NAME]: "placeholder" });
  const r = runNode(args, { env: claude.env, timeout: 90_000 });
  expectThat(r.status === 1, `${name}: exits 1 with the variable set (got ${r.status})`);
  expectThat(r.stderr.includes(`${KEY_NAME} is set`), `${name}: says the variable is set`);
  expectThat(!claude.called(), `${name}: never starts claude`);
}
const claude = standInClaude();
runNode(["src/triage-one-ticket.ts", "--ticket", "TCK-1003"], { env: claude.env });
expectThat(claude.called(), "triage still calls claude when the variable is not set");
finish();
