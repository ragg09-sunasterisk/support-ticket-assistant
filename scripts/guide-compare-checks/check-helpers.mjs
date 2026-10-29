// Shared helpers for the guide-compare task checks. The runner copies this folder into
// <worktree>/.guide-check/ after the agent has finished and runs one check with the worktree as cwd.
// A check prints one line per finding and exits 0 (pass) or 1 (fail).
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const here = new URL("./", import.meta.url);
export const answer = readFileSync(new URL("answer.txt", here), "utf8");
export const baseTree = readFileSync(new URL("base-tree.txt", here), "utf8").trim();
/** Files the agent added, changed or deleted, repo-relative. */
export const changed = readFileSync(new URL("changed.txt", here), "utf8").split("\n").filter((p) => p !== "");

export const git = (args) => execFileSync("git", args, { encoding: "utf8" });
/** A file as it was before the agent started. */
export const baseFile = (path) => git(["show", `${baseTree}:${path}`]);
export const readText = (path) => readFileSync(path, "utf8");
export const runNode = (args) => spawnSync(process.execPath, args, { encoding: "utf8", timeout: 60_000 });

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
