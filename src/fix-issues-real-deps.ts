// Part 9: the real `FixIssuesDeps` for the controller: issue files and progress on disk, git worktrees,
// `claude -p` through runClaudeProcess, the code verifier and the JSONL log. Used by `npm run fix-issues`
// and by the loop arm of `npm run loop-compare` (with another root, branch prefix and log).
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { FixIssuesDeps, Workspace } from "./fix-issues-controller.ts";
import { commitFix, commitState, createWorkerWorktree, removeWorkerWorktree, type WorkerWorktree } from "./fix-issues-git.ts";
import { verifyWorktree } from "./fix-issues-verifier.ts";
import { loadIssues, loadProgress, readToggle, saveProgress, setIssueStatus } from "./issue-files.ts";
import { runClaudeProcess, type ClaudeRunner } from "./run-claude-process.ts";

/** A worker gets up to 30 turns; give the process 40 minutes before it is killed (a worker error). */
export const WORKER_TIMEOUT_MS = 2_400_000;

export interface RealDepsOptions {
  /** The checkout the loop runs from: issues, state commits and worktrees are made here. */
  root: string;
  issuesDir?: string;
  logPath?: string;
  branchPrefix?: string;
  /** Workers start from this commit instead of the root's HEAD (loop-compare: the same tree as one-shot). */
  workerBase?: string;
  /** Replaces `claude` (e.g. a stand-in that exits 1); the args are the same. */
  workerCommand?: string[];
  /** Wraps the runner, e.g. to keep transcripts for the scorer. */
  wrapRunner?: (runner: ClaudeRunner, issueBranch: string) => ClaudeRunner;
  /** Called with each log record after it is written. */
  onLog?: (record: Record<string, unknown>) => void;
}

export function realDeps(options: RealDepsOptions): FixIssuesDeps {
  const { root, branchPrefix = "fix/", workerCommand = ["claude"] } = options;
  const issuesDir = options.issuesDir ?? join(root, "issues");
  const logPath = options.logPath ?? join(root, "logs", "part-09-fix-issues.jsonl");
  const progressPath = join(issuesDir, "progress.json");
  const rel = (path: string) => relative(root, path).split("\\").join("/");
  const worktrees = new Map<Workspace, WorkerWorktree>();

  return {
    readToggle: () => readToggle(join(issuesDir, "auto-fix.json")),
    loadIssues: () => loadIssues(issuesDir),
    loadProgress: () => loadProgress(progressPath),
    saveProgress: (progress) => saveProgress(progressPath, progress),
    setIssueStatus: (issue, status) => setIssueStatus(issue.path, status),
    writeEscalation: (id, markdown) => {
      mkdirSync(join(issuesDir, "escalations"), { recursive: true });
      writeFileSync(join(issuesDir, "escalations", `${id}.md`), markdown);
    },
    commitState: (id, message) => {
      const paths = [rel(progressPath), rel(logPath)];
      if (id) paths.push(rel(join(issuesDir, `${id}.md`)), rel(join(issuesDir, "escalations", `${id}.md`)));
      return commitState(root, paths, message);
    },
    createWorkspace: (branch) => {
      const wt = createWorkerWorktree(root, { branch, ref: options.workerBase });
      const ws = { dir: wt.dir };
      worktrees.set(ws, wt);
      return ws;
    },
    removeWorkspace: (ws) => {
      const wt = worktrees.get(ws);
      if (wt) removeWorkerWorktree(root, wt);
      worktrees.delete(ws);
    },
    runnerFor: (ws) => {
      const branch = worktrees.get(ws)?.branch ?? "";
      const runner: ClaudeRunner = (args, input) => runClaudeProcess(args, input, WORKER_TIMEOUT_MS, ws.dir, undefined, workerCommand);
      return options.wrapRunner ? options.wrapRunner(runner, branch) : runner;
    },
    verify: (ws, full) => verifyWorktree(ws.dir, full),
    commitFix: (ws, message) => {
      const wt = worktrees.get(ws);
      if (!wt) throw new Error("unknown workspace");
      return commitFix(wt, message);
    },
    log: (record) => {
      mkdirSync(dirname(logPath), { recursive: true });
      appendFileSync(logPath, `${JSON.stringify(record)}\n`);
      options.onLog?.(record);
    },
    branchFor: (id) => `${branchPrefix}${id}`,
  };
}
