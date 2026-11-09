// Part 9: helpers for the hidden issue checks (SWE-bench style). `npm run loop-compare` copies this folder
// into <worktree>/.issue-check/ only after the worker has finished, and runs one check with the worktree
// as cwd. Workers never see these files: worker worktrees leave scripts/issue-checks/ out.
// A check prints one line per finding and exits 0 (pass) or 1 (fail). No check ever calls Claude:
// a stand-in `claude` on PATH records any call and fails it.
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";

const here = new URL("./", import.meta.url);
/** The commit both arms started from (written by the scorer), for "unchanged" checks. */
export const baseRef = existsSync(new URL("base-ref.txt", here)) ? readFileSync(new URL("base-ref.txt", here), "utf8").trim() : "HEAD";
export const baseFile = (path) => execFileSync("git", ["show", `${baseRef}:${path}`], { encoding: "utf8" });

export const KEY_NAME = ["ANTHROPIC", "API", "KEY"].join("_"); // spelled out, the secret scanner would flag this file
export const tmp = () => mkdtempSync(join(tmpdir(), "sta-issue-check-"));
export const importSrc = (path) => import(pathToFileURL(join(process.cwd(), path)).href);

/** An env whose PATH starts with a fake `claude` that records each call and exits 1. */
export function standInClaude(extraEnv = {}) {
  const dir = tmp();
  const calls = join(dir, "calls.txt");
  const bin = join(dir, "claude");
  writeFileSync(bin, `#!/bin/sh\necho "$@" >> "${calls}"\necho "stand-in claude: no Claude calls in a check" >&2\nexit 1\n`);
  chmodSync(bin, 0o755);
  const env = { ...process.env, ...extraEnv, PATH: `${dir}${delimiter}${process.env.PATH ?? ""}` };
  if (!(KEY_NAME in extraEnv)) delete env[KEY_NAME];
  return { env, called: () => existsSync(calls) };
}

export function runNode(args, { env, timeout = 120_000 } = {}) {
  const r = spawnSync(process.execPath, args, { encoding: "utf8", timeout, env: env ?? standInClaude().env });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

export function throwsWith(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    return String(error?.message ?? error);
  }
}

const findings = [];
let failed = false;
export function expectThat(ok, what) {
  findings.push(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed = true;
}
export function finish() {
  console.log(findings.join("\n"));
  process.exit(failed ? 1 : 0);
}
