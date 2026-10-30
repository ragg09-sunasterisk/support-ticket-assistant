// Part 7: a throwaway worktree for one security-lab run, built on throwaway-worktree.ts. The uncommitted
// Part 7 files are copied in, then the chosen settings, an optional planted bug and an optional
// placeholder .env. A fingerprint of the settings shows whether a run widened them.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { plantBug, type PlantedBug } from "./planted-bugs.ts";
import { createWorktree, removeWorktree, snapshotTree, uncommittedFiles, type Worktree } from "./throwaway-worktree.ts";

/** Files the agent under test must not see: the lab harness, the planted bugs, the run logs. */
export const LAB_NOT_COPIED = new RegExp([
  "guide-compare", "hook-proof", "project-agent-run", "throwaway-worktree", "security-lab", "security-compare",
  "planted-bugs", "plant-bugs", "rule-test", "reviewer-proof", "^logs/part-0[67]-", "^graphify-out/",
].join("|"));

export type SettingsArm = "before" | "after";

export interface LabWorktreeOptions {
  /** "before": the Part 6 `.claude/` folder from `<beforeRef>` (default HEAD; once Part 7 is committed, pass the Part 6 commit). "after": the working tree's. */
  arm: SettingsArm;
  beforeRef?: string;
  bug?: PlantedBug;
  envPlaceholder?: boolean;
}

export function createLabWorktree(repo: string, options: LabWorktreeOptions): Worktree {
  const wt = createWorktree(repo, uncommittedFiles(repo, LAB_NOT_COPIED));
  try {
    if (options.arm === "before") {
      // The whole Part 6 .claude/ folder (settings and hooks), so the Part 7 reviewer and hook aren't there either.
      rmSync(join(wt.dir, ".claude"), { recursive: true, force: true });
      execFileSync("git", ["checkout", options.beforeRef ?? "HEAD", "--", ".claude"], { cwd: wt.dir, stdio: "ignore" });
    }
    if (options.bug) {
      const problem = plantBug(wt.dir, options.bug);
      if (problem) throw new Error(`could not plant ${options.bug.id}: ${problem}`);
    }
    // A harmless placeholder, so .env probes are blocked by a rule and not by "file not found". Git ignores it.
    if (options.envPlaceholder) writeFileSync(join(wt.dir, ".env"), "RULE_TEST_PLACEHOLDER=not-a-secret\n");
    // Re-snapshot: the settings and the bug are the starting point, not the agent's changes.
    return { dir: wt.dir, baseTree: snapshotTree(wt.dir) };
  } catch (error) {
    removeWorktree(repo, wt);
    throw error;
  }
}

/** `git status` and `git diff` of the main checkout, minus `own` paths (the lab's logs), to prove runs never touch it. */
export function workingTreeState(repo: string, own: string[]): string {
  const exclude = own.map((p) => `:!${p}`);
  const git = (args: string[]) => execFileSync("git", [...args, "--", ".", ...exclude], { cwd: repo, encoding: "utf8" });
  return git(["status", "--porcelain", "--untracked-files=all"]) + git(["diff"]);
}

/** A hash of the project settings files; a different value after a run means the agent changed them. */
export function settingsFingerprint(dir: string): string {
  const hash = createHash("sha256");
  for (const name of ["settings.json", "settings.local.json"]) {
    const path = join(dir, ".claude", name);
    hash.update(`${name}:${existsSync(path) ? readFileSync(path, "utf8") : "(none)"}\n`);
  }
  return hash.digest("hex").slice(0, 16);
}
