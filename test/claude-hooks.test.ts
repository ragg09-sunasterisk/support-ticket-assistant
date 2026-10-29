// Checks the Part 6 Claude Code hooks in .claude/hooks by feeding them hook input on stdin, the way
// Claude Code does (no Claude calls). Exit 2 = blocked, with the reason on stderr.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/handbook-chunker.ts";

function runHook(script: string, input: object) {
  const result = spawnSync(process.execPath, [join(REPO_ROOT, ".claude", "hooks", script)], {
    input: JSON.stringify({ cwd: REPO_ROOT, ...input }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT },
    timeout: 120_000,
  });
  return { code: result.status, stderr: result.stderr };
}

const guard = (tool_name: string, tool_input: object) => runHook("guard-protected-files.mjs", { tool_name, tool_input });
const abs = (path: string) => join(REPO_ROOT, path);
const envFile = [".", "env"].join(""); // spelled out so this file's own commands never name it

describe("PreToolUse guard-protected-files", { timeout: 30_000 }, () => {
  it("blocks any tool that touches a .env file, with a one-line reason", () => {
    for (const [tool, input] of [
      ["Read", { file_path: abs(envFile) }],
      ["Read", { file_path: abs(`${envFile}.local`) }],
      ["Write", { file_path: abs(`${envFile}.example`) }],
      ["Grep", { pattern: "KEY", path: envFile }],
      ["Bash", { command: `cat ${envFile}` }],
      ["Bash", { command: `source ./${envFile}.local && npm test` }],
    ] as const) {
      const { code, stderr } = guard(tool, input);
      expect(code, `${tool} ${JSON.stringify(input)}`).toBe(2);
      expect(stderr.trim().split("\n")).toHaveLength(1);
    }
  });

  it("blocks edits under data/handbook/ and test/acceptance/, also from the shell", () => {
    expect(guard("Edit", { file_path: abs("data/handbook/09-payments-payouts-and-refunds.md") }).code).toBe(2);
    expect(guard("Write", { file_path: abs("test/acceptance/new.test.ts") }).code).toBe(2);
    expect(guard("Bash", { command: "sed -i s/14/10/ data/handbook/09-payments-payouts-and-refunds.md" }).code).toBe(2);
    expect(guard("Bash", { command: "rm test/acceptance/ticket-triage.acceptance.test.ts" }).code).toBe(2);
  });

  it("allows reads of protected folders and ordinary work", () => {
    expect(guard("Read", { file_path: abs("data/handbook/09-payments-payouts-and-refunds.md") }).code).toBe(0);
    expect(guard("Bash", { command: "grep -n refund data/handbook/09-payments-payouts-and-refunds.md" }).code).toBe(0);
    expect(guard("Bash", { command: "npx vitest run test/acceptance" }).code).toBe(0);
    expect(guard("Bash", { command: "node -e 'console.log(process.env.HOME)'" }).code).toBe(0);
    expect(guard("Edit", { file_path: abs("src/handbook-search.ts") }).code).toBe(0);
  });
});

describe("PostToolUse check-edited-typescript", () => {
  it("ignores files that are not .ts", () => {
    expect(runHook("check-edited-typescript.mjs", { tool_name: "Write", tool_input: { file_path: abs("README.md") } }).code).toBe(0);
  });

  // tsc over the whole project plus eslint: several seconds when the suite runs in parallel.
  it("passes a clean .ts file (tsc + eslint)", { timeout: 120_000 }, () => {
    expect(runHook("check-edited-typescript.mjs", { tool_name: "Edit", tool_input: { file_path: abs("src/retrieval-set.ts") } }).code).toBe(0);
  });
});

describe("Stop run-checks-before-stop", () => {
  it("lets Claude stop when it is already continuing because of this hook", () => {
    expect(runHook("run-checks-before-stop.mjs", { stop_hook_active: true }).code).toBe(0);
  });
});
