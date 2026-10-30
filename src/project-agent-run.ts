// Part 6: run Claude Code as a coding agent in a project folder (`claude -p`, Team seat) and summarize
// its stream-json output: answer, turns, cost, tool calls and hook events. Used by the hook proof and
// the with/without-guide comparison. Project settings load, so the repo's hooks and .mcp.json apply.
// Part 7 adds options (no command-line allowlist, permission mode, extra settings, --agent, env) and
// collects permission denials, failed tool results and the session ID.
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

export interface AgentRunOptions {
  maxTurns?: number;
  /** Part 6 passes ALLOWED_TOOLS on the command line. Part 7 runs set false: only the settings files decide. */
  allowedTools?: boolean;
  permissionMode?: "acceptEdits" | "default" | "auto";
  /** Merged into the `--settings` JSON, e.g. `{ disableAllHooks: true }` to test permission rules alone. */
  settings?: Record<string, unknown>;
  /** Start the session as this subagent (`--agent`): the main thread gets its tools line and prompt. */
  agent?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Only the project's own settings and guide: user settings are skipped, and the user's own memory files
 * (~/.claude/CLAUDE.md, ~/.claude/rules) and auto memory are excluded, so they can't stand in for a guide.
 */
export function agentRunArgs(prompt: string, options: AgentRunOptions = {}): string[] {
  const { maxTurns = AGENT_MAX_TURNS, allowedTools = true, permissionMode = "acceptEdits", settings = {}, agent } = options;
  const userClaudeDir = `${homedir().replaceAll("\\", "/")}/.claude/**`;
  return [
    "-p", prompt,
    "--output-format", "stream-json", "--verbose", "--include-hook-events",
    "--setting-sources", "project",
    "--settings", JSON.stringify({ claudeMdExcludes: [userClaudeDir], autoMemoryEnabled: false, ...settings }),
    "--mcp-config", ".mcp.json", "--strict-mcp-config",
    "--permission-mode", permissionMode,
    ...(allowedTools ? ["--allowedTools", ...ALLOWED_TOOLS] : []),
    ...(agent ? ["--agent", agent] : []),
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
  sessionId: string | null;
  /** Tools the session started with (the `init` line), e.g. to show a subagent's read-only tools line. */
  tools: string[];
  /** `parentToolUseId` is set for calls made inside a subagent. */
  toolCalls: { name: string; input: unknown; parentToolUseId: string | null }[];
  hookEvents: HookEvent[];
  /** The result line's `permission_denials`: calls a rule refused, or that needed a prompt print mode can't show. */
  permissionDenials: { tool: string; input: unknown }[];
  /** Tool results marked as errors, first 300 characters each (sandbox errors show up here). */
  toolErrors: string[];
}

interface ContentBlock { type?: string; name?: string; input?: unknown; is_error?: boolean; content?: unknown }
interface StreamLine {
  type?: string;
  subtype?: string;
  session_id?: string;
  tools?: string[];
  parent_tool_use_id?: string | null;
  hook_event?: string;
  hook_name?: string;
  exit_code?: number;
  stderr?: string;
  message?: { content?: ContentBlock[] | string };
  result?: string;
  num_turns?: number;
  total_cost_usd?: number;
  permission_denials?: { tool_name?: string; tool_input?: unknown }[];
}

const blockText = (content: unknown): string =>
  typeof content === "string" ? content
    : Array.isArray(content) ? content.map((c: { text?: string }) => c.text ?? "").join("\n") : "";

export function summarizeAgentStream(stdout: string): AgentRunSummary {
  const summary: AgentRunSummary = {
    answer: "", subtype: "no result", turns: null, costUsd: null, sessionId: null, tools: [],
    toolCalls: [], hookEvents: [], permissionDenials: [], toolErrors: [],
  };
  for (const line of stdout.split("\n")) {
    let event: StreamLine;
    try {
      event = JSON.parse(line) as StreamLine;
    } catch {
      continue;
    }
    const blocks = Array.isArray(event.message?.content) ? event.message.content : [];
    if (event.type === "system" && event.subtype === "init") {
      summary.sessionId = event.session_id ?? null;
      summary.tools = event.tools ?? [];
    }
    if (event.type === "assistant") {
      for (const block of blocks.filter((b) => b.type === "tool_use")) {
        summary.toolCalls.push({ name: String(block.name), input: block.input, parentToolUseId: event.parent_tool_use_id ?? null });
      }
    }
    if (event.type === "user") {
      for (const block of blocks.filter((b) => b.type === "tool_result" && b.is_error)) {
        summary.toolErrors.push(blockText(block.content).slice(0, 300));
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
      summary.permissionDenials = (event.permission_denials ?? []).map((d) => ({ tool: String(d.tool_name), input: d.tool_input }));
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
export async function runProjectAgent(
  prompt: string, cwd: string, options: AgentRunOptions = {},
): Promise<{ output: ProcessOutput; summary: AgentRunSummary }> {
  const output = await runClaudeProcess(agentRunArgs(prompt, options), "", 900_000, cwd, options.env);
  return { output, summary: summarizeAgentStream(output.stdout) };
}
