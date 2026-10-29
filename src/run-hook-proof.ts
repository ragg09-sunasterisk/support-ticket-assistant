// Part 6 lab: make each project hook fire in a real `claude -p` run (Team seat, project settings) and
// save the stream-json output. Each probe runs in its own throwaway worktree with the guide present, so
// the type error and the failing test never reach this working tree.
//
//   npm run hook-proof -- [--probes env,handbook,…] [--out logs/part-06-hook-transcript.jsonl]
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "./handbook-chunker.ts";
import { hookBlocks, runProjectAgent } from "./project-agent-run.ts";
import { createWorktree, NOT_COPIED, removeWorktree, uncommittedFiles } from "./throwaway-worktree.ts";

const HOOK_CHECK = "I am checking this repo's Claude Code hooks. Attempt each step once, exactly as written. " +
  "If a hook blocks a step, quote its message and move on; don't look for a way around it.";

const PROBES = [
  { id: "env", prompt: `${HOOK_CHECK}\n1. Use the Read tool on .env.\n2. Run \`cat .env\` with Bash.` },
  { id: "handbook", prompt: `${HOOK_CHECK}\n1. Use the Edit tool on data/handbook/09-payments-payouts-and-refunds.md to change "5 to 14 banking days" to "5 to 10 banking days".` },
  { id: "acceptance", prompt: `${HOOK_CHECK}\n1. Use the Edit tool on test/acceptance/ticket-triage.acceptance.test.ts to change "toHaveLength(8)" to "toHaveLength(9)".` },
  {
    id: "typescript",
    prompt: `${HOOK_CHECK}\n1. Append this function to src/retrieval-set.ts with the Edit tool, exactly as written (it has a deliberate type error):\n` +
      "```ts\nexport function countAnswerable(questions: RetrievalQuestion[]): number {\n  return questions.filter((q) => q.answerable).length.toString();\n}\n```\n" +
      "2. Then fix whatever the hook reports.",
  },
  {
    id: "stop",
    prompt: `${HOOK_CHECK}\n1. Create test/hook-proof.test.ts with one Vitest test that expects 1 + 1 to be 3.\n` +
      "2. Don't run any tests yourself; just finish. If something reports a failure when you finish, fix the test so it is correct.",
  },
];

const { values } = parseArgs({
  options: { probes: { type: "string" }, out: { type: "string", default: "logs/part-06-hook-transcript.jsonl" } },
});
const chosen = values.probes ? PROBES.filter((p) => values.probes?.split(",").includes(p.id)) : PROBES;
if (process.env.ANTHROPIC_API_KEY !== undefined) {
  console.error("ANTHROPIC_API_KEY is set: unset it so claude -p runs on your Team seat, not a key.");
  process.exit(1);
}

const out = join(REPO_ROOT, values.out);
if (!values.probes) writeFileSync(out, "");
const copy = uncommittedFiles(REPO_ROOT, NOT_COPIED);
for (const probe of chosen) {
  const wt = createWorktree(REPO_ROOT, copy);
  // A harmless placeholder, so the .env probes are blocked by the hook and not by "file not found".
  writeFileSync(join(wt.dir, ".env"), "HOOK_PROOF_PLACEHOLDER=not-a-secret\n");
  try {
    const { output, summary } = await runProjectAgent(probe.prompt, wt.dir);
    // One marker line per probe, then the raw stream-json lines exactly as claude printed them.
    appendFileSync(out, `${JSON.stringify({ type: "hook_proof_probe", probe: probe.id, prompt: probe.prompt })}\n${output.stdout.trimEnd()}\n`);
    const fired = summary.hookEvents.map((h) => `${h.name} exit ${h.exitCode}`).join(", ");
    console.log(`\n=== ${probe.id} === turns ${summary.turns}, $${summary.costUsd?.toFixed(2)}, blocks ${JSON.stringify(hookBlocks(summary.hookEvents))}`);
    console.log(`hooks: ${fired || "none"}\nanswer: ${summary.answer.slice(0, 400)}`);
  } finally {
    removeWorktree(REPO_ROOT, wt);
  }
}
console.log(`\nSaved to ${values.out}`);
