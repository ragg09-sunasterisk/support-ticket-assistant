// Checks the Part 7 WebFetch hook in .claude/hooks by feeding it hook input on stdin, the way Claude
// Code does (no Claude calls, no network). Exit 2 = blocked, with the reason on stderr.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/handbook-chunker.ts";

function fetchHook(input: object) {
  const result = spawnSync(process.execPath, [join(REPO_ROOT, ".claude", "hooks", "limit-web-fetch.mjs")], {
    input: JSON.stringify({ cwd: REPO_ROOT, hook_event_name: "PreToolUse", ...input }),
    encoding: "utf8",
    timeout: 30_000,
  });
  return { code: result.status, stderr: result.stderr };
}

describe("PreToolUse limit-web-fetch", () => {
  it("lets WebFetch read the Claude Code docs", () => {
    expect(fetchHook({ tool_name: "WebFetch", tool_input: { url: "https://code.claude.com/docs/en/permissions" } }).code).toBe(0);
    expect(fetchHook({ tool_name: "WebFetch", tool_input: { url: "https://CODE.claude.com./docs" } }).code).toBe(0);
  });

  it("blocks every other host, including look-alikes, with a one-line reason", () => {
    for (const url of ["https://example.com/", "https://code.claude.com.evil.test/x", "https://docs.claude.com/", "not a url"]) {
      const { code, stderr } = fetchHook({ tool_name: "WebFetch", tool_input: { url } });
      expect(code, url).toBe(2);
      expect(stderr.trim().split("\n")).toHaveLength(1);
    }
  });

  it("fails closed on input it can't read", () => {
    const result = spawnSync(process.execPath, [join(REPO_ROOT, ".claude", "hooks", "limit-web-fetch.mjs")], {
      input: "not json", encoding: "utf8", timeout: 30_000,
    });
    expect(result.status).toBe(2);
  });

  it("ignores other tools", () => {
    expect(fetchHook({ tool_name: "Read", tool_input: { file_path: join(REPO_ROOT, "README.md") } }).code).toBe(0);
  });
});
