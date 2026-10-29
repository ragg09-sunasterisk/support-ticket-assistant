// Part 5: recall@k and precision@k for the handbook search over the answerable retrieval questions.
// These measure the search only (did the right chunks come back?), not whether Claude's answer is right.
import type { HandbookSearch } from "./handbook-search.ts";
import type { RetrievalQuestion } from "./retrieval-set.ts";

export interface QuestionMetrics {
  id: string;
  expected: string[];
  retrieved: string[];
  found: string[];
  recall: number;
  precision: number;
}

export interface RetrievalMetrics {
  k: number;
  questions: number;
  /** Mean over questions of (expected chunks in the top k) / (expected chunks). */
  recallAtK: number;
  /** Mean over questions of (expected chunks in the top k) / k. */
  precisionAtK: number;
  /** The best precision@k possible with these labels: questions expect only 1 or 2 chunks, not k. */
  precisionCeiling: number;
  perQuestion: QuestionMetrics[];
}

const mean = (values: number[]) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

// Unanswerable questions have no expected chunks, so they have no recall and are left out.
export function retrievalMetrics(questions: RetrievalQuestion[], search: HandbookSearch, k = 5): RetrievalMetrics {
  const perQuestion = questions
    .filter((q) => q.answerable && q.expected_chunk_ids.length > 0)
    .map((q): QuestionMetrics => {
      const retrieved = search(q.question, k).map((r) => r.chunk_id);
      const expected = [...new Set(q.expected_chunk_ids)];
      const found = expected.filter((id) => retrieved.includes(id));
      // Divide by k, not by what came back: returning fewer chunks must not look more precise.
      return { id: q.id, expected, retrieved, found, recall: found.length / expected.length, precision: found.length / k };
    });
  return {
    k,
    questions: perQuestion.length,
    recallAtK: mean(perQuestion.map((q) => q.recall)),
    precisionAtK: mean(perQuestion.map((q) => q.precision)),
    precisionCeiling: mean(perQuestion.map((q) => Math.min(q.expected.length, k) / k)),
    perQuestion,
  };
}
