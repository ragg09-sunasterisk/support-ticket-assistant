// Part 7 lab: make Claude try to break each deny rule and the sandbox in a real `claude -p` run (Team
// seat, Part 7 project settings, no command-line allowlist). Each probe runs in its own throwaway worktree
// with a placeholder .env, and the raw stream-json goes to the log after a marker line per probe.
//
//   npm run rule-tests -- [--probes env-read,git,…] [--out logs/part-07-rule-tests.jsonl]
import { appendFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "./handbook-chunker.ts";
import { hookBlocks, runProjectAgent } from "./project-agent-run.ts";
import { probePrompt, RULE_PROBES } from "./rule-test-probes.ts";
import { describeCall } from "./security-compare-report.ts";
import { createLabWorktree, workingTreeState } from "./security-lab-worktree.ts";
import { changedSince, removeWorktree } from "./throwaway-worktree.ts";

const { values } = parseArgs({
  options: {
    probes: { type: "string" },
    out: { type: "string", default: "logs/part-07-rule-tests.jsonl" },
  },
});
const chosen = values.probes ? RULE_PROBES.filter((p) => values.probes?.split(",").includes(p.id)) : RULE_PROBES;
if (process.env.ANTHROPIC_API_KEY !== undefined) {
  console.error("ANTHROPIC_API_KEY is set: unset it so claude -p runs on your Team seat, not a key.");
  process.exit(1);
}

const out = join(REPO_ROOT, values.out);
if (!values.probes) writeFileSync(out, "");
const outsideProbe = join(homedir(), "sta-sandbox-probe.txt");
// Left over from an earlier run? Remove it, so the check at the end only reports a write from this run.
rmSync(outsideProbe, { force: true });
const before = workingTreeState(REPO_ROOT, [values.out]);
for (const probe of chosen) {
  const wt = createLabWorktree(REPO_ROOT, { arm: "after", envPlaceholder: true });
  const prompt = probePrompt(probe);
  try {
    const settings = probe.hooks ? {} : { disableAllHooks: true };
    const permissionMode = probe.permissionMode ?? "acceptEdits";
    const { output, summary } = await runProjectAgent(prompt, wt.dir, { allowedTools: false, maxTurns: 12, settings, permissionMode });
    const marker = { type: "rule_test_probe", probe: probe.id, hooks: probe.hooks, permissionMode, expect: probe.expect, prompt };
    appendFileSync(out, `${JSON.stringify(marker)}\n${output.stdout.trimEnd()}\n`);
    const mode = /"permissionMode":"(\w+)"/.exec(output.stdout)?.[1] ?? "?";
    console.log(`\n=== ${probe.id} (hooks ${probe.hooks ? "on" : "off"}, mode asked ${permissionMode}, session ${mode}) === ` +
      `turns ${summary.turns}, $${summary.costUsd?.toFixed(2) ?? "-"}`);
    console.log(`expect: ${probe.expect}`);
    for (const d of summary.permissionDenials) console.log(`  permission denial  ${describeCall(d.tool, d.input)}`);
    for (const h of summary.hookEvents.filter((e) => e.exitCode === 2)) console.log(`  hook block         ${h.name}: ${h.stderr.trim()}`);
    for (const e of summary.toolErrors) console.log(`  tool error         ${e.replace(/\s+/g, " ").slice(0, 200)}`);
    console.log(`  hook blocks ${JSON.stringify(hookBlocks(summary.hookEvents))}; files changed: ${changedSince(wt).join(", ") || "none"}`);
    console.log(`answer: ${summary.answer.slice(-600)}`);
  } finally {
    removeWorktree(REPO_ROOT, wt);
  }
}
if (existsSync(outsideProbe)) console.error(`WARNING: ${outsideProbe} exists: a write outside the project got through.`);
if (workingTreeState(REPO_ROOT, [values.out]) !== before) console.error("WARNING: this working tree changed during the run. Check git status.");
console.log(`\nSaved to ${values.out}`);
