// Part 9 lab: the bounded issue-fixing loop. Works through issues/ISSUE-*.md labelled `auto-fix: true`,
// one worker (`claude -p`, Team seat) per iteration in a fresh worktree on fix/<ID>, and stops on the rules
// in docs/loop-design.md. It never pushes, merges or opens a pull request: a person reviews fix/<ID>.
//
//   npm run fix-issues -- [--max-attempts 1..3] [--max-iterations 1..10] [--max-turns 1..30]
//                         [--max-run-cost 0.01..5] [--max-call-cost 0.01..1] [--worker-stand-in crash|protected|failing]
import { join } from "node:path";
import { parseArgs } from "node:util";
import { runFixIssues } from "./fix-issues-controller.ts";
import { DEFAULT_LIMITS, resolveLimits } from "./fix-issues-limits.ts";
import { realDeps } from "./fix-issues-real-deps.ts";
import { REPO_ROOT } from "./handbook-chunker.ts";
import { seatOnlyProblem } from "./seat-only-guard.ts";

const { values } = parseArgs({
  options: {
    "max-attempts": { type: "string" },
    "max-iterations": { type: "string" },
    "max-turns": { type: "string" },
    "max-run-cost": { type: "string" },
    "max-call-cost": { type: "string" },
    "worker-stand-in": { type: "string" },
  },
});

const usage = "Usage: npm run fix-issues -- [--max-attempts N] [--max-iterations N] [--max-turns N] [--max-run-cost USD] " +
  "[--max-call-cost USD] [--worker-stand-in crash|protected|failing]. Flags may only lower the limits in src/fix-issues-limits.ts.";
const resolved = resolveLimits({
  maxAttempts: values["max-attempts"], maxIterations: values["max-iterations"], maxTurns: values["max-turns"],
  maxRunCostUsd: values["max-run-cost"], maxCallCostUsd: values["max-call-cost"],
});
if (!resolved.ok) {
  console.error(`${resolved.reason}\n${usage}`);
  process.exit(1);
}
const standIn = values["worker-stand-in"];
const STAND_INS: Record<string, string> = {
  crash: "claude-stand-in-crash.mjs (exits 1, no result event)",
  protected: "claude-stand-in-protected.mjs (edits test/acceptance/ in its worktree, reports success)",
  failing: "claude-stand-in-failing.mjs (the same test-breaking change every attempt, reports success)",
};
if (standIn !== undefined && !(standIn in STAND_INS)) {
  console.error(`--worker-stand-in knows ${Object.keys(STAND_INS).join(", ")}, got "${standIn}"\n${usage}`);
  process.exit(1);
}
const notSeat = seatOnlyProblem();
if (notSeat) {
  console.error(notSeat);
  process.exit(1);
}

const limits = resolved.limits;
const changed = Object.entries(limits).filter(([k, v]) => DEFAULT_LIMITS[k as keyof typeof limits] !== v);
console.log(`Limits: ${Object.entries(limits).map(([k, v]) => `${k}=${v}`).join(" ")}${changed.length > 0 ? " (lowered by flag)" : ""}`);
if (standIn) console.log(`Worker: stand-in scripts/${STAND_INS[standIn]}, no Claude calls.`);

const deps = realDeps({
  root: REPO_ROOT,
  workerCommand: standIn ? [process.execPath, join(REPO_ROOT, "scripts", `claude-stand-in-${standIn}.mjs`)] : ["claude"],
  onLog: (r) => {
    if (r.event === "run-stop") {
      console.log(`\nRun stopped: ${String(r.stop_rule)} after ${String(r.iterations)} iteration(s), est. $${String(r.run_cost_usd)}`);
      return;
    }
    const w = r.worker as { turns: number | null; cost_usd: number | null; subtype: string };
    console.log(`[${String(r.iteration)}] ${String(r.issue)} attempt ${String(r.attempt)}: ${w.subtype}, ${w.turns ?? "?"} turns, ` +
      `$${w.cost_usd?.toFixed(2) ?? "?"} | check ${JSON.stringify(r.check)} | ${String(r.stop_rule ?? "retry")} -> ${String(r.status_after)}`);
  },
});
const result = await runFixIssues(deps, limits);
console.log(`Log: logs/part-09-fix-issues.jsonl. Branches fix/<ID> wait for a person: npm run fix-issues:approve -- --issue <ID> --approved-by "<name>".`);
if (result.stopRule === "budget" || result.stopRule === "max-iterations") console.log("Issues left in-progress are picked up by the next run.");
