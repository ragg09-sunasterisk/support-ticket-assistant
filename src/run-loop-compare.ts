// Part 9 lab: one-shot `claude -p` vs the issue-fixing loop on the 10 seeded issues, from the same base
// commit, scored with the hidden checks. Writes evals/loop-vs-one-shot.md. Costs seat money (about 10
// one-shot calls plus the loop's calls; each call is capped at $1.00, the loop arm at --max-loop-cost).
//
//   npm run loop-compare -- --base <commit> [--arms one-shot,loop] [--issues ISSUE-001,...] [--max-loop-cost 12]
//   npm run loop-compare -- --base <commit> --checks-only [--patches <dir with ISSUE-NNN.patch>]   (no Claude)
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createWorkerWorktree, removeWorkerWorktree } from "./fix-issues-git.ts";
import { verifyWorktree } from "./fix-issues-verifier.ts";
import { REPO_ROOT } from "./handbook-chunker.ts";
import { loadIssues } from "./issue-files.ts";
import { runHiddenCheck } from "./issue-check-scorer.ts";
import { runLoopArm, runOneShotArm } from "./loop-compare-arms.ts";
import { compareMarkdown, latestOutcomes, type IssueOutcome } from "./loop-compare-report.ts";
import { seatOnlyProblem } from "./seat-only-guard.ts";

const LOG = join(REPO_ROOT, "logs", "part-09-loop-compare.jsonl");
const REPORT = join(REPO_ROOT, "evals", "loop-vs-one-shot.md");

const { values } = parseArgs({
  options: {
    base: { type: "string" },
    arms: { type: "string", default: "one-shot,loop" },
    issues: { type: "string" },
    "max-loop-cost": { type: "string", default: "12" },
    "checks-only": { type: "boolean", default: false },
    patches: { type: "string" },
  },
});
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};
if (!values.base) fail("--base <commit> is required: both arms start from it (e.g. the commit before Part 9).");
const base = execFileSync("git", ["rev-parse", "--verify", `${values.base}^{commit}`], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
const wanted = values.issues?.split(",");
const issues = loadIssues(join(REPO_ROOT, "issues")).filter((i) => !wanted || wanted.includes(i.id));
if (issues.length === 0) fail("No issues/ISSUE-*.md to run.");

if (values["checks-only"]) {
  // No Claude: each hidden check on the base commit, or with a reference patch applied (then npm run check too).
  for (const issue of issues) {
    const wt = createWorkerWorktree(REPO_ROOT, { ref: base });
    try {
      const patch = values.patches ? resolve(values.patches, `${issue.id}.patch`) : null;
      const patched = patch !== null && existsSync(patch);
      if (patched) execFileSync("git", ["apply", patch], { cwd: wt.dir });
      const verifier = patched ? verifyWorktree(wt.dir) : null;
      const hidden = runHiddenCheck(wt.dir, issue.id, base);
      const check = verifier ? ` | npm run check ${verifier.green ? "green" : `RED (${verifier.failingStep})`}` : "";
      console.log(`\n${issue.id} ${patched ? "with reference patch" : "on the base commit"}: hidden check ${hidden.pass ? "PASS" : "FAIL"}${check}`);
      console.log(hidden.detail.split("\n").map((l) => `  ${l}`).join("\n"));
    } finally {
      removeWorkerWorktree(REPO_ROOT, wt);
    }
  }
  process.exit(0);
}

const maxLoopCost = Number(values["max-loop-cost"]);
if (!(maxLoopCost > 0 && maxLoopCost <= 20)) fail(`--max-loop-cost must be above 0 and at most 20, got "${values["max-loop-cost"]}"`);
const notSeat = seatOnlyProblem();
if (notSeat) fail(notSeat);

const runId = new Date().toISOString();
const log = (record: Record<string, unknown>) => appendFileSync(LOG, `${JSON.stringify(record)}\n`);
const arms = values.arms.split(",");
console.log(`Base ${base.slice(0, 9)}, ${issues.length} issues, arms ${arms.join(" + ")}, run ${runId}`);
if (arms.includes("one-shot")) await runOneShotArm({ root: REPO_ROOT, base, issues, runId, log });
if (arms.includes("loop")) await runLoopArm({ root: REPO_ROOT, base, issues, runId, log, maxLoopCostUsd: maxLoopCost });

const rows = readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as IssueOutcome).filter((r) => r.kind === "outcome");
writeFileSync(REPORT, compareMarkdown(latestOutcomes(rows), new Date().toISOString()));
console.log(`\nLogged to ${LOG}. Table written to ${REPORT}.`);
