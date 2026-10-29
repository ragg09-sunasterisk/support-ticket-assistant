// recall@5 and precision@5 of the handbook search on the retrieval set. No Claude calls.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { handbookSearchFor, type HandbookSearchResult } from "../src/handbook-search.ts";
import { retrievalMetrics } from "../src/retrieval-metrics.ts";
import { loadRetrievalSet, type RetrievalQuestion } from "../src/retrieval-set.ts";

const SET = fileURLToPath(new URL("../evals/retrieval.jsonl", import.meta.url));

// Measured on 2026-10-29: recall@5 0.944, precision@5 0.222 (ceiling 0.237). Each floor allows about
// one more miss than today, so a ranking change that loses a hit fails here. See logs/part-05-step-log.md.
const RECALL_FLOOR = 0.9;
const PRECISION_FLOOR = 0.21;

describe("retrievalMetrics", () => {
  const hit = (chunk_id: string): HandbookSearchResult =>
    ({ chunk_id, source_path: "", title: "", heading: "", score: 1, text: "", access: "public" });
  const questions: RetrievalQuestion[] = [
    { id: "RQ-01", question: "a", expected_chunk_ids: ["hb-01#x", "hb-01#y"], answerable: true },
    { id: "RQ-02", question: "b", expected_chunk_ids: ["hb-02#z"], answerable: true },
    { id: "RQ-03", question: "c", expected_chunk_ids: [], answerable: false },
  ];
  const fakeSearch = (query: string) => (query === "a" ? [hit("hb-01#x"), hit("hb-09#q")] : [hit("hb-09#q")]);

  it("averages per-question recall and precision over answerable questions only", () => {
    const m = retrievalMetrics(questions, fakeSearch, 5);
    expect(m.questions).toBe(2);
    expect(m.perQuestion.map((q) => [q.id, q.recall, q.precision])).toEqual([["RQ-01", 0.5, 0.2], ["RQ-02", 0, 0]]);
    expect(m.recallAtK).toBe(0.25);
    expect(m.precisionAtK).toBe(0.1);
    expect(m.precisionCeiling).toBeCloseTo((2 / 5 + 1 / 5) / 2);
  });
});

describe("handbook search on evals/retrieval.jsonl (role security, which can see every expected chunk)", () => {
  const m = retrievalMetrics(loadRetrievalSet(SET), handbookSearchFor("security"), 5);
  const misses = m.perQuestion.filter((q) => q.recall < 1).map((q) => `${q.id} ${q.found.length}/${q.expected.length}`);
  console.log(
    `[retrieval] ${m.questions} answerable questions, k=${m.k}: recall@5 ${m.recallAtK.toFixed(3)}, ` +
      `precision@5 ${m.precisionAtK.toFixed(3)} (ceiling ${m.precisionCeiling.toFixed(3)}); not fully found: ${misses.join(", ") || "none"}`,
  );

  it("covers all 27 answerable questions", () => {
    expect(m.questions).toBe(27);
  });

  it(`keeps recall@5 at or above ${RECALL_FLOOR}`, () => {
    expect(m.recallAtK).toBeGreaterThanOrEqual(RECALL_FLOOR);
  });

  it(`keeps precision@5 at or above ${PRECISION_FLOOR}`, () => {
    expect(m.precisionAtK).toBeGreaterThanOrEqual(PRECISION_FLOOR);
  });
});
