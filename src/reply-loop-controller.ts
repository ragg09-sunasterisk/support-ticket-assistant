// Part 8: the evaluator-optimizer controller. Generate a draft, evaluate it, feed the feedback back,
// and stop on PASS, on FAIL (escalate), on malformed output (error) or after MAX_ROUNDS rounds (cap).
// Plain code decides when to stop; the models only draft and judge. One log record per round.
import type { RunInfo, StructuredResult } from "./claude-structured-output.ts";
import type { HandbookSearchResult } from "./handbook-search.ts";
import type { EvaluateReply, GenerateReply } from "./reply-loop-calls.ts";
import type { PreviousAttempt, ReplyTicket } from "./reply-loop-prompts.ts";
import { countWords, evaluationProblem, type FeedbackItem, type ReplyEvaluation } from "./reply-loop-schemas.ts";

/** The hard cap on rounds (one round = one generate + one evaluate). A flag may lower it, never raise it. */
export const MAX_ROUNDS = 4;

export type StopReason = "pass" | "fail" | "cap" | "error";

export interface CallStats {
  cost_usd: number | null;
  turns: number | null;
  duration_ms: number | null;
}

/** One line of `logs/part-08-reply-loop.jsonl`. */
export interface RoundRecord {
  run_id: string;
  ticket_id: string;
  round: number;
  max_rounds: number;
  chunk_ids: string[];
  draft: string | null;
  word_count: number | null;
  evaluation: ReplyEvaluation["evaluation"] | null;
  reason: string | null;
  feedback: FeedbackItem[];
  generator: CallStats;
  evaluator: CallStats | null;
  cost_usd: number;
  turns: number;
  duration_ms: number;
  /** Only on the last round of a run. */
  stop_reason?: StopReason;
  escalate?: boolean;
  error?: string;
}

export interface ReplyLoopResult {
  stopReason: StopReason;
  rounds: number;
  finalDraft: string | null;
  /** Anything but PASS goes to a person: FAIL by design, cap and error because no draft was approved. */
  escalate: boolean;
  error?: string;
  totalCostUsd: number;
}

export interface ReplyLoopOptions {
  ticket: ReplyTicket;
  chunks: HandbookSearchResult[];
  generate: GenerateReply;
  evaluate: EvaluateReply;
  log: (record: RoundRecord) => void;
  maxRounds?: number;
  runId?: string;
}

/** Returns the round cap to use: the requested value if it is 1..MAX_ROUNDS, otherwise an error. */
export function resolveMaxRounds(requested: number | undefined): { ok: true; value: number } | { ok: false; reason: string } {
  if (requested === undefined) return { ok: true, value: MAX_ROUNDS };
  if (!Number.isInteger(requested) || requested < 1 || requested > MAX_ROUNDS) {
    return { ok: false, reason: `max rounds must be a whole number from 1 to ${MAX_ROUNDS}, got ${requested}` };
  }
  return { ok: true, value: requested };
}

function stats(info: RunInfo | null): CallStats {
  return { cost_usd: info?.estimatedCostUsd ?? null, turns: info?.numTurns ?? null, duration_ms: info?.durationMs ?? null };
}

const sum = (a: number | null, b: number | null | undefined) => (a ?? 0) + (b ?? 0);

export async function runReplyLoop(options: ReplyLoopOptions): Promise<ReplyLoopResult> {
  const { ticket, chunks, generate, evaluate, log } = options;
  const cap = resolveMaxRounds(options.maxRounds);
  if (!cap.ok) throw new Error(cap.reason); // a caller bug, not a model failure: the CLI checks first
  const maxRounds = cap.value;
  const runId = options.runId ?? new Date().toISOString();
  const previous: PreviousAttempt[] = [];
  let totalCostUsd = 0;
  let lastDraft: string | null = null;

  for (let round = 1; round <= maxRounds; round++) {
    const generated = await generate(ticket, chunks, previous);
    const draft = generated.ok ? generated.data.reply : null;
    const wordCount = draft === null ? null : countWords(draft);
    let evaluated: StructuredResult<ReplyEvaluation> | null = null;
    if (draft !== null && wordCount !== null) evaluated = await evaluate(ticket, chunks, draft, wordCount);

    const generator = stats(generated);
    const evaluator = evaluated ? stats(evaluated) : null;
    const record: RoundRecord = {
      run_id: runId,
      ticket_id: ticket.id,
      round,
      max_rounds: maxRounds,
      chunk_ids: chunks.map((chunk) => chunk.chunk_id),
      draft,
      word_count: wordCount,
      evaluation: evaluated?.ok ? evaluated.data.evaluation : null,
      reason: evaluated?.ok ? evaluated.data.reason : null,
      feedback: evaluated?.ok ? evaluated.data.feedback : [],
      generator,
      evaluator,
      cost_usd: sum(generator.cost_usd, evaluator?.cost_usd),
      turns: sum(generator.turns, evaluator?.turns),
      duration_ms: sum(generator.duration_ms, evaluator?.duration_ms),
    };
    totalCostUsd += record.cost_usd;
    if (draft !== null) lastDraft = draft;

    // Decide the stop. Any malformed output ends the run: retrying would only spend more.
    let stop: StopReason | null = null;
    let error: string | undefined;
    if (!generated.ok) error = `generator: ${generated.reason}`;
    else if (evaluated && !evaluated.ok) error = `evaluator: ${evaluated.reason}`;
    else if (evaluated?.ok) {
      const problem = evaluationProblem(evaluated.data, wordCount ?? 0);
      if (problem) error = `evaluator: ${problem}`;
    }
    if (error) stop = "error";
    else if (record.evaluation === "PASS") stop = "pass";
    else if (record.evaluation === "FAIL") stop = "fail";
    else if (round === maxRounds) stop = "cap";

    if (stop) {
      const escalate = stop !== "pass";
      log({ ...record, stop_reason: stop, escalate, ...(error ? { error } : {}) });
      return { stopReason: stop, rounds: round, finalDraft: lastDraft, escalate, error, totalCostUsd };
    }
    log(record);
    previous.push({ draft: draft ?? "", feedback: record.feedback });
  }
  // Unreachable: the last round always sets a stop reason.
  throw new Error("reply loop ended without a stop reason");
}
