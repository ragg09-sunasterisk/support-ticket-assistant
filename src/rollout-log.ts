// Part 9: the person's side of the rollout (approve-and-merge, the rollback drill) is logged apart from the
// loop's iterations, in logs/part-09-rollout.jsonl. Small shared helpers for those two scripts.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./handbook-chunker.ts";

export const ROLLOUT_LOG = "logs/part-09-rollout.jsonl";

export function logRollout(record: Record<string, unknown>): void {
  appendFileSync(join(REPO_ROOT, ROLLOUT_LOG), `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`);
}

/** git in the person's checkout; returns stdout, throws with stderr on a non-zero exit. */
export function gitHere(args: string[]): string {
  const r = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
}
