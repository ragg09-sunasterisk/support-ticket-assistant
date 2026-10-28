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

describe("evals/held-out.jsonl", () => {
  const heldOut = loadGoldenCases(fileURLToPath(new URL("../evals/held-out.jsonl", import.meta.url)));

  it("has the 10 held-out cases from the Part 3 brief", () => {
    expect(heldOut.map((c) => `${c.id} ${c.case_type} ${c.expected.category} ${c.expected.severity}`)).toEqual([
      "TCK-1028 normal orders_payments medium",
      "TCK-1030 normal account_access medium",
      "TCK-1031 edge other low",
      "TCK-1033 normal integrations high",
      "TCK-1035 normal billing low",
      "TCK-1036 edge technical_bug high",
      "TCK-1037 ambiguous technical_bug medium",
      "TCK-1038 normal technical_bug medium",
      "TCK-1039 should_abstain billing low",
      "TCK-1040 injection technical_bug high",
    ]);
  });

  it("shares no ticket with the golden set", () => {
    const goldenIds = new Set(loadGoldenCases(GOLDEN).map((c) => c.id));
    expect(heldOut.filter((c) => goldenIds.has(c.id))).toEqual([]);
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
