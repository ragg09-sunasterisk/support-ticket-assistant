// Checks the evaluator-optimizer controller with both model calls stubbed (no live calls): when it
// stops, why, and that every round is logged with its feedback.
import { describe, expect, it } from "vitest";
import type { StructuredResult } from "../src/claude-structured-output.ts";
import type { HandbookSearchResult } from "../src/handbook-search.ts";
import type { EvaluateReply, GenerateReply } from "../src/reply-loop-calls.ts";
import { MAX_ROUNDS, resolveMaxRounds, runReplyLoop, type RoundRecord } from "../src/reply-loop-controller.ts";
import type { PreviousAttempt, ReplyTicket } from "../src/reply-loop-prompts.ts";
import type { ReplyDraft, ReplyEvaluation } from "../src/reply-loop-schemas.ts";

const ticket: ReplyTicket = {
  id: "TCK-1028",
  subject: "Refund stuck in processing",
  description: "It has said 'Refund processing' for 10 days.",
  channel: "chat",
  organization: { name: "Domingo Crafts", plan: "Growth" },
};
const chunks: HandbookSearchResult[] = [
  { chunk_id: "hb-09#refunds", source_path: "data/handbook/09.md", title: "Payments", heading: "Refunds",
    score: 10, text: "Card refunds take 5 to 14 banking days.", access: "public" },
];

const info = { estimatedCostUsd: 0.01, durationMs: 1000, numTurns: 1 };
const needsWork: ReplyEvaluation = {
  evaluation: "NEEDS_IMPROVEMENT",
  reason: "Too long.",
  feedback: [{ rubric_line: 5, problem: "The draft has 150 words; cut it under 120." }],
};
const pass: ReplyEvaluation = { evaluation: "PASS", reason: "All lines hold.", feedback: [] };
const fail: ReplyEvaluation = { evaluation: "FAIL", reason: "Needs a refund decision by a person.", feedback: [] };

// Generator stub: returns "draft N" and remembers what it was shown.
function stubGenerator(seen: PreviousAttempt[][] = []): GenerateReply {
  return async (_t, _c, previous) => {
    seen.push(previous.map((p) => ({ ...p })));
    return { ok: true, data: { reply: `draft ${previous.length + 1}` }, ...info };
  };
}
// Evaluator stub: plays back one result per round.
function stubEvaluator(results: StructuredResult<ReplyEvaluation>[]): EvaluateReply {
  let i = 0;
  return async () => results[Math.min(i++, results.length - 1)]!;
}
const ok = (data: ReplyEvaluation): StructuredResult<ReplyEvaluation> => ({ ok: true, data, ...info });

async function run(evaluations: StructuredResult<ReplyEvaluation>[], generate = stubGenerator(), maxRounds?: number) {
  const log: RoundRecord[] = [];
  const result = await runReplyLoop({
    ticket, chunks, generate, evaluate: stubEvaluator(evaluations), log: (r) => log.push(r), maxRounds, runId: "t",
  });
  return { result, log };
}

describe("runReplyLoop", () => {
  it("stops after 1 round when round 1 passes", async () => {
    const { result, log } = await run([ok(pass)]);
    expect(result).toMatchObject({ stopReason: "pass", rounds: 1, finalDraft: "draft 1", escalate: false });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ round: 1, evaluation: "PASS", stop_reason: "pass", escalate: false });
  });

  it("stops after 3 rounds when round 3 passes, feeding back each round's feedback", async () => {
    const seen: PreviousAttempt[][] = [];
    const { result, log } = await run([ok(needsWork), ok(needsWork), ok(pass)], stubGenerator(seen));
    expect(result).toMatchObject({ stopReason: "pass", rounds: 3, finalDraft: "draft 3" });
    expect(log.map((r) => r.evaluation)).toEqual(["NEEDS_IMPROVEMENT", "NEEDS_IMPROVEMENT", "PASS"]);
    expect(seen[0]).toEqual([]);
    expect(seen[2]).toEqual([
      { draft: "draft 1", feedback: needsWork.feedback },
      { draft: "draft 2", feedback: needsWork.feedback },
    ]);
  });

  it("runs exactly 4 rounds and stops with reason cap when nothing passes", async () => {
    const { result, log } = await run([ok(needsWork)]);
    expect(MAX_ROUNDS).toBe(4);
    expect(result).toMatchObject({ stopReason: "cap", rounds: 4, finalDraft: "draft 4", escalate: true });
    expect(log.map((r) => r.round)).toEqual([1, 2, 3, 4]);
    expect(log.map((r) => r.stop_reason)).toEqual([undefined, undefined, undefined, "cap"]);
  });

  it("stops at once on FAIL and marks it for escalation", async () => {
    const { result, log } = await run([ok(fail), ok(pass)]);
    expect(result).toMatchObject({ stopReason: "fail", rounds: 1, escalate: true });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ evaluation: "FAIL", stop_reason: "fail", escalate: true });
  });

  it("stops with an error when the evaluator output is malformed, without retrying", async () => {
    const bad: StructuredResult<ReplyEvaluation> = { ok: false, reason: "structured_output failed validation", ...info };
    const { result, log } = await run([ok(needsWork), bad, ok(pass)]);
    expect(result).toMatchObject({ stopReason: "error", rounds: 2, escalate: true });
    expect(result.error).toContain("evaluator: structured_output failed validation");
    expect(log[1]).toMatchObject({ round: 2, draft: "draft 2", evaluation: null, stop_reason: "error" });
  });

  it("treats an evaluation that contradicts itself as malformed", async () => {
    const contradictory = ok({ ...pass, feedback: needsWork.feedback });
    const { result } = await run([contradictory]);
    expect(result).toMatchObject({ stopReason: "error", rounds: 1 });
    expect(result.error).toContain("PASS but feedback lists failed rubric lines");
  });

  it("stops with an error when the generator fails, without calling the evaluator", async () => {
    let evaluatorCalls = 0;
    const generate: GenerateReply = async (): Promise<StructuredResult<ReplyDraft>> => ({ ok: false, reason: "claude exited with 1" });
    const log: RoundRecord[] = [];
    const result = await runReplyLoop({
      ticket, chunks, generate, evaluate: async () => (evaluatorCalls++, ok(pass)), log: (r) => log.push(r),
    });
    expect(result).toMatchObject({ stopReason: "error", rounds: 1, finalDraft: null });
    expect(evaluatorCalls).toBe(0);
    expect(log[0]).toMatchObject({ draft: null, evaluator: null, error: "generator: claude exited with 1" });
  });

  it("logs one line per round with its feedback, cost, turns and duration", async () => {
    const { log } = await run([ok(needsWork), ok(pass)]);
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({
      run_id: "t", ticket_id: "TCK-1028", round: 1, max_rounds: 4, chunk_ids: ["hb-09#refunds"],
      draft: "draft 1", word_count: 2, feedback: needsWork.feedback,
      cost_usd: 0.02, turns: 2, duration_ms: 2000,
      generator: { cost_usd: 0.01, turns: 1, duration_ms: 1000 },
    });
    expect(log[0]).not.toHaveProperty("stop_reason");
    expect(JSON.parse(JSON.stringify(log[0])).feedback[0].problem).toContain("under 120");
  });

  it("lets a lower cap stop sooner", async () => {
    const { result, log } = await run([ok(needsWork)], stubGenerator(), 2);
    expect(result).toMatchObject({ stopReason: "cap", rounds: 2 });
    expect(log).toHaveLength(2);
  });
});

describe("resolveMaxRounds", () => {
  it("defaults to 4 and accepts 1..4", () => {
    expect(resolveMaxRounds(undefined)).toEqual({ ok: true, value: 4 });
    expect(resolveMaxRounds(1)).toEqual({ ok: true, value: 1 });
  });

  it("never raises the cap above 4", () => {
    for (const n of [5, 0, 2.5, Number.NaN]) expect(resolveMaxRounds(n).ok).toBe(false);
  });
});
