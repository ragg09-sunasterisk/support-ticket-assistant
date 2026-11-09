// Part 9: the git side of the loop. Each attempt gets a fresh worktree on branch fix/<ID> made from HEAD,
// with `scripts/issue-checks/` (the hidden scoring checks) left out, so the worker never sees them and
// `git status` stays clean. Only a green attempt leaves a commit on its branch.
// Nothing here pushes, merges or opens a pull request.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Paths a worker must never see. */
export const HIDDEN_FROM_WORKERS = ["scripts/issue-checks"];
/** The node_modules link is a file to git, which .gitignore's `node_modules/` doesn't match: leave it out. */
export const NOT_NODE_MODULES = ["--", ".", ":!node_modules"];

export interface WorkerWorktree {
  dir: string;
  /** fix/<ID>, or null for a detached worktree (the one-shot arm, scoring). */
  branch: string | null;
  /** The temp folder holding the worktree; removed with it. */
  scratch: string;
}

export const git = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/**
 * A worktree at `ref` (default HEAD) without the hidden paths. With `branch`, the branch is (re)set to that
 * commit: a failed attempt never committed, so nothing is lost. node_modules is a link to the repo's.
 *
 * Hiding uses skip-worktree bits, which is what sparse checkout does underneath, but without writing
 * `extensions.worktreeConfig` into .git/config (the Claude Code sandbox makes that file read-only). The
 * files stay in the index, so `git status` is clean and a commit keeps them unchanged.
 */
export function createWorkerWorktree(repo: string, options: { branch?: string; ref?: string } = {}): WorkerWorktree {
  const ref = options.ref ?? "HEAD";
  // -B resets the branch: if it holds commits that aren't in `ref` (an earlier green fix, a person's own
  // commit), keep them under fix/<ID>-prev-<time> instead of throwing them away (review finding).
  if (options.branch && branchExists(repo, options.branch) && Number(git(repo, ["rev-list", "--count", `${ref}..${options.branch}`])) > 0) {
    // A copy of the ref, not `branch -m`: renaming writes .git/config, which the sandbox keeps read-only.
    git(repo, ["branch", `${options.branch}-prev-${Date.now()}`, options.branch]);
  }
  const scratch = mkdtempSync(join(tmpdir(), "sta-part09-"));
  const dir = join(scratch, "wt");
  const wt = { dir, branch: options.branch ?? null, scratch };
  try {
    const where = options.branch ? ["-B", options.branch] : ["--detach"];
    git(repo, ["worktree", "add", "--no-checkout", ...where, dir, ref]);
    git(dir, ["read-tree", "HEAD"]); // the index only; nothing on disk yet
    const hidden = git(dir, ["ls-files", "-z", "--", ...HIDDEN_FROM_WORKERS]).split("\0").filter((p) => p !== "");
    if (hidden.length > 0) git(dir, ["update-index", "--skip-worktree", "--", ...hidden]);
    git(dir, ["checkout-index", "--all"]); // skips skip-worktree entries
    symlinkSync(join(repo, "node_modules"), join(dir, "node_modules"), "junction");
    return wt;
  } catch (error) {
    removeWorkerWorktree(repo, wt);
    throw error;
  }
}

export function removeWorkerWorktree(repo: string, wt: WorkerWorktree): void {
  const link = join(wt.dir, "node_modules");
  if (existsSync(link) && lstatSync(link).isSymbolicLink()) unlinkSync(link);
  try {
    if (existsSync(wt.dir)) git(repo, ["worktree", "remove", "--force", "--force", wt.dir]);
  } catch {
    rmSync(wt.dir, { recursive: true, force: true });
  }
  try {
    git(repo, ["worktree", "prune"]);
  } finally {
    rmSync(wt.scratch, { recursive: true, force: true });
  }
}

const branchExists = (repo: string, branch: string) => {
  try {
    git(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
};

/**
 * Commits everything in the worktree on its branch (rule 1 only). Returns the SHA. Hooks are off for this
 * commit: the verifier already ran check:secrets, and a hook file in the worktree is code the worker could
 * have written (review finding).
 */
export function commitFix(wt: WorkerWorktree, message: string): string {
  git(wt.dir, ["add", "-A", ...NOT_NODE_MODULES]);
  git(wt.dir, ["-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", message]);
  return git(wt.dir, ["rev-parse", "HEAD"]).trim();
}

/**
 * Commits only the given state files (progress, issue, escalation, log) on the branch the person ran the
 * loop from. `git commit -- <paths>` leaves anything else in their working tree and index alone.
 */
export function commitState(repo: string, paths: string[], message: string): string | null {
  const existing = paths.filter((p) => existsSync(join(repo, p)));
  git(repo, ["add", "--", ...existing]);
  const staged = git(repo, ["diff", "--cached", "--name-only", "--", ...existing]).trim();
  if (staged === "") return null;
  git(repo, ["commit", "--quiet", "-m", message, "--", ...existing]);
  return git(repo, ["rev-parse", "HEAD"]).trim();
}

export const headSha = (repo: string) => git(repo, ["rev-parse", "HEAD"]).trim();
