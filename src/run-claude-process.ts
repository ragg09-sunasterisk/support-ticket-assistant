// Runs `claude` once and collects its output. Never rejects: callers decide what a failure means.
import { spawn } from "node:child_process";

export interface ProcessOutput {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  spawnError?: string;
}

export type ClaudeRunner = (args: string[], input: string) => Promise<ProcessOutput>;

// The input goes in on stdin and no shell is involved, so ticket text can't be interpreted as shell syntax.
// `cwd` (Part 6) starts claude in another folder, such as a throwaway git worktree. `env` (Part 7)
// replaces the environment, e.g. to turn telemetry on for one run.
export function runClaudeProcess(
  args: string[], input: string, timeoutMs = 180_000, cwd?: string, env?: NodeJS.ProcessEnv,
): Promise<ProcessOutput> {
  return new Promise((resolve) => {
    const child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"], timeout: timeoutMs, cwd, env });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (output: Omit<ProcessOutput, "stdout" | "stderr">) => {
      if (settled) return;
      settled = true;
      resolve({ ...output, stdout, stderr });
    };
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    // If claude is missing or exits early, writing stdin fails; the close/error handlers report it.
    child.stdin.on("error", () => {});
    child.on("error", (error) => finish({ code: null, signal: null, spawnError: error.message }));
    child.on("close", (code, signal) => finish({ code, signal }));
    child.stdin.end(input);
  });
}

// Returns why the process failed, or null if it exited cleanly.
export function processFailure(output: ProcessOutput): string | null {
  if (output.spawnError) return `Could not start claude: ${output.spawnError}`;
  if (output.code === 0) return null;
  const detail = output.stderr.trim() || output.stdout.slice(0, 200);
  return `claude exited with ${output.signal ?? output.code}: ${detail}`;
}
