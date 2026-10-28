// Covers the promptfoo providers with a faked claude process (no live calls).
import type { CallApiContextParams } from "promptfoo";
import { describe, expect, it } from "vitest";
import { ClaudeJudgeProvider, ClaudeTriageProvider, splitGradingPrompt } from "../src/claude-eval-providers.ts";
import type { Ticket } from "../src/claude-ticket-client.ts";
import type { ClaudeRunner } from "../src/run-claude-process.ts";

const ticket: Ticket = {
  id: "TCK-9999",
  subject: "Charged twice",
  description: "I was charged twice.",
  channel: "email",
  organization: { name: "Test Shop", plan: "Growth" },
};

const triage = { category: "billing", severity: "medium", confidence: 0.9, escalation_reason: null };

function fakeRunner(structured_output: unknown, calls: { args: string[]; input: string }[] = []): ClaudeRunner {
  return async (args, input) => {
    calls.push({ args, input });
    const stdout = JSON.stringify({ is_error: false, result: "", structured_output, total_cost_usd: 0.01, duration_ms: 1 });
    return { code: 0, signal: null, stdout, stderr: "" };
  };
}

const context = (ticket_id: string) => ({ vars: { ticket_id } }) as unknown as CallApiContextParams;

describe("ClaudeTriageProvider", () => {
  it("triages the ticket from the vars with the prompt as the system prompt", async () => {
    const calls: { args: string[]; input: string }[] = [];
    const provider = new ClaudeTriageProvider([ticket], fakeRunner(triage, calls));
    const response = await provider.callApi("SYSTEM PROMPT v9", context("TCK-9999"));
    expect(JSON.parse(response.output as string)).toEqual(triage);
    expect(response.cost).toBe(0.01);
    expect(calls[0]!.args[calls[0]!.args.indexOf("--system-prompt") + 1]).toBe("SYSTEM PROMPT v9");
    expect(calls[0]!.input).toContain("Subject: Charged twice");
  });

  it("returns a failed triage as output so the graders can score it", async () => {
    const provider = new ClaudeTriageProvider([ticket], fakeRunner({ category: "nope" }));
    const response = await provider.callApi("p", context("TCK-9999"));
    expect(response.output).toMatch(/^NO VALID TRIAGE: structured_output failed validation/);
  });

  it("reports an unknown ticket id as an error", async () => {
    const response = await new ClaudeTriageProvider([ticket], fakeRunner(triage)).callApi("p", context("TCK-0000"));
    expect(response.error).toContain("TCK-0000");
  });
});

describe("ClaudeJudgeProvider", () => {
  const gradingPrompt = JSON.stringify([
    { role: "system", content: "You are grading output." },
    { role: "user", content: "<Output>x</Output><Rubric>y</Rubric>" },
  ]);

  it("splits promptfoo's chat messages into system prompt and stdin", () => {
    expect(splitGradingPrompt(gradingPrompt)).toEqual({ system: "You are grading output.", user: "<Output>x</Output><Rubric>y</Rubric>" });
    expect(splitGradingPrompt("plain rubric").user).toBe("plain rubric");
  });

  it("returns the verdict as JSON text for llm-rubric to parse", async () => {
    const verdict = { reason: "no escalation needed", pass: true, score: 1 };
    const calls: { args: string[]; input: string }[] = [];
    const response = await new ClaudeJudgeProvider(fakeRunner(verdict, calls)).callApi(gradingPrompt);
    expect(JSON.parse(response.output as string)).toEqual(verdict);
    expect(calls[0]!.args).toContain("--json-schema");
    expect(calls[0]!.args).not.toContain("--bare");
    expect(calls[0]!.input).toBe("<Output>x</Output><Rubric>y</Rubric>");
  });

  it("returns an error when the verdict does not match its schema", async () => {
    const response = await new ClaudeJudgeProvider(fakeRunner({ pass: "yes" })).callApi(gradingPrompt);
    expect(response.error).toContain("judge failed");
  });
});
