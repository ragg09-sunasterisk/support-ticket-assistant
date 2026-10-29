// Part 6: run Claude Code as a coding agent in a project folder (`claude -p`, Team seat) and summarize
// its stream-json output: answer, turns, cost, tool calls and hook events. Used by the hook proof and
// the with/without-guide comparison. Project settings load, so the repo's hooks and .mcp.json apply.
import { homedir } from "node:os";
import { runClaudeProcess, type ProcessOutput } from "./run-claude-process.ts";

export const AGENT_MAX_TURNS = 20;
export const AGENT_MODEL = "claude-opus-5-5";

// Bash commands the agent may run without a prompt (print mode can't ask). Everything else is denied,
// unless a hook blocks it first: PreToolUse hooks run before the permission check.
const ALLOWED_TOOLS = [
  "Bash(npm run *)", "Bash(npm test*)", "Bash(npx vitest *)", "Bash(npx tsc*)", "Bash(npx eslint *)",
  "Bash(node *)", "Bash(git diff*)", "Bash(git status*)", "Bash(ls *)", "Bash(cat *)", "Bash(grep *)",
  "mcp__handbook__search_handbook",
];

/**
 * Only the project's own settings and guide: user settings are skipped, and the user's own memory files
 * (~/.claude/CLAUDE.md, ~/.claude/rules) and auto memory are excluded, so they can't stand in for a guide.
 */
export function agentRunArgs(prompt: string, maxTurns = AGENT_MAX_TURNS): string[] {
  const userClaudeDir = `${homedir().replaceAll("\\", "/")}/.claude/**`;
  return [
    "-p", prompt,
    "--output-format", "stream-json", "--verbose", "--include-hook-events",
    "--setting-sources", "project",
    "--settings", JSON.stringify({ claudeMdExcludes: [userClaudeDir], autoMemoryEnabled: false }),
    "--mcp-config", ".mcp.json", "--strict-mcp-config",
    "--permission-mode", "acceptEdits",
    "--allowedTools", ...ALLOWED_TOOLS,
    "--max-turns", String(maxTurns),
    "--model", AGENT_MODEL,
    "--no-session-persistence",
  ];
}

export interface HookEvent {
  event: string; // PreToolUse, PostToolUse, Stop, …
  name: string; // e.g. "PreToolUse:Read"
  exitCode: number | null;
  stderr: string;
}

export interface AgentRunSummary {
  answer: string;
  subtype: string; // "success", "error_max_turns", … or "no result"
  turns: number | null;
  costUsd: number | null;
  toolCalls: { name: string; input: unknown }[];
  hookEvents: HookEvent[];
}

interface StreamLine {
  type?: string;
  subtype?: string;
  hook_event?: string;
  hook_name?: string;
  exit_code?: number;
  stderr?: string;
  message?: { content?: { type?: string; name?: string; input?: unknown }[] };
  result?: string;
  num_turns?: number;
  total_cost_usd?: number;
}

export function summarizeAgentStream(stdout: string): AgentRunSummary {
  const summary: AgentRunSummary = { answer: "", subtype: "no result", turns: null, costUsd: null, toolCalls: [], hookEvents: [] };
  for (const line of stdout.split("\n")) {
    let event: StreamLine;
    try {
      event = JSON.parse(line) as StreamLine;
    } catch {
      continue;
    }
    if (event.type === "assistant") {
      for (const block of event.message?.content ?? []) {
        if (block.type === "tool_use") summary.toolCalls.push({ name: String(block.name), input: block.input });
      }
    }
    if (event.type === "system" && event.subtype === "hook_response") {
      const exitCode = event.exit_code ?? null;
      summary.hookEvents.push({ event: String(event.hook_event), name: String(event.hook_name), exitCode, stderr: event.stderr ?? "" });
    }
    if (event.type === "result") {
      summary.answer = event.result ?? "";
      summary.subtype = event.subtype ?? "unknown";
      summary.turns = event.num_turns ?? null;
      summary.costUsd = event.total_cost_usd ?? null;
    }
  }
  return summary;
}

/** How many times each hook event blocked (exit code 2), e.g. { PreToolUse: 2, Stop: 1 }. */
export function hookBlocks(events: HookEvent[]): Record<string, number> {
  const blocks: Record<string, number> = {};
  for (const e of events.filter((h) => h.exitCode === 2)) blocks[e.event] = (blocks[e.event] ?? 0) + 1;
  return blocks;
}

/** Runs one agent session in `cwd`. Up to 20 turns of tool use can take a while, so the timeout is 15 minutes. */
export async function runProjectAgent(prompt: string, cwd: string): Promise<{ output: ProcessOutput; summary: AgentRunSummary }> {
  const output = await runClaudeProcess(agentRunArgs(prompt), "", 900_000, cwd);
  return { output, summary: summarizeAgentStream(output.stdout) };
}
