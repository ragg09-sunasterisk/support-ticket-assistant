// Runs the real promptfoo evaluate() wiring end to end with faked claude processes: no live calls.
import { describe, expect, it } from "vitest";
import type { Ticket } from "../src/claude-ticket-client.ts";
import type { ClaudeRunner } from "../src/run-claude-process.ts";

// promptfoo reads this when it loads, so set it before the dynamic import.
process.env.PROMPTFOO_DISABLE_TELEMETRY = "1";
process.env.PROMPTFOO_DISABLE_UPDATE = "1";
const { runTriageEval } = await import("../src/triage-eval.ts");

const tickets: Ticket[] = ["TCK-1", "TCK-2"].map((id) => ({
  id,
  subject: `Subject ${id}`,
  description: "Code {{ SALE }} and {% if x %} break? {# no #}",
  channel: "email",
  organization: { name: "Shop", plan: "Growth" },
}));

const respond = (structured_output: unknown) => ({
  code: 0,
  signal: null,
  stdout: JSON.stringify({ is_error: false, result: "", structured_output, total_cost_usd: 0 }),
  stderr: "",
});

// "old" prompt: always billing/high. "new" prompt: billing/low, except TCK-2 has no valid output.
const triageRun: ClaudeRunner = async (args, input) => {
  const systemPrompt = args[args.indexOf("--system-prompt") + 1];
  const severity = systemPrompt === "old" ? "high" : "low";
  if (systemPrompt === "new" && input.includes("TCK-2")) return respond({ category: "billing" });
  return respond({ category: "billing", severity, confidence: 0.95, escalation_reason: null });
};
const judgeInputs: string[] = [];
const judgeRun: ClaudeRunner = async (_args, input) => {
  judgeInputs.push(input);
  return respond({ reason: "no escalation needed", pass: true, score: 1 });
};

describe("runTriageEval", () => {
  it("grades every prompt version over every case", async () => {
    const rows = await runTriageEval({
      prompts: [
        { version: "triage-old", text: "old" },
        { version: "triage-new", text: "new" },
      ],
      sets: [{ name: "held-out", cases: tickets.map((t) => ({ id: t.id, case_type: "normal", expected: { category: "billing", severity: "low" } })) }],
      tickets,
      triageRun,
      judgeRun,
      maxConcurrency: 1,
    });

    expect(rows).toHaveLength(4);
    const find = (version: string, id: string) => rows.find((r) => r.promptVersion === version && r.ticketId === id)!;
    const oldRow = find("triage-old", "TCK-1");
    expect(oldRow.set).toBe("held-out");
    expect(oldRow.graders.schema_valid.pass).toBe(true);
    expect(oldRow.graders.category_correct.pass).toBe(true);
    expect(oldRow.graders.severity_correct).toEqual({ pass: false, reason: "severity high, expected low" });
    expect(oldRow.graders.escalation_pass).toEqual({ pass: true, reason: "no escalation needed" });

    expect(find("triage-new", "TCK-1").graders.severity_correct.pass).toBe(true);
    const invalid = find("triage-new", "TCK-2");
    expect(invalid.triage).toBeNull();
    expect(invalid.graders.schema_valid.pass).toBe(false);
    expect(invalid.graders.category_correct.pass).toBe(false);

    // Template syntax in merchant text reaches the judge unchanged.
    expect(judgeInputs).toHaveLength(4);
    expect(judgeInputs[0]).toContain("Code {{ SALE }} and {% if x %} break? {# no #}");
    expect(judgeInputs[0]).not.toContain("{% raw %}");
  }, 30_000);
});
