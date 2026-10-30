// Checks the Part 6 agent-run helpers: the claude flags and the stream-json summary (no Claude calls).
// Part 7: the options for settings-only runs, permission denials, tool errors and the session ID.
import { describe, expect, it } from "vitest";
import { agentRunArgs, hookBlocks, summarizeAgentStream } from "../src/project-agent-run.ts";

const stream = [
  { type: "system", subtype: "init", session_id: "s-1", tools: ["Read", "Grep", "Glob"] },
  { type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/w/.env" } }] } },
  { type: "system", subtype: "hook_started", hook_event: "PreToolUse", hook_name: "PreToolUse:Read" },
  { type: "system", subtype: "hook_response", hook_event: "PreToolUse", hook_name: "PreToolUse:Read", exit_code: 2, stderr: "Blocked\n" },
  { type: "system", subtype: "hook_response", hook_event: "Stop", hook_name: "Stop", exit_code: 0, stderr: "" },
  { type: "user", message: { content: [{ type: "tool_result", is_error: true, content: "touch: Read-only file system" }] } },
  { type: "assistant", parent_tool_use_id: "t-1", message: { content: [{ type: "tool_use", name: "Grep", input: { pattern: "x" } }] } },
  {
    type: "result", subtype: "success", result: "Done.", num_turns: 3, total_cost_usd: 0.12,
    permission_denials: [{ tool_name: "Edit", tool_use_id: "t-2", tool_input: { file_path: "/w/data/handbook/a.md" } }],
  },
].map((e) => JSON.stringify(e)).join("\n");

describe("agentRunArgs", () => {
  const args = agentRunArgs("do the task");

  it("loads project settings only, with hook events, a 20-turn cap and never --bare", () => {
    expect(args.slice(0, 2)).toEqual(["-p", "do the task"]);
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("project");
    expect(args[args.indexOf("--max-turns") + 1]).toBe("20");
    expect(args).toContain("--include-hook-events");
    expect(args).not.toContain("--bare");
  });

  it("keeps the user's own memory files and auto memory out of the run", () => {
    const settings = JSON.parse(args[args.indexOf("--settings") + 1] ?? "{}");
    expect(settings.claudeMdExcludes[0]).toMatch(/\/\.claude\/\*\*$/);
    expect(settings.autoMemoryEnabled).toBe(false);
  });

  it("leaves the command-line allowlist out of settings-only runs and passes mode, settings and agent (Part 7)", () => {
    const part7 = agentRunArgs("t", { allowedTools: false, permissionMode: "auto", settings: { disableAllHooks: true }, agent: "reviewer" });
    expect(args).toContain("--allowedTools");
    expect(part7).not.toContain("--allowedTools");
    expect(part7[part7.indexOf("--permission-mode") + 1]).toBe("auto");
    expect(part7[part7.indexOf("--agent") + 1]).toBe("reviewer");
    expect(JSON.parse(part7[part7.indexOf("--settings") + 1] ?? "{}")).toMatchObject({ disableAllHooks: true, autoMemoryEnabled: false });
  });
});

describe("summarizeAgentStream", () => {
  it("collects the answer, turns, cost, tool calls and finished hooks", () => {
    const summary = summarizeAgentStream(`${stream}\nnot json\n`);
    expect(summary).toMatchObject({ answer: "Done.", subtype: "success", turns: 3, costUsd: 0.12 });
    expect(summary.toolCalls).toEqual([
      { name: "Read", input: { file_path: "/w/.env" }, parentToolUseId: null },
      { name: "Grep", input: { pattern: "x" }, parentToolUseId: "t-1" },
    ]);
    expect(summary.hookEvents.map((h) => [h.name, h.exitCode])).toEqual([["PreToolUse:Read", 2], ["Stop", 0]]);
  });

  it("collects the session ID, the starting tools, permission denials and failed tool results (Part 7)", () => {
    const summary = summarizeAgentStream(stream);
    expect(summary.sessionId).toBe("s-1");
    expect(summary.tools).toEqual(["Read", "Grep", "Glob"]);
    expect(summary.permissionDenials).toEqual([{ tool: "Edit", input: { file_path: "/w/data/handbook/a.md" } }]);
    expect(summary.toolErrors).toEqual(["touch: Read-only file system"]);
  });

  it("reports a run with no result line", () => {
    expect(summarizeAgentStream("").subtype).toBe("no result");
  });

  it("counts blocks (exit code 2) per hook event", () => {
    expect(hookBlocks(summarizeAgentStream(stream).hookEvents)).toEqual({ PreToolUse: 1 });
  });
});
