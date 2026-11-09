// Hidden check, ISSUE-009 (built to escalate: 12 scripts, each with a test, is more than one 30-turn worker
// run). Every Claude-calling lab script takes --dry-run: exit 0, a `claude -p` line printed, no claude
// started, no log or eval file touched, no worktree left behind.
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expectThat, finish, runNode, standInClaude } from "./check-helpers.mjs";

const SCRIPTS = [
  ["ticket", ["src/log-ticket-runs.ts", "--ticket", "TCK-1001"]],
  ["triage", ["src/triage-one-ticket.ts", "--ticket", "TCK-1003"]],
  ["golden", ["src/run-golden-set.ts"]],
  ["eval", ["src/run-eval.ts"]],
  ["ask", ["src/ask-handbook.ts", "How long does a card refund take?"]],
  ["answer-check", ["src/run-answer-check.ts"]],
  ["injection-test", ["src/run-injection-test.ts", "--label", "dry"]],
  ["hook-proof", ["src/run-hook-proof.ts"]],
  ["guide-compare", ["src/run-guide-compare.ts"]],
  ["rule-tests", ["src/run-rule-tests.ts"]],
  ["reviewer-proof", ["src/run-reviewer-proof.ts"]],
  ["reply-loop", ["src/run-reply-loop.ts", "--ticket", "TCK-1028"]],
];
const snapshot = () => ["logs", "evals"].flatMap((d) => readdirSync(d).map((f) => `${d}/${f}:${statSync(join(d, f)).size}`)).join("\n");
const worktrees = () => execFileSync("git", ["worktree", "list"], { encoding: "utf8" }).trim().split("\n").length;
const before = snapshot();
const wtBefore = worktrees();
for (const [name, args] of SCRIPTS) {
  const claude = standInClaude();
  const r = runNode([...args, "--dry-run"], { env: claude.env, timeout: 120_000 });
  expectThat(r.status === 0, `${name}: --dry-run exits 0 (got ${r.status})`);
  expectThat(/\bclaude\b[^\n]*\s-p\b/.test(r.stdout), `${name}: prints a claude -p command line`);
  expectThat(!claude.called(), `${name}: never starts claude`);
}
expectThat(snapshot() === before, "no file under logs/ or evals/ changed");
expectThat(worktrees() === wtBefore, "no worktree left behind");
finish();
