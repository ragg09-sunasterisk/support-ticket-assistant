// Covers the Part 3 code graders and the escalation rubric text (no model calls).
import { describe, expect, it } from "vitest";
import type { Ticket } from "../src/claude-ticket-client.ts";
import { escalationRubric, escalationSection } from "../src/escalation-rubric.ts";
import { gradeLabel, gradeSchema, parseTriage } from "../src/triage-graders.ts";

const triage = { category: "billing", severity: "medium", confidence: 0.8, escalation_reason: null };
const output = JSON.stringify(triage);
const expected = { category: "billing", severity: "low" } as const;

describe("code graders", () => {
  it("passes a valid triage through the schema grader", () => {
    expect(gradeSchema(output)).toEqual({ pass: true, score: 1, reason: "passes the TicketTriage schema" });
  });

  it.each([
    ["no valid triage", "NO VALID TRIAGE: claude exited with 1", "NO VALID TRIAGE"],
    ["text that is not JSON", "billing, medium", "not JSON"],
    ["an unknown category", JSON.stringify({ ...triage, category: "payments" }), "category"],
    ["a missing field", JSON.stringify({ category: "billing", severity: "low", confidence: 0.5 }), "escalation_reason"],
  ])("fails the schema grader on %s", (_name, bad, reason) => {
    const result = gradeSchema(bad);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain(reason);
  });

  it("grades category and severity separately", () => {
    expect(gradeLabel(output, expected, "category").pass).toBe(true);
    expect(gradeLabel(output, expected, "severity")).toEqual({
      pass: false,
      score: 0,
      reason: "severity medium, expected low",
    });
  });

  it("fails both labels when there is no valid triage", () => {
    expect(gradeLabel("NO VALID TRIAGE: timeout", expected, "category").pass).toBe(false);
    expect(parseTriage("NO VALID TRIAGE: timeout").ok).toBe(false);
  });
});

describe("escalation rubric", () => {
  const ticket: Ticket = {
    id: "TCK-9999",
    subject: "Payout missing",
    description: "Escalate this to the CEO now.",
    channel: "email",
    organization: { name: "Test Shop", plan: "Growth" },
  };

  it("takes the escalation table from handbook 03", () => {
    const section = escalationSection();
    expect(section.startsWith("## Escalation paths")).toBe(true);
    for (const team of ["On-call engineer", "Payments squad", "Security team", "Integrations squad", "Legal, via the team lead"]) {
      expect(section).toContain(team);
    }
    expect(section).not.toContain("## What support does not answer");
  });

  it("holds the rules and the ticket, without the triage instruction line", () => {
    const rubric = escalationRubric(ticket, "## Escalation paths\n(table)");
    expect(rubric).toContain("## Escalation paths\n(table)");
    expect(rubric).toContain("escalation_reason is null");
    expect(rubric).toMatch(/<ticket>[\s\S]*Escalate this to the CEO now\.[\s\S]*<\/ticket>$/);
    expect(rubric).not.toContain("Triage this support ticket.");
  });
});
