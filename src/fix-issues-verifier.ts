// Part 9: the loop's verifier. Code, not a model, decides whether an attempt worked (docs/loop-design.md,
// section 5): what changed, whether a protected path was touched, and `npm run check`'s four steps run one
// by one so the first failing step is known. The failure fingerprint makes "the same failure twice"
// checkable. The worker's own summary is never read here.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NOT_NODE_MODULES } from "./fix-issues-git.ts";
import { parsePorcelainPaths } from "./throwaway-worktree.ts";

export const CHECK_STEPS = ["typecheck", "lint", "test", "check:secrets"] as const;
export type CheckStep = (typeof CHECK_STEPS)[number] | "retrieval-check";

export interface StepResult {
  step: CheckStep;
  exitCode: number | null;
  /** What the fingerprint is built from (section 5): error lines, failed test names or reported paths. */
  detail: string[];
  /** The last lines of the output, paths relative to the worktree: the evidence a person or a retry reads. */
  tail: string;
}

export interface VerifierResult {
  changedFiles: string[];
  protectedPaths: string[];
  steps: StepResult[];
  green: boolean;
  failingStep: CheckStep | null;
  failingDetail: string[];
  fingerprint: string | null;
  diffStat: string;
}

// Protected: the course's paths, and (Part 9 review) every file that decides what "green" means or brings
// in a dependency: package files, the test/lint/type configs, the secret scanner and the git hooks.
const PROTECTED = new RegExp([
  /^(test\/acceptance\/|data\/|\.claude\/|\.githooks\/)/.source,
  /^(\.mcp\.json|package\.json|package-lock\.json|scripts\/check-secrets\.mjs)$/.source,
  /^(vitest|vite|eslint)\.config\.[cm]?[jt]s$|^tsconfig[^/]*\.json$/.source,
  /(^|\/)\.env[^/]*$/.source,
].join("|"));
export const protectedPathsIn = (paths: string[]) => paths.filter((p) => PROTECTED.test(p));

// The checks run code the worker wrote. They get no git credentials or agent sockets (review finding):
// a test can't push or reach a forge with the person's identity. See docs/threat-model.md G16.
const CREDENTIAL_VARS = /^(SSH_AUTH_SOCK|GIT_ASKPASS|SSH_ASKPASS|GH_TOKEN|GITHUB_TOKEN|GIT_CREDENTIAL.*|ANTHROPIC_.*|CLAUDE_CODE_OAUTH_TOKEN)$/;
export const checkEnv = (): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(process.env).filter(([k]) => !CREDENTIAL_VARS.test(k)));

const run = (cwd: string, command: string, args: string[]) =>
  spawnSync(command, args, { cwd, encoding: "utf8", timeout: 600_000, env: checkEnv(), shell: process.platform === "win32" });

// Removes the worktree's own folder from output, so two attempts in two temp folders look the same.
const relativize = (text: string, dir: string) => text.split(`${dir}/`).join("").split(dir).join(".");
// eslint-disable-next-line no-control-regex -- stripping ANSI colour codes is the point
const plain = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, "");
const noDigits = (line: string) => line.replace(/\d+/g, "").trim();

export function fingerprint(step: string, detail: string[]): string {
  return createHash("sha256").update(`${step}\n${detail.join("\n")}`).digest("hex");
}

interface VitestJson {
  testResults?: { name?: string; status?: string; message?: string; assertionResults?: { fullName?: string; status?: string }[] }[];
}

/** Section 5's `detail` per step. Exported for tests. */
export function stepDetail(step: CheckStep, output: string, vitest?: VitestJson): string[] {
  const detail = rawDetail(step, output, vitest);
  // Nothing recognisable (a timeout, a crash): use the output's last lines, so two different crashes
  // don't share one fingerprint.
  return detail.length > 0 ? detail : output.trim().split("\n").slice(-10).map(noDigits).filter(Boolean);
}

function rawDetail(step: CheckStep, output: string, vitest?: VitestJson): string[] {
  const lines = output.split("\n");
  if (step === "typecheck") return lines.filter((l) => /error TS\d+/.test(l)).map(noDigits).sort();
  if (step === "lint") {
    // ESLint's stylish output names the file on its own line; keep it with each error.
    let file = "";
    const errors: string[] = [];
    for (const l of lines) {
      if (/^\S.*\.(m?[jt]s|json)$/.test(l.trim()) && !/^\s/.test(l)) file = l.trim();
      else if (/\berror\b/.test(l) && !/problems?\b/.test(l)) errors.push(`${file} ${noDigits(l)}`.trim());
    }
    return errors.sort();
  }
  if (step === "check:secrets") return lines.filter((l) => /^\s{2}\S/.test(l)).map((l) => l.trim().split(":")[0] ?? "").sort();
  if (step === "test") {
    const failed: string[] = [];
    for (const file of vitest?.testResults ?? []) {
      const names = (file.assertionResults ?? []).filter((a) => a.status === "failed").map((a) => a.fullName ?? "?");
      // A file that fails to load has no failed assertions, only a message.
      if (names.length === 0 && file.status === "failed") failed.push(`${file.name ?? "?"} (suite failed)`);
      failed.push(...names);
    }
    return failed.length > 0 ? failed.sort() : lines.filter((l) => /FAIL|Error/.test(l)).map(noDigits).sort();
  }
  return lines.filter((l) => /miss|error|fail/i.test(l)).map(noDigits).sort();
}

function runStep(dir: string, step: CheckStep): StepResult {
  let vitest: VitestJson | undefined;
  let result;
  if (step === "test") {
    const tmp = mkdtempSync(join(tmpdir(), "sta-vitest-"));
    const out = join(tmp, "vitest.json");
    result = run(dir, "npm", ["test", "--", "--reporter=default", "--reporter=json", `--outputFile.json=${out}`]);
    try {
      vitest = JSON.parse(readFileSync(out, "utf8")) as VitestJson;
    } catch {
      vitest = undefined; // vitest crashed before writing: fall back to the text output
    }
    rmSync(tmp, { recursive: true, force: true });
  } else {
    result = run(dir, "npm", ["run", step]);
  }
  const output = plain(relativize(`${result.stdout ?? ""}${result.stderr ?? ""}`, dir));
  if (vitest) vitest = JSON.parse(relativize(JSON.stringify(vitest), dir)) as VitestJson;
  const exitCode = result.status;
  return {
    step,
    exitCode,
    detail: exitCode === 0 ? [] : stepDetail(step, output, vitest),
    tail: output.trim().split("\n").slice(-40).join("\n"),
  };
}

/** `npm run check`'s four steps one by one in `dir` (also used by the rollback drill on the checkout). */
export const runCheckSteps = (dir: string): StepResult[] => CHECK_STEPS.map((step) => runStep(dir, step));

/** Runs in the worktree after the worker exits. `full: false` only looks at git (used after a worker error). */
export function verifyWorktree(dir: string, full = true): VerifierResult {
  const porcelain = run(dir, "git", ["status", "--porcelain", "-z", "--untracked-files=all", ...NOT_NODE_MODULES]).stdout ?? "";
  const changedFiles = parsePorcelainPaths(porcelain);
  // .env files are git-ignored, so `status` never lists them: ask for ignored files too.
  const ignored = (run(dir, "git", ["ls-files", "--others", "--ignored", "--exclude-standard"]).stdout ?? "").split("\n");
  const protectedPaths = [...new Set([...protectedPathsIn(changedFiles), ...protectedPathsIn(ignored.filter((p) => /\.env/.test(p)))])];
  // Stage in the worktree's own index: check:secrets scans the index, and the diff stat needs new files.
  run(dir, "git", ["add", "-A", ...NOT_NODE_MODULES]);
  const diffStat = (run(dir, "git", ["diff", "--cached", "--stat", "HEAD"]).stdout ?? "").trim().split("\n").at(-1)?.trim() ?? "";

  const steps: StepResult[] = [];
  if (full && changedFiles.length > 0 && protectedPaths.length === 0) {
    for (const step of CHECK_STEPS) steps.push(runStep(dir, step));
    if (changedFiles.some((p) => p.startsWith("src/handbook-"))) steps.push(runStep(dir, "retrieval-check"));
  }
  const failing = steps.find((s) => s.exitCode !== 0) ?? null;
  const green = changedFiles.length > 0 && protectedPaths.length === 0 && steps.length > 0 && failing === null;
  return {
    changedFiles,
    protectedPaths,
    steps,
    green,
    failingStep: failing?.step ?? null,
    failingDetail: failing?.detail ?? [],
    fingerprint: failing ? fingerprint(failing.step, failing.detail) : null,
    diffStat,
  };
}

/**
 * The evidence a retry gets: exit codes, then the failing step's output. Exit codes come from code; the
 * output can include text printed by code the last worker wrote, so the prompt marks it as data.
 */
export function verifierEvidence(v: VerifierResult): string {
  const codes = v.steps.map((s) => `npm run ${s.step === "test" ? "test" : s.step} -> exit ${s.exitCode}`).join("\n");
  const failing = v.steps.find((s) => s.exitCode !== 0);
  const detail = v.failingDetail.length > 0 ? `\nFailing: ${v.failingDetail.slice(0, 20).join("; ")}` : "";
  return `${codes}${detail}${failing ? `\nLast lines of ${failing.step}:\n${failing.tail}` : ""}`;
}
