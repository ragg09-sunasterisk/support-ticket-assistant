// Checks the Part 6 agent-run helpers: the claude flags and the stream-json summary (no Claude calls).
import { describe, expect, it } from "vitest";
import { agentRunArgs, hookBlocks, summarizeAgentStream } from "../src/project-agent-run.ts";

const stream = [
  { type: "system", subtype: "init" },
  { type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/w/.env" } }] } },
  { type: "system", subtype: "hook_started", hook_event: "PreToolUse", hook_name: "PreToolUse:Read" },
  { type: "system", subtype: "hook_response", hook_event: "PreToolUse", hook_name: "PreToolUse:Read", exit_code: 2, stderr: "Blocked\n" },
  { type: "system", subtype: "hook_response", hook_event: "Stop", hook_name: "Stop", exit_code: 0, stderr: "" },
  { type: "result", subtype: "success", result: "Done.", num_turns: 3, total_cost_usd: 0.12 },
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
});

describe("summarizeAgentStream", () => {
  it("collects the answer, turns, cost, tool calls and finished hooks", () => {
    const summary = summarizeAgentStream(`${stream}\nnot json\n`);
    expect(summary).toMatchObject({ answer: "Done.", subtype: "success", turns: 3, costUsd: 0.12 });
    expect(summary.toolCalls).toEqual([{ name: "Read", input: { file_path: "/w/.env" } }]);
    expect(summary.hookEvents.map((h) => [h.name, h.exitCode])).toEqual([["PreToolUse:Read", 2], ["Stop", 0]]);
  });

  it("reports a run with no result line", () => {
    expect(summarizeAgentStream("").subtype).toBe("no result");
  });

  it("counts blocks (exit code 2) per hook event", () => {
    expect(hookBlocks(summarizeAgentStream(stream).hookEvents)).toEqual({ PreToolUse: 1 });
  });
});
