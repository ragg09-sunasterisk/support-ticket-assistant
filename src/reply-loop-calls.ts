// Part 8: the reply loop's two model calls, each one isolated `claude -p --json-schema` run with no
// tools: the generator drafts, the evaluator judges. Both return a value, never throw.
import { parseStructuredOutput, structuredClaudeArgs, type StructuredResult } from "./claude-structured-output.ts";
import type { HandbookSearchResult } from "./handbook-search.ts";
import {
  buildEvaluatorPrompt,
  buildGeneratorPrompt,
  EVALUATOR_SYSTEM_PROMPT,
  GENERATOR_SYSTEM_PROMPT,
  type PreviousAttempt,
  type ReplyTicket,
} from "./reply-loop-prompts.ts";
import {
  REPLY_DRAFT_JSON_SCHEMA,
  REPLY_EVALUATION_JSON_SCHEMA,
  ReplyDraft,
  ReplyEvaluation,
} from "./reply-loop-schemas.ts";
import { runClaudeProcess, type ClaudeRunner } from "./run-claude-process.ts";

export type GenerateReply = (
  ticket: ReplyTicket, chunks: HandbookSearchResult[], previous: PreviousAttempt[],
) => Promise<StructuredResult<ReplyDraft>>;

export type EvaluateReply = (
  ticket: ReplyTicket, chunks: HandbookSearchResult[], draft: string, wordCount: number,
) => Promise<StructuredResult<ReplyEvaluation>>;

export function claudeReplyGenerator(run: ClaudeRunner = runClaudeProcess): GenerateReply {
  const args = structuredClaudeArgs(REPLY_DRAFT_JSON_SCHEMA, GENERATOR_SYSTEM_PROMPT);
  return async (ticket, chunks, previous) =>
    parseStructuredOutput(await run(args, buildGeneratorPrompt(ticket, chunks, previous)), ReplyDraft);
}

export function claudeReplyEvaluator(run: ClaudeRunner = runClaudeProcess): EvaluateReply {
  const args = structuredClaudeArgs(REPLY_EVALUATION_JSON_SCHEMA, EVALUATOR_SYSTEM_PROMPT);
  return async (ticket, chunks, draft, wordCount) =>
    parseStructuredOutput(await run(args, buildEvaluatorPrompt(ticket, chunks, draft, wordCount)), ReplyEvaluation);
}
