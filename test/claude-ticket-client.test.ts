// Covers the parts of the Part 1 script that don't need a live `claude` call.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPrompt, loadTicket, parseClaudeJson } from "../src/claude-ticket-client.ts";

const TICKETS = fileURLToPath(new URL("../data/tickets.jsonl", import.meta.url));

describe("loadTicket", () => {
  it("returns the first ticket when no id is given", () => {
    expect(loadTicket(TICKETS).id).toBe("TCK-1001");
  });

  it("finds a ticket by id", () => {
    expect(loadTicket(TICKETS, "TCK-1002").subject).toBe("Payout delayed");
  });

  it("throws for an unknown id", () => {
    expect(() => loadTicket(TICKETS, "TCK-0000")).toThrow("TCK-0000 not found");
  });
});

describe("buildPrompt", () => {
  it("wraps the ticket fields in <ticket> tags", () => {
    const prompt = buildPrompt(loadTicket(TICKETS));
    expect(prompt).toMatch(/<ticket>[\s\S]*Subject: Charged twice[\s\S]*<\/ticket>$/);
  });
});

describe("parseClaudeJson", () => {
  const sample = {
    is_error: false,
    result: "Category: billing",
    total_cost_usd: 0.0123,
    duration_ms: 4200,
    usage: { input_tokens: 10, output_tokens: 80, cache_creation_input_tokens: 600, cache_read_input_tokens: 0 },
    modelUsage: { "claude-opus-5-5": {} },
  };

  it("extracts answer, tokens, cost and model", () => {
    expect(parseClaudeJson(JSON.stringify(sample))).toEqual({
      answer: "Category: billing",
      model: "claude-opus-5-5",
      inputTokens: 10,
      outputTokens: 80,
      cacheCreationInputTokens: 600,
      cacheReadInputTokens: 0,
      estimatedCostUsd: 0.0123,
      durationMs: 4200,
    });
  });

  it("throws when claude reports an error", () => {
    expect(() => parseClaudeJson(JSON.stringify({ ...sample, is_error: true, result: "boom" }))).toThrow("boom");
  });

  it("throws on non-JSON output", () => {
    expect(() => parseClaudeJson("Not logged in")).toThrow("did not return JSON");
  });
});
