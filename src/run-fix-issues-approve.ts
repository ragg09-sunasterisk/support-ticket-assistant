// Part 9: the human approval step. A person who has read the branch merges one green fix/<ID> into the
// branch they are on, locally. The loop itself can't do this. No pull request, no push.
//
//   npm run fix-issues:approve -- --issue ISSUE-001 --approved-by "<your name>"
import { join } from "node:path";
import { parseArgs } from "node:util";
import { protectedPathsIn, runCheckSteps } from "./fix-issues-verifier.ts";
import { REPO_ROOT } from "./handbook-chunker.ts";
import { loadIssues, setIssueStatus } from "./issue-files.ts";
import { commitState } from "./fix-issues-git.ts";
import { gitHere, logRollout, ROLLOUT_LOG } from "./rollout-log.ts";

const { values } = parseArgs({ options: { issue: { type: "string" }, "approved-by": { type: "string" } } });
const id = values.issue ?? "";
const approver = values["approved-by"]?.trim() ?? "";
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};
if (!/^ISSUE-\d{3}$/.test(id) || approver === "") fail('Usage: npm run fix-issues:approve -- --issue ISSUE-001 --approved-by "<your name>"');

const issue = loadIssues(join(REPO_ROOT, "issues")).find((i) => i.id === id) ?? fail(`No issues/${id}.md`);
if (issue.status !== "ready-for-review") fail(`${id} is "${issue.status}", not ready-for-review: there is nothing green to approve.`);
const branch = `fix/${id}`;
const ahead = Number(gitHere(["rev-list", "--count", `HEAD..${branch}`]));
if (ahead !== 1) fail(`${branch} should be exactly one fix commit ahead of HEAD, it is ${ahead}. Look at it by hand.`);
const files = gitHere(["diff", "--name-only", `HEAD...${branch}`]).split("\n").filter(Boolean);
const touched = protectedPathsIn(files);
if (touched.length > 0) fail(`${branch} changes protected paths (${touched.join(", ")}): not mergeable by this script.`);

const fixCommit = gitHere(["rev-parse", branch]);
const diffStat = gitHere(["diff", "--stat", `HEAD...${branch}`]);
console.log(`${id}: ${issue.title}\n${branch} @ ${fixCommit.slice(0, 9)}\n${diffStat}\n\nApproved by ${approver}. Merging locally (no PR, no push).`);
gitHere(["merge", "--no-ff", "-m", `Merge ${branch}: ${issue.title}\n\nReviewed and approved by ${approver}.`, branch]);
const mergeCommit = gitHere(["rev-parse", "HEAD"]);

const steps = runCheckSteps(REPO_ROOT);
const codes = Object.fromEntries(steps.map((s) => [s.step, s.exitCode]));
const green = steps.every((s) => s.exitCode === 0);
console.log(`npm run check after the merge: ${JSON.stringify(codes)} -> ${green ? "green" : "RED: revert the merge (git revert -m 1 HEAD)"}`);

// Red after the merge: the issue stays ready-for-review until a person reverts or fixes it.
if (green) setIssueStatus(issue.path, "closed");
logRollout({ event: "human-approval", issue: id, approved_by: approver, branch, fix_commit: fixCommit, merge_commit: mergeCommit,
  files, diff_stat: diffStat.split("\n").at(-1)?.trim(), check_after_merge: codes, green_after_merge: green });
commitState(REPO_ROOT, [`issues/${id}.md`, ROLLOUT_LOG], `chore(loop): ${id} -> ${green ? "closed" : "still ready-for-review, red after merge"} (merged ${branch}, approved by ${approver})`);
console.log(`${id} ${green ? "closed" : "left ready-for-review"}. Logged to ${ROLLOUT_LOG}. Nothing was pushed.`);
if (!green) process.exitCode = 1;
