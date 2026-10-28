// Covers the regression table and the human-label agreement maths (pure, no model calls).
import { describe, expect, it } from "vitest";
import { agreement, toHumanLabel, type HumanLabel } from "../src/human-labels.ts";
import { buildRegressionTable, describeChange, isConfidentMiss, type EvalRow } from "../src/regression-table.ts";

function row(promptVersion: string, ticketId: string, pass: Partial<Record<string, boolean>> = {}, confidence = 0.8): EvalRow {
  const grader = (metric: string) => ({ pass: pass[metric] ?? true, reason: metric });
  return {
    set: "held-out",
    promptVersion,
    ticketId,
    caseType: "normal",
    expected: { category: "billing", severity: "low" },
    triage: { category: "billing", severity: pass.severity_correct === false ? "high" : "low", confidence, escalation_reason: null },
    graders: {
      schema_valid: grader("schema_valid"),
      category_correct: grader("category_correct"),
      severity_correct: grader("severity_correct"),
      escalation_pass: grader("escalation_pass"),
    },
  };
}

describe("buildRegressionTable", () => {
  const rows = [
    row("triage-v1", "TCK-1", { severity_correct: false }, 0.95),
    row("triage-v2", "TCK-1"),
    row("triage-v1", "TCK-2"),
    row("triage-v2", "TCK-2", { escalation_pass: false }),
  ];
  const table = buildRegressionTable(rows, ["triage-v1", "triage-v2"], "2026-10-28T00:00:00Z");

  it("counts each grader per prompt version and set", () => {
    expect(table).toContain("| triage-v1 | held-out | 2 | 2/2 | 2/2 | 1/2 | 2/2 | 1 |");
    expect(table).toContain("| triage-v2 | held-out | 2 | 2/2 | 2/2 | 2/2 | 1/2 | 0 |");
  });

  it("lists every held-out case with what changed", () => {
    expect(table).toMatch(/\| TCK-1 \|.*\| severity fixed \|/);
    expect(table).toMatch(/\| TCK-2 \|.*\| escalation broke \|/);
  });
});

describe("judge errors", () => {
  it("are counted apart from wrong escalations", () => {
    const crashed = row("triage-v2", "TCK-3", { escalation_pass: false });
    crashed.graders.escalation_pass.reason = "judge failed: claude exited with SIGTERM";
    const table = buildRegressionTable([row("triage-v1", "TCK-3"), crashed], ["triage-v1", "triage-v2"], "now");
    expect(table).toContain("| 0/1 (1 grader errors) |");
  });
});

describe("describeChange and isConfidentMiss", () => {
  it("says no change when outputs and scores match", () => {
    expect(describeChange(row("triage-v1", "TCK-1"), row("triage-v2", "TCK-1"))).toBe("no change");
  });

  it("notices a changed output with the same scores", () => {
    const after = row("triage-v2", "TCK-1");
    after.triage = { ...after.triage!, confidence: 0.4 };
    expect(describeChange(row("triage-v1", "TCK-1"), after)).toBe("output changed, same scores");
  });

  it("flags only wrong answers given with confidence 0.9 or more", () => {
    expect(isConfidentMiss(row("v", "T", { category_correct: false }, 0.9))).toBe(true);
    expect(isConfidentMiss(row("v", "T", { category_correct: false }, 0.6))).toBe(false);
    expect(isConfidentMiss(row("v", "T", {}, 0.95))).toBe(false);
  });
});

describe("human-label agreement", () => {
  const label = (pass: boolean, human: boolean | null): HumanLabel => ({ ...toHumanLabel(row("triage-v2", "TCK-1", { escalation_pass: pass })), human });

  it("starts every label as null", () => {
    expect(toHumanLabel(row("triage-v2", "TCK-1")).human).toBeNull();
  });

  it("reports nothing labelled yet", () => {
    expect(agreement([label(true, null), label(false, null)])).toMatchObject({ total: 2, labelled: 0, agree: 0 });
  });

  it("counts agreement over labelled cases only and lists disagreements", () => {
    const result = agreement([label(true, true), label(true, false), label(false, false), label(true, null)]);
    expect(result).toMatchObject({ total: 4, labelled: 3, agree: 2 });
    expect(result.disagreements).toHaveLength(1);
  });
});
