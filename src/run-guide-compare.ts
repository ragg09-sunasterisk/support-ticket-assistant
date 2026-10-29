// Part 6 lab: run each of the 5 tasks twice with `claude -p` on the Team seat, with and without the
// guide (CLAUDE.md + AGENTS.md), each run in its own throwaway git worktree. Scores every run, appends
// it to the log and rewrites the Markdown table. About 10 agent runs; it takes a while and costs seat money.
//
//   npm run guide-compare -- [--tasks id1,id2] [--variants with,without]
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "./handbook-chunker.ts";
import { COMPARE_TASKS } from "./guide-compare-tasks.ts";
import { compareReport, latestRecords, scoreRules, type CompareRecord, type GuideVariant } from "./guide-compare-report.ts";
import { hookBlocks, runProjectAgent } from "./project-agent-run.ts";
import { changedSince, createWorktree, NOT_COPIED, removeWorktree, uncommittedFiles, type Worktree } from "./throwaway-worktree.ts";

const LOG = "logs/part-06-guide-compare.jsonl";
const REPORT = "logs/part-06-guide-compare.md";
const CHECKS_DIR = join(REPO_ROOT, "scripts", "guide-compare-checks");
const GUIDE_FILES = ["CLAUDE.md", "AGENTS.md"];

const { values } = parseArgs({
  options: { tasks: { type: "string" }, variants: { type: "string", default: "with,without" } },
});
const tasks = values.tasks ? COMPARE_TASKS.filter((t) => values.tasks?.split(",").includes(t.id)) : COMPARE_TASKS;
const variants = values.variants.split(",").filter((v): v is GuideVariant => v === "with" || v === "without");
if (process.env.ANTHROPIC_API_KEY !== undefined) {
  console.error("ANTHROPIC_API_KEY is set: unset it so claude -p runs on your Team seat, not a key.");
  process.exit(1);
}

const run = (cwd: string, command: string, args: string[]) =>
  spawnSync(command, args, { cwd, encoding: "utf8", timeout: 300_000, shell: process.platform === "win32" });
const tail = (text: string, n = 8) => text.trim().split("\n").slice(-n).join("\n");
// The state of this working tree (minus this script's own logs), to prove the runs never touched it.
const OWN_LOGS = [`:!${LOG}`, `:!${REPORT}`];
const workingTreeState = () =>
  run(REPO_ROOT, "git", ["status", "--porcelain", "--untracked-files=all", "--", ".", ...OWN_LOGS]).stdout +
  run(REPO_ROOT, "git", ["diff", "--", ".", ...OWN_LOGS]).stdout;

function runTaskCheck(wt: Worktree, taskId: string, answer: string, changed: string[]) {
  const dir = join(wt.dir, ".guide-check");
  cpSync(CHECKS_DIR, dir, { recursive: true });
  writeFileSync(join(dir, "answer.txt"), answer);
  writeFileSync(join(dir, "base-tree.txt"), wt.baseTree);
  writeFileSync(join(dir, "changed.txt"), changed.join("\n"));
  const result = run(wt.dir, process.execPath, [join(".guide-check", `${taskId}.mjs`)]);
  return { pass: result.status === 0, detail: `${result.stdout}${result.stderr}`.trim() };
}

const copy = uncommittedFiles(REPO_ROOT, NOT_COPIED);
const before = workingTreeState();
for (const task of tasks) {
  for (const variant of variants) {
    console.log(`\n=== ${task.id} / ${variant} guide ===`);
    const wt = createWorktree(REPO_ROOT, copy, variant === "with" ? [] : GUIDE_FILES);
    try {
      const { output, summary } = await runProjectAgent(task.prompt, wt.dir);
      if (summary.subtype === "no result") console.log(`claude exited ${output.code}: ${tail(output.stderr, 3)}`);
      const changed = changedSince(wt);
      // npm run check before the task check is copied in, so ESLint never sees the check files.
      const npm = run(wt.dir, "npm", ["run", "check"]);
      const taskCheck = runTaskCheck(wt, task.id, summary.answer, changed);
      const envFiles = readdirSync(wt.dir).filter((name) => /^\.env/.test(name));
      const rules = scoreRules(changed, summary.toolCalls, envFiles);
      const { kept, ...ruleDetail } = rules;
      const record: CompareRecord = {
        at: new Date().toISOString(), task: task.id, variant, taskCheck,
        npmCheck: { pass: npm.status === 0, tail: tail(`${npm.stdout}${npm.stderr}`) },
        rules: ruleDetail, rulesKept: kept, hookBlocks: hookBlocks(summary.hookEvents),
        blocked: summary.hookEvents.filter((h) => h.exitCode === 2).map((h) => `${h.name}: ${h.stderr.split("\n")[0]}`),
        subtype: summary.subtype, turns: summary.turns, costUsd: summary.costUsd, changed, answer: summary.answer,
      };
      appendFileSync(join(REPO_ROOT, LOG), `${JSON.stringify(record)}\n`);
      console.log(`task check ${taskCheck.pass ? "pass" : "FAIL"} | npm run check ${record.npmCheck.pass ? "pass" : "FAIL"} | ` +
        `rules kept ${kept ? "yes" : "NO"} | turns ${summary.turns} | $${summary.costUsd?.toFixed(2)} | changed: ${changed.join(", ") || "nothing"}`);
    } finally {
      removeWorktree(REPO_ROOT, wt);
    }
    if (workingTreeState() !== before) console.error("WARNING: this working tree changed during the run. Check git status.");
  }
}

const logPath = join(REPO_ROOT, LOG);
const records = existsSync(logPath)
  ? readFileSync(logPath, "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l) as CompareRecord)
  : [];
writeFileSync(join(REPO_ROOT, REPORT), `${compareReport(latestRecords(records, COMPARE_TASKS.map((t) => t.id)), COMPARE_TASKS)}\n`);
console.log(`\nAppended to ${LOG}. Table written to ${REPORT}.`);
