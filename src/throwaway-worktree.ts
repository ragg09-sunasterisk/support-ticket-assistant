// Part 6: a throwaway `git worktree` for one agent run. It starts at HEAD, gets the uncommitted
// Part 6 files copied in, and shares node_modules by symlink. Nothing in it touches this working tree;
// git only records the worktree under .git/worktrees until `removeWorktree` prunes it.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface Worktree {
  dir: string;
  /** Git tree ID of the worktree right before the agent starts; diffs are taken against it. */
  baseTree: string;
}

/** Part 6 files the agent must not see: the harness, its checks and tests, and the Part 6 logs. */
export const NOT_COPIED = /guide-compare|hook-proof|project-agent-run|throwaway-worktree|^logs\/part-06-|^graphify-out\//;

const git = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
// node_modules is a symlink, which git would treat as a file: keep it out of every add.
const ADD_ALL = ["add", "-A", "--", ".", ":!node_modules"];

/** Paths from `git status --porcelain -z`: modified, added and untracked files (untracked listed one by one). */
export function parsePorcelainPaths(porcelain: string): string[] {
  const entries = porcelain.split("\0").filter((e) => e !== "");
  const paths: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] ?? "";
    paths.push(entry.slice(3));
    if (entry[0] === "R" || entry[0] === "C") i++; // renames and copies are followed by the old path
  }
  return paths;
}

/** The working tree's uncommitted files, minus those matching `exclude` (e.g. the harness itself). */
export function uncommittedFiles(repo: string, exclude: RegExp): string[] {
  const porcelain = git(repo, ["status", "--porcelain", "-z", "--untracked-files=all"]);
  return parsePorcelainPaths(porcelain).filter((path) => !exclude.test(path));
}

/** Creates the worktree under the OS temp folder. `remove` deletes paths after the copy (e.g. the guide). */
export function createWorktree(repo: string, copy: string[], remove: string[] = []): Worktree {
  const dir = mkdtempSync(join(tmpdir(), "sta-part06-"));
  git(repo, ["worktree", "add", "--detach", "--force", dir, "HEAD"]);
  for (const path of copy) {
    const from = join(repo, path);
    const to = join(dir, path);
    if (existsSync(from)) {
      mkdirSync(dirname(to), { recursive: true });
      cpSync(from, to);
    } else {
      rmSync(to, { force: true }); // deleted in the working tree
    }
  }
  for (const path of remove) rmSync(join(dir, path), { force: true, recursive: true });
  // "junction" makes a directory link on Windows without admin rights; other systems ignore it.
  symlinkSync(join(repo, "node_modules"), join(dir, "node_modules"), "junction");
  return { dir, baseTree: snapshotTree(dir) };
}

/** Stages everything (in the worktree's own index) and returns the tree ID. Writes no commit. */
export function snapshotTree(dir: string): string {
  git(dir, ADD_ALL);
  return git(dir, ["write-tree"]).trim();
}

/** Files added, changed or deleted since `baseTree`, as repo-relative paths. Ignored files (.env) are not listed. */
export function changedSince(wt: Worktree): string[] {
  const now = snapshotTree(wt.dir);
  return git(wt.dir, ["diff", "--name-only", wt.baseTree, now]).split("\n").filter((p) => p !== "");
}

/** Deletes the worktree folder and its record in .git/worktrees. The node_modules link goes first. */
export function removeWorktree(repo: string, wt: Worktree): void {
  const link = join(wt.dir, "node_modules");
  if (existsSync(link) && lstatSync(link).isSymbolicLink()) unlinkSync(link);
  try {
    git(repo, ["worktree", "remove", "--force", "--force", wt.dir]);
  } catch {
    rmSync(wt.dir, { recursive: true, force: true });
  }
  git(repo, ["worktree", "prune"]);
}
