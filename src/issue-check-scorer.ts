// Part 9: scores one finished attempt with its hidden check (scripts/issue-checks/<ID>.mjs), SWE-bench
// style. The checks are copied into the worktree only after the worker and the verifier are done, and
// removed again. Resolved = the hidden check passes AND the verifier was green (npm run check, no
// protected path). Also flags a worker transcript that mentions the hidden checks: reported, never hidden.
import { spawnSync } from "node:child_process";
import { cpSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./handbook-chunker.ts";

export const ISSUE_CHECKS_DIR = join(REPO_ROOT, "scripts", "issue-checks");
const CHECK_FOLDER = ".issue-check";

export interface HiddenCheckResult {
  pass: boolean;
  detail: string;
}

export function runHiddenCheck(worktreeDir: string, issueId: string, baseRef: string): HiddenCheckResult {
  const dir = join(worktreeDir, CHECK_FOLDER);
  cpSync(ISSUE_CHECKS_DIR, dir, { recursive: true });
  writeFileSync(join(dir, "base-ref.txt"), baseRef);
  try {
    const result = spawnSync(process.execPath, [join(CHECK_FOLDER, `${issueId}.mjs`)], {
      cwd: worktreeDir, encoding: "utf8", timeout: 900_000,
    });
    const detail = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() || (result.error?.message ?? "no output");
    return { pass: result.status === 0, detail };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** True when a worker's stream-json transcript names the hidden checks (it read or looked for them). */
export const mentionsIssueChecks = (transcript: string) => /issue-checks/.test(transcript);
