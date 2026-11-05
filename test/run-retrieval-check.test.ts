// Runs the retrieval-check CLI (no Claude calls) to check its exit code and error output.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const runCheck = (...args: string[]) =>
  spawnSync(process.execPath, ["src/run-retrieval-check.ts", ...args], { cwd: ROOT, encoding: "utf8" });

describe("run-retrieval-check", () => {
  it("prints one line and exits 1 when the set file doesn't exist", () => {
    const result = runCheck("--set", "evals/retrieval-typo.jsonl");
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe(`can't read retrieval set "evals/retrieval-typo.jsonl" (ENOENT)`);
    expect(result.stdout).toBe("");
  });

  it("still runs with the default set", () => {
    const result = runCheck();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("recall@5");
  });
});
