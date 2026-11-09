// Part 9: the rollback drill. A scripted bad commit lands on this branch as if a loop iteration had been
// merged (it breaks the retrieval-metrics tests), `npm run check` goes red, the toggle is turned off so the
// loop can't pick anything up, the bad commit is undone with `git revert`, and `npm run check` is green
// again. Every step is logged to logs/part-09-rollout.jsonl. Repeatable; no Claude calls, no push.
//
//   npm run fix-issues:drill
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitState } from "./fix-issues-git.ts";
import { runCheckSteps } from "./fix-issues-verifier.ts";
import { REPO_ROOT } from "./handbook-chunker.ts";
import { readToggle } from "./issue-files.ts";
import { gitHere, logRollout, ROLLOUT_LOG } from "./rollout-log.ts";

const TARGET = "src/retrieval-metrics.ts";
const GOOD = "/ values.length);";
const BAD = "/ (values.length + 1)); // drill: off by one";
const TOGGLE = "issues/auto-fix.json";

function check(label: string) {
  const steps = runCheckSteps(REPO_ROOT);
  const codes = Object.fromEntries(steps.map((s) => [s.step, s.exitCode]));
  const failing = steps.find((s) => s.exitCode !== 0);
  const green = failing === undefined;
  console.log(`npm run check (${label}): ${JSON.stringify(codes)} -> ${green ? "green" : `red, ${failing.step}: ${failing.detail.slice(0, 5).join("; ")}`}`);
  logRollout({ event: "drill-check", label, check: codes, green, failing: failing?.detail.slice(0, 10) ?? [] });
  return green;
}

const stop = (message: string): never => {
  console.error(message);
  process.exit(1);
};

if (gitHere(["status", "--porcelain", "--", TARGET]) !== "") stop(`${TARGET} has uncommitted changes; the drill only commits its own one-line change. Commit or stash first.`);
const source = readFileSync(join(REPO_ROOT, TARGET), "utf8");
if (!source.includes(GOOD)) stop(`${TARGET} no longer contains "${GOOD}"; update the drill's bad change.`);
console.log("1. Before: the branch must be green.");
if (!check("before")) stop("npm run check is already red: fix that first, the drill needs a green start.");

console.log("\n2. A bad iteration lands (scripted commit).");
writeFileSync(join(REPO_ROOT, TARGET), source.replace(GOOD, BAD));
gitHere(["commit", "--quiet", "-m", "fix(drill): bad iteration lands (scripted by npm run fix-issues:drill)", "--", TARGET]);
const bad = gitHere(["rev-parse", "HEAD"]);
logRollout({ event: "drill-bad-commit", commit: bad, file: TARGET, change: `${GOOD} -> ${BAD}` });
console.log(`   bad commit ${bad.slice(0, 9)}`);
if (check("after the bad commit")) console.error("   WARNING: the bad change did not turn the check red; the drill shows nothing.");

console.log("\n3. Kill switch: auto-fix off, so the loop picks nothing up while we roll back.");
const before = readToggle(join(REPO_ROOT, TOGGLE));
writeFileSync(join(REPO_ROOT, TOGGLE), '{ "enabled": false }\n');
const toggleCommit = commitState(REPO_ROOT, [TOGGLE], "chore(loop): auto-fix off for the rollback drill");
logRollout({ event: "drill-toggle-off", toggle_before: before.read, toggle_now: readToggle(join(REPO_ROOT, TOGGLE)).read, commit: toggleCommit });

console.log("\n4. Roll back with git revert.");
gitHere(["revert", "--no-edit", bad]);
const revert = gitHere(["rev-parse", "HEAD"]);
logRollout({ event: "drill-revert", reverted: bad, revert_commit: revert });
console.log(`   revert commit ${revert.slice(0, 9)}`);

console.log("\n5. After: green again?");
const green = check("after the revert");
commitState(REPO_ROOT, [ROLLOUT_LOG], "chore(loop): rollback drill log");
console.log(`\nDrill ${green ? "passed" : "FAILED"}. auto-fix stays off; set issues/auto-fix.json back to { "enabled": true } after review.`);
if (!green) process.exitCode = 1;
