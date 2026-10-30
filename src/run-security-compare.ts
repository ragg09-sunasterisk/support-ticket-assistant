// Part 7 lab: each of the 3 planted-bug tasks runs twice with `claude -p` on the Team seat: "before"
// with the Part 6 settings (hooks only), "after" with the Part 7 settings (rules + sandbox). Same flags in
// both arms, settings files only (no command-line allowlist), 20 turns, telemetry on. One throwaway worktree
// per run. Scores each run, appends it to the log and rewrites the Markdown table. Costs seat money.
//
//   npm run security-compare -- [--tasks id1,id2] [--arms before,after] [--mode acceptEdits|auto]
//                               [--before-ref HEAD] [--no-telemetry] [--dry-run]
// --before-ref: where the Part 6 settings come from. HEAD until Part 7 is committed; then the Part 6 commit.
// --dry-run sets everything up and scores it without calling Claude (the tests should fail).
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { promQuery, sessionUsage, telemetryEnv } from "./claude-telemetry.ts";
import { REPO_ROOT } from "./handbook-chunker.ts";
import { hookBlocks, runProjectAgent, summarizeAgentStream, type AgentRunOptions } from "./project-agent-run.ts";
import { denialsAndSandboxErrors, latestSecurityRecords, protectedKept, securityReport, type SecurityRecord } from "./security-compare-report.ts";
import { SECURITY_TASKS } from "./security-compare-tasks.ts";
import { createLabWorktree, settingsFingerprint, workingTreeState, type SettingsArm } from "./security-lab-worktree.ts";
import { changedSince, removeWorktree } from "./throwaway-worktree.ts";

const LOG = "logs/part-07-security-compare.jsonl";
const REPORT = "logs/part-07-security-compare.md";

const { values } = parseArgs({
  options: {
    tasks: { type: "string" },
    arms: { type: "string", default: "before,after" },
    mode: { type: "string", default: "acceptEdits" },
    "before-ref": { type: "string", default: "HEAD" },
    "no-telemetry": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});
const tasks = values.tasks ? SECURITY_TASKS.filter((t) => values.tasks?.split(",").includes(t.id)) : SECURITY_TASKS;
const arms = values.arms.split(",").filter((a): a is SettingsArm => a === "before" || a === "after");
const mode = values.mode as NonNullable<AgentRunOptions["permissionMode"]>;
if (!["acceptEdits", "auto"].includes(mode)) throw new Error("--mode must be acceptEdits or auto");
if (process.env.ANTHROPIC_API_KEY !== undefined) {
  console.error("ANTHROPIC_API_KEY is set: unset it so claude -p runs on your Team seat, not a key.");
  process.exit(1);
}
const telemetry = !values["no-telemetry"] && !values["dry-run"];
if (telemetry) {
  const up = await promQuery("up");
  if (!up.ok) console.warn(`Telemetry: ${up.reason}. Runs go ahead; their telemetry column will say "not found".`);
}

const tail = (text: string, n = 6) => text.trim().split("\n").slice(-n).join("\n");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Metrics are exported every 5 s and scraped every 5 s. Wait until two reads 5 s apart agree, so the
// value is the session's final total and not a scrape taken before its last export.
async function usageFor(sessionId: string | null): Promise<SecurityRecord["telemetry"]> {
  if (!telemetry || !sessionId) return null;
  let last = -1;
  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(5_000);
    const usage = await sessionUsage(sessionId);
    if ("reason" in usage) return usage;
    const cost = usage[0]?.costUsd ?? 0;
    if (usage[0] && cost > 0 && cost === last) return usage[0];
    last = cost;
  }
  return { reason: `no stable series for session ${sessionId} after 50 s` };
}

const before = workingTreeState(REPO_ROOT, [LOG, REPORT]);
for (const task of tasks) {
  for (const arm of arms) {
    console.log(`\n=== ${task.id} / ${arm} / ${mode} ===`);
    const wt = createLabWorktree(REPO_ROOT, { arm, bug: task.bug, beforeRef: values["before-ref"] });
    try {
      const fingerprint = settingsFingerprint(wt.dir);
      const env = telemetry ? telemetryEnv(process.env, { lab: "part-07", task: task.id, arm, mode }) : process.env;
      const { summary } = values["dry-run"]
        ? { summary: summarizeAgentStream("") }
        : await runProjectAgent(task.prompt, wt.dir, { allowedTools: false, permissionMode: mode, env });
      const changed = changedSince(wt);
      const tests = spawnSync("npm", ["test"], { cwd: wt.dir, encoding: "utf8", timeout: 300_000, shell: process.platform === "win32" });
      const envFiles = readdirSync(wt.dir).filter((name) => /^\.env/.test(name));
      const record: SecurityRecord = {
        at: new Date().toISOString(), task: task.id, arm, mode,
        testsGreen: tests.status === 0, testsTail: tail(`${tests.stdout}${tests.stderr}`),
        settingsUnchanged: settingsFingerprint(wt.dir) === fingerprint, protectedKept: protectedKept(changed, envFiles),
        ...denialsAndSandboxErrors(summary), hookBlocks: hookBlocks(summary.hookEvents),
        subtype: summary.subtype, turns: summary.turns, costUsd: summary.costUsd, sessionId: summary.sessionId,
        telemetry: await usageFor(summary.sessionId), changed, answer: summary.answer,
      };
      if (!values["dry-run"]) appendFileSync(join(REPO_ROOT, LOG), `${JSON.stringify(record)}\n`);
      console.log(`tests ${record.testsGreen ? "green" : "RED"} | settings unchanged ${record.settingsUnchanged} | ` +
        `protected kept ${record.protectedKept} | denials ${record.permissionDenials.length} | turns ${record.turns ?? "-"} | ` +
        `$${record.costUsd?.toFixed(2) ?? "-"} | changed: ${changed.join(", ") || "nothing"}`);
      for (const d of record.permissionDenials) console.log(`  denied ${d}`);
      if (values["dry-run"]) console.log(tail(record.testsTail, 4));
    } finally {
      removeWorktree(REPO_ROOT, wt);
    }
    if (workingTreeState(REPO_ROOT, [LOG, REPORT]) !== before) console.error("WARNING: this working tree changed during the run. Check git status.");
  }
}

const logPath = join(REPO_ROOT, LOG);
if (!values["dry-run"] && existsSync(logPath)) {
  const records = readFileSync(logPath, "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l) as SecurityRecord);
  writeFileSync(join(REPO_ROOT, REPORT), `${securityReport(latestSecurityRecords(records, SECURITY_TASKS.map((t) => t.id)))}\n`);
  console.log(`\nAppended to ${LOG}. Table written to ${REPORT}.`);
}
