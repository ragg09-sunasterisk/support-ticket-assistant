// Checks the committed retrieval set and the quick top-k check.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadHandbookChunks } from "../src/handbook-chunker.ts";
import type { HandbookSearchResult } from "../src/handbook-search.ts";
import { checkRetrieval, loadRetrievalSet, type RetrievalQuestion } from "../src/retrieval-set.ts";

const SET = fileURLToPath(new URL("../evals/retrieval.jsonl", import.meta.url));
const RESTRICTED_PAGES = ["hb-18", "hb-19", "hb-20"];
const pageOf = (chunkId: string) => chunkId.split("#")[0] ?? "";

describe("evals/retrieval.jsonl", () => {
  const questions = loadRetrievalSet(SET);
  const chunkIds = new Set(loadHandbookChunks().map((c) => c.chunkId));
  const publicQs = questions.filter((q) => q.answerable && !q.restricted);
  const restrictedQs = questions.filter((q) => q.restricted);
  const unanswerable = questions.filter((q) => !q.answerable);

  it("has exactly 30 questions with unique ids", () => {
    expect(questions).toHaveLength(30);
    expect(new Set(questions.map((q) => q.id)).size).toBe(30);
  });

  it("only expects chunk IDs that exist", () => {
    expect(questions.flatMap((q) => q.expected_chunk_ids).filter((id) => !chunkIds.has(id))).toEqual([]);
  });

  it("has 24 public, 3 restricted and 3 unanswerable questions", () => {
    expect([publicQs.length, restrictedQs.length, unanswerable.length]).toEqual([24, 3, 3]);
    expect(restrictedQs.every((q) => q.answerable)).toBe(true);
  });

  it("spreads the public questions across all 17 public pages and only uses public chunks", () => {
    const pages = publicQs.flatMap((q) => q.expected_chunk_ids.map(pageOf));
    expect(new Set(pages).size).toBe(17);
    expect(pages.filter((p) => RESTRICTED_PAGES.includes(p))).toEqual([]);
    expect(publicQs.every((q) => q.expected_chunk_ids.length > 0)).toBe(true);
  });

  it("answers restricted questions only from hb-18, hb-19 and hb-20", () => {
    for (const q of restrictedQs) {
      expect(q.expected_chunk_ids.length).toBeGreaterThan(0);
      expect(q.expected_chunk_ids.every((id) => RESTRICTED_PAGES.includes(pageOf(id)))).toBe(true);
    }
  });

  it("gives unanswerable questions no expected chunks", () => {
    expect(unanswerable.every((q) => q.expected_chunk_ids.length === 0)).toBe(true);
  });
});

describe("checkRetrieval", () => {
  const hit = (chunk_id: string): HandbookSearchResult =>
    ({ chunk_id, source_path: "", title: "", heading: "", score: 1, text: "", access: "public" });
  const questions: RetrievalQuestion[] = [
    { id: "RQ-01", question: "a", expected_chunk_ids: ["hb-01#plans", "hb-01#x"], answerable: true },
    { id: "RQ-02", question: "b", expected_chunk_ids: ["hb-02#low"], answerable: true, restricted: true },
    { id: "RQ-03", question: "c", expected_chunk_ids: [], answerable: false },
  ];
  const fakeSearch = (query: string) => (query === "a" ? [hit("hb-01#plans")] : [hit("hb-09#refunds")]);

  it("counts a hit when any expected chunk is retrieved and lists the misses", () => {
    const result = checkRetrieval(questions, fakeSearch);
    expect(result.hits).toBe(1);
    expect(result.answerable.map((r) => r.id)).toEqual(["RQ-01", "RQ-02"]);
    expect(result.misses.map((r) => [r.id, r.restricted, r.retrieved])).toEqual([["RQ-02", true, ["hb-09#refunds"]]]);
    expect(result.unanswerable.map((r) => r.id)).toEqual(["RQ-03"]);
  });
});
