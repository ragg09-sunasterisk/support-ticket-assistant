// Acceptance tests: behaviour the course already promises for TicketTriage (Part 2). Owned by the
// course, not by agents: the PreToolUse hook in .claude/hooks blocks edits under test/acceptance/.
import { describe, expect, it } from "vitest";
import { CATEGORIES, SEVERITIES, TicketTriage } from "../../src/ticket-triage-schema.ts";

const valid = { category: "orders_payments", severity: "high", confidence: 0.8, escalation_reason: null };

describe("acceptance: TicketTriage schema", () => {
  it("accepts a valid triage, with or without an escalation reason", () => {
    expect(TicketTriage.safeParse(valid).success).toBe(true);
    expect(TicketTriage.safeParse({ ...valid, escalation_reason: "Payouts blocked for 3 days" }).success).toBe(true);
  });

  it("rejects a category that is not in the handbook's list", () => {
    expect(TicketTriage.safeParse({ ...valid, category: "refunds" }).success).toBe(false);
  });

  it("rejects a bad severity, a confidence outside 0..1 and a missing field", () => {
    expect(TicketTriage.safeParse({ ...valid, severity: "urgent" }).success).toBe(false);
    expect(TicketTriage.safeParse({ ...valid, confidence: 1.2 }).success).toBe(false);
    const missing: Record<string, unknown> = { ...valid };
    delete missing.escalation_reason;
    expect(TicketTriage.safeParse(missing).success).toBe(false);
  });

  it("keeps the 8 categories and 4 severities from the handbook", () => {
    expect(CATEGORIES).toHaveLength(8);
    expect(SEVERITIES).toEqual(["low", "medium", "high", "critical"]);
  });
});
