// Part 9: the loop's git helpers against a throwaway repo in the temp folder (never this checkout):
// the hidden checks stay out of every worker worktree with `git status` clean, only a green attempt
// commits, state commits take only their own files, and no loop file can push, merge or open a PR.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { commitFix, commitState, createWorkerWorktree, removeWorkerWorktree } from "../src/fix-issues-git.ts";
import { verifyWorktree } from "../src/fix-issues-verifier.ts";
import { REPO_ROOT } from "../src/handbook-chunker.ts";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
let repo = "";

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "sta-p9-repo-"));
  git(repo, "init", "--quiet", "--initial-branch=main");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "commit.gpgsign", "false");
  mkdirSync(join(repo, "scripts", "issue-checks"), { recursive: true });
  mkdirSync(join(repo, "src"));
  mkdirSync(join(repo, "node_modules"));
  writeFileSync(join(repo, ".gitignore"), "node_modules/\n");
  writeFileSync(join(repo, "scripts", "issue-checks", "ISSUE-001.mjs"), "// hidden\n");
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  git(repo, "add", "-A");
  git(repo, "commit", "--quiet", "-m", "init");
});

describe("worker worktrees", () => {
  it("leave scripts/issue-checks/ out and keep git status clean", () => {
    const wt = createWorkerWorktree(repo, { branch: "fix/ISSUE-001" });
    try {
      expect(existsSync(join(wt.dir, "src", "a.ts"))).toBe(true);
      expect(existsSync(join(wt.dir, "scripts", "issue-checks"))).toBe(false);
      expect(existsSync(join(wt.dir, "node_modules"))).toBe(true);
      expect(git(wt.dir, "status", "--porcelain", "--untracked-files=all", "--", ".", ":!node_modules")).toBe("");
      expect(git(wt.dir, "ls-files", "-v", "scripts/issue-checks").trim()).toBe("S scripts/issue-checks/ISSUE-001.mjs");
      expect(verifyWorktree(wt.dir, false).changedFiles).toEqual([]);
    } finally {
      removeWorkerWorktree(repo, wt);
    }
    expect(git(repo, "worktree", "list").trim().split("\n")).toHaveLength(1);
  });

  it("commit only a green change on fix/<ID>, and the commit keeps the hidden checks", () => {
    const wt = createWorkerWorktree(repo, { branch: "fix/ISSUE-001" });
    try {
      writeFileSync(join(wt.dir, "src", "a.ts"), "export const a = 2;\n");
      expect(verifyWorktree(wt.dir, false).changedFiles).toEqual(["src/a.ts"]);
      const sha = commitFix(wt, "fix(ISSUE-001): a");
      expect(git(repo, "rev-parse", "fix/ISSUE-001").trim()).toBe(sha);
      expect(git(repo, "show", "--name-only", "--format=", sha).trim()).toBe("src/a.ts");
      expect(git(repo, "ls-tree", "-r", "--name-only", sha)).toContain("scripts/issue-checks/ISSUE-001.mjs");
    } finally {
      removeWorkerWorktree(repo, wt);
    }
    expect(git(repo, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("main");
  });

  it("keep an earlier green fix under fix/<ID>-prev-* when the issue is attempted again", () => {
    const first = createWorkerWorktree(repo, { branch: "fix/ISSUE-001" });
    writeFileSync(join(first.dir, "src", "a.ts"), "export const a = 2;\n");
    const sha = commitFix(first, "fix(ISSUE-001): a");
    removeWorkerWorktree(repo, first);
    const second = createWorkerWorktree(repo, { branch: "fix/ISSUE-001" });
    removeWorkerWorktree(repo, second);
    const kept = git(repo, "branch", "--list", "fix/ISSUE-001-prev-*", "--format=%(objectname)").trim();
    expect(kept).toBe(sha);
    expect(git(repo, "rev-parse", "fix/ISSUE-001").trim()).toBe(git(repo, "rev-parse", "main").trim());
  });

  it("flag a protected path even when the file is new or git-ignored", () => {
    const wt = createWorkerWorktree(repo, { branch: "fix/ISSUE-002" });
    try {
      mkdirSync(join(wt.dir, "data"));
      writeFileSync(join(wt.dir, "data", "tickets.jsonl"), "{}\n");
      writeFileSync(join(wt.dir, ".gitignore"), "node_modules/\n.env\n");
      writeFileSync(join(wt.dir, ".env"), "X=1\n");
      expect(verifyWorktree(wt.dir, false).protectedPaths.sort()).toEqual([".env", "data/tickets.jsonl"]);
    } finally {
      removeWorkerWorktree(repo, wt);
    }
  });
});

describe("state commits", () => {
  it("take only the listed files and leave the rest of the person's work alone", () => {
    mkdirSync(join(repo, "issues"));
    writeFileSync(join(repo, "issues", "progress.json"), "{}\n");
    writeFileSync(join(repo, "src", "a.ts"), "export const a = 3; // the person's own edit\n");
    const sha = commitState(repo, ["issues/progress.json", "issues/missing.md"], "chore(loop): state");
    expect(git(repo, "show", "--name-only", "--format=", sha ?? "").trim()).toBe("issues/progress.json");
    expect(git(repo, "status", "--porcelain")).toContain(" M src/a.ts");
    expect(commitState(repo, ["issues/progress.json"], "nothing new")).toBeNull();
  });
});

describe("no code path opens a PR, pushes or merges", () => {
  it("holds for every loop module and the CLI", () => {
    const files = ["fix-issues-controller", "fix-issues-git", "fix-issues-real-deps", "fix-issues-worker", "fix-issues-verifier", "fix-issues-rules", "run-fix-issues"];
    for (const file of files) {
      const code = readFileSync(join(REPO_ROOT, "src", `${file}.ts`), "utf8").replace(/^\s*(\/\/|\*).*$/gm, "");
      // git subcommands are separate array items (execFileSync), so "push"/"merge" as a string is the tell.
      expect(code, file).not.toMatch(/["'`](push|merge|gh)["'`]|\bgh pr\b|\/pulls\b/i);
    }
  });
});
