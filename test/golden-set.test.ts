// Checks the committed golden set and the scoring helpers.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadTickets } from "../src/claude-ticket-client.ts";
import { loadGoldenCases, scoreCase, summarize } from "../src/golden-set.ts";

const GOLDEN = fileURLToPath(new URL("../evals/golden.jsonl", import.meta.url));
const TICKETS = fileURLToPath(new URL("../data/tickets.jsonl", import.meta.url));

describe("evals/golden.jsonl", () => {
  const cases = loadGoldenCases(GOLDEN);

  it("has exactly 30 cases with unique ids", () => {
    expect(cases).toHaveLength(30);
    expect(new Set(cases.map((c) => c.id)).size).toBe(30);
  });

  it("only uses ticket ids that exist in data/tickets.jsonl", () => {
    const ids = new Set(loadTickets(TICKETS).map((t) => t.id));
    expect(cases.filter((c) => !ids.has(c.id))).toEqual([]);
  });

  it("has at least 3 prompt-injection cases", () => {
    expect(cases.filter((c) => c.case_type === "injection").length).toBeGreaterThanOrEqual(3);
  });
});

describe("scoring", () => {
  const golden = { id: "TCK-1", case_type: "normal", expected: { category: "billing", severity: "low" } } as const;
  const triage = { category: "billing", severity: "high", confidence: 0.8, escalation_reason: null } as const;

  it("scores category and severity separately", () => {
    const s = scoreCase(golden, { ok: true, triage });
    expect([s.categoryCorrect, s.severityCorrect]).toEqual([true, false]);
  });

  it("counts no valid triage as wrong on both labels", () => {
    const s = scoreCase(golden, { ok: false, reason: "no structured_output" });
    expect(summarize([s, scoreCase(golden, { ok: true, triage })])).toEqual({
      total: 2,
      valid: 1,
      categoryCorrect: 1,
      severityCorrect: 0,
    });
  });
});
