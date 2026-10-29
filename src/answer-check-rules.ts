// Part 5: scores one cited answer with fixed rules, no grader model. Answer accuracy, kept apart from
// the retrieval metrics: a question can fail here even when retrieval found the right chunk.
import { checkCitations, type CitedAnswer } from "./cited-answer-client.ts";
import type { HandbookSearchResult } from "./handbook-search.ts";
import type { RetrievalQuestion } from "./retrieval-set.ts";

export type QuestionKind = "public" | "restricted" | "unanswerable";

// Restricted questions count as "must abstain": the role the check runs as can't see their pages.
export function questionKind(q: RetrievalQuestion): QuestionKind {
  if (!q.answerable) return "unanswerable";
  return q.restricted ? "restricted" : "public";
}

export interface AnswerScore {
  kind: QuestionKind;
  pass: boolean;
  failures: string[];
  quotesChecked: number;
  quotesFound: number;
}

/**
 * Rules: every citation must point at a retrieved chunk and its quote must be in that chunk's text
 * (whitespace normalised). Public questions must answer and cite at least one expected chunk.
 * Restricted and unanswerable questions must abstain: answered false and no citations.
 */
export function scoreAnswer(
  q: RetrievalQuestion,
  chunks: HandbookSearchResult[],
  answer: CitedAnswer | undefined,
  failureReason?: string,
): AnswerScore {
  const kind = questionKind(q);
  if (!answer) return { kind, pass: false, failures: [`no valid answer: ${failureReason ?? "unknown"}`], quotesChecked: 0, quotesFound: 0 };

  const failures: string[] = [];
  const { unknownCitations, badQuotes } = checkCitations(answer, chunks);
  const listedUnknown = answer.citations.filter((c) => unknownCitations.includes(c.chunk_id));
  for (const id of unknownCitations) failures.push(`cites ${id}, which was not retrieved`);
  for (const c of badQuotes) failures.push(`quote not in ${c.chunk_id}: "${c.quote}"`);

  const cited = answer.citations.map((c) => c.chunk_id);
  if (kind === "public") {
    if (!answer.answered) failures.push("abstained on an answerable question");
    if (!q.expected_chunk_ids.some((id) => cited.includes(id))) failures.push("cites none of the expected chunks");
  } else {
    if (answer.answered) failures.push(`answered a ${kind} question instead of abstaining`);
    // Inline `[hb-xx#...]` counts too, not just the citations list.
    if (cited.length > 0 || /\[hb-\d{2}#/.test(answer.answer)) failures.push("abstaining answer must cite nothing");
  }

  const quotesChecked = answer.citations.length - listedUnknown.length;
  return { kind, pass: failures.length === 0, failures, quotesChecked, quotesFound: quotesChecked - badQuotes.length };
}

export interface AnswerCheckTotals {
  total: number;
  passed: number;
  byKind: Record<QuestionKind, { total: number; passed: number }>;
  quotesChecked: number;
  quotesFound: number;
}

export function totalScores(scores: AnswerScore[]): AnswerCheckTotals {
  const byKind = { public: { total: 0, passed: 0 }, restricted: { total: 0, passed: 0 }, unanswerable: { total: 0, passed: 0 } };
  for (const s of scores) {
    byKind[s.kind].total++;
    if (s.pass) byKind[s.kind].passed++;
  }
  return {
    total: scores.length,
    passed: scores.filter((s) => s.pass).length,
    byKind,
    quotesChecked: scores.reduce((n, s) => n + s.quotesChecked, 0),
    quotesFound: scores.reduce((n, s) => n + s.quotesFound, 0),
  };
}
