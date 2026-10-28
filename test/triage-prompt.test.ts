// Checks the versioned prompt files in prompts/ and the loader.
import { describe, expect, it } from "vitest";
import { DEFAULT_TRIAGE_PROMPT_VERSION, loadTriagePrompt } from "../src/triage-prompt.ts";

describe("loadTriagePrompt", () => {
  it("defaults to v2", () => {
    expect(DEFAULT_TRIAGE_PROMPT_VERSION).toBe("v2");
    expect(loadTriagePrompt().version).toBe("triage-v2");
  });

  it.each(["v1", "v2"])("loads %s with every section and no trailing newline", (version) => {
    const { text } = loadTriagePrompt(version);
    for (const section of ["# Role", "# Input boundaries", "# Categories", "# Severity", "# Escalation", "# Output contract"]) {
      expect(text).toContain(section);
    }
    expect(text).toBe(text.trimEnd());
  });

  it("keeps v1 identical to the Part 2 prompt", () => {
    const { text } = loadTriagePrompt("v1");
    expect(text.startsWith("# Role\nYou are the ticket triage step for Kariton support.")).toBe(true);
    expect(text.endsWith("escalation_reason (a string or null). No other text.")).toBe(true);
    expect(text).toHaveLength(3565);
  });

  it("rejects versions that are not vN", () => {
    expect(() => loadTriagePrompt("../package")).toThrow('must look like "v2"');
  });

  it("names the missing file", () => {
    expect(() => loadTriagePrompt("v99")).toThrow("prompts/triage.v99.md");
  });
});
