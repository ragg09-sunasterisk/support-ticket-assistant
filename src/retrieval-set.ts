// Part 4: the 30-question retrieval set in `evals/retrieval.jsonl` and a quick "hit in the top k"
// check. Part 5 adds recall@5 and precision@5 in `retrieval-metrics.ts`.
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { HandbookSearch } from "./handbook-search.ts";

export const RetrievalQuestion = z.object({
  id: z.string().regex(/^RQ-\d{2}$/),
  question: z.string().min(1),
  expected_chunk_ids: z.array(z.string()),
  answerable: z.boolean(),
  restricted: z.boolean().optional(),
});
export type RetrievalQuestion = z.infer<typeof RetrievalQuestion>;

export function loadRetrievalSet(path: string): RetrievalQuestion[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line, i) => ({ line, lineNumber: i + 1 }))
    .filter(({ line }) => line.trim() !== "")
    .map(({ line, lineNumber }) => {
      let json: unknown;
      try {
        json = JSON.parse(line);
      } catch {
        throw new Error(`${path} line ${lineNumber}: not valid JSON`);
      }
      const parsed = RetrievalQuestion.safeParse(json);
      if (!parsed.success) throw new Error(`${path} line ${lineNumber}: ${z.prettifyError(parsed.error)}`);
      return parsed.data;
    });
}

export interface RetrievalCheckRow {
  id: string;
  question: string;
  restricted: boolean;
  expected: string[];
  retrieved: string[];
  hit: boolean;
}

export interface RetrievalCheck {
  answerable: RetrievalCheckRow[];
  hits: number;
  misses: RetrievalCheckRow[];
  // For unanswerable questions there is nothing to hit; we only show what came back.
  unanswerable: RetrievalCheckRow[];
}

export function checkRetrieval(questions: RetrievalQuestion[], search: HandbookSearch, k = 5): RetrievalCheck {
  const rows = questions.map((q): RetrievalCheckRow & { answerable: boolean } => {
    const retrieved = search(q.question, k).map((r) => r.chunk_id);
    return {
      id: q.id,
      question: q.question,
      restricted: q.restricted ?? false,
      expected: q.expected_chunk_ids,
      retrieved,
      hit: q.expected_chunk_ids.some((id) => retrieved.includes(id)),
      answerable: q.answerable,
    };
  });
  const answerable = rows.filter((r) => r.answerable);
  return {
    answerable,
    hits: answerable.filter((r) => r.hit).length,
    misses: answerable.filter((r) => !r.hit),
    unanswerable: rows.filter((r) => !r.answerable),
  };
}
