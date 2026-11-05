// Part 8: the structured outputs of the reply loop's two `claude -p` calls (generator and evaluator),
// as Zod schemas, plus the checks Zod can't express (an evaluation that contradicts its own feedback).
import { z } from "zod";

export const ReplyDraft = z.object({
  reply: z.string().min(1),
});
export type ReplyDraft = z.infer<typeof ReplyDraft>;

export const RUBRIC = [
  "Acknowledges the customer's situation in one sentence.",
  "Says what happens next.",
  "Promises no date, amount, refund or outcome that neither the ticket nor the given handbook documents state.",
  "Any policy it states matches a given handbook document.",
  "Is under 120 words.",
] as const;

export const EVALUATIONS = ["PASS", "NEEDS_IMPROVEMENT", "FAIL"] as const;

export const FeedbackItem = z.object({
  rubric_line: z.number().int().min(1).max(RUBRIC.length),
  problem: z.string().min(1),
});
export type FeedbackItem = z.infer<typeof FeedbackItem>;

export const ReplyEvaluation = z.object({
  evaluation: z.enum(EVALUATIONS),
  reason: z.string().min(1),
  feedback: z.array(FeedbackItem),
});
export type ReplyEvaluation = z.infer<typeof ReplyEvaluation>;

export const REPLY_DRAFT_JSON_SCHEMA = JSON.stringify(z.toJSONSchema(ReplyDraft, { target: "draft-7" }));
export const REPLY_EVALUATION_JSON_SCHEMA = JSON.stringify(z.toJSONSchema(ReplyEvaluation, { target: "draft-7" }));

export const MAX_REPLY_WORDS = 120;

/**
 * Returns why an evaluation contradicts itself or what code can measure, or null if it is usable. The
 * controller treats this like any other malformed output: it stops with an error instead of guessing.
 * Rubric line 5 is measured in code, so a PASS for a draft of 120+ words is never accepted.
 * FAIL may have empty feedback: its `reason` says why no draft could pass.
 */
export function evaluationProblem(result: ReplyEvaluation, wordCount: number): string | null {
  const lines = result.feedback.map((item) => item.rubric_line);
  if (new Set(lines).size !== lines.length) return "feedback has more than one item for the same rubric line";
  if (result.evaluation === "PASS" && lines.length > 0) return "PASS but feedback lists failed rubric lines";
  if (result.evaluation === "NEEDS_IMPROVEMENT" && lines.length === 0) return "NEEDS_IMPROVEMENT with no feedback";
  if (result.evaluation === "PASS" && wordCount >= MAX_REPLY_WORDS) {
    return `PASS for a draft of ${wordCount} words (rubric line 5 needs under ${MAX_REPLY_WORDS})`;
  }
  return null;
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word !== "").length;
}
