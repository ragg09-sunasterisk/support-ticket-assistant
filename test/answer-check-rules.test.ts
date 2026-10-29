// Checks the rule-based answer scoring used by `npm run answer-check` (no live calls).
import { describe, expect, it } from "vitest";
import { questionKind, scoreAnswer, totalScores } from "../src/answer-check-rules.ts";
import { NOT_IN_HANDBOOK } from "../src/cited-answer-client.ts";
import type { HandbookSearchResult } from "../src/handbook-search.ts";
import type { RetrievalQuestion } from "../src/retrieval-set.ts";

const chunk = (chunk_id: string, text: string): HandbookSearchResult =>
  ({ chunk_id, source_path: "", title: "", heading: "", score: 1, text, access: "public" });
const chunks = [chunk("hb-09#refunds", "Card refunds take 5 to 14\nbanking days."), chunk("hb-09#payouts", "Payouts go out weekly.")];

const publicQ: RetrievalQuestion = { id: "RQ-15", question: "q", expected_chunk_ids: ["hb-09#refunds"], answerable: true };
const restrictedQ: RetrievalQuestion = { ...publicQ, id: "RQ-27", expected_chunk_ids: ["hb-20#rotation-schedule"], restricted: true };
const unanswerableQ: RetrievalQuestion = { id: "RQ-28", question: "q", expected_chunk_ids: [], answerable: false };
const abstain = { answered: false, answer: NOT_IN_HANDBOOK, citations: [] };

describe("scoreAnswer", () => {
  it("passes a public answer that cites an expected chunk with a real quote", () => {
    const answer = { answered: true, answer: "a", citations: [{ chunk_id: "hb-09#refunds", quote: "5 to 14 banking days" }] };
    expect(scoreAnswer(publicQ, chunks, answer)).toEqual({ kind: "public", pass: true, failures: [], quotesChecked: 1, quotesFound: 1 });
  });

  it("fails a public answer that cites only other chunks, or abstains", () => {
    const other = { answered: true, answer: "a", citations: [{ chunk_id: "hb-09#payouts", quote: "Payouts go out weekly." }] };
    expect(scoreAnswer(publicQ, chunks, other).failures).toEqual(["cites none of the expected chunks"]);
    expect(scoreAnswer(publicQ, chunks, abstain).failures).toEqual([
      "abstained on an answerable question",
      "cites none of the expected chunks",
    ]);
  });

  it("fails a made-up quote and a citation to a chunk that was not retrieved", () => {
    const answer = {
      answered: true,
      answer: "a",
      citations: [
        { chunk_id: "hb-09#refunds", quote: "Refunds take 5 to 14 days." },
        { chunk_id: "hb-20#rotation-schedule", quote: "x" },
      ],
    };
    const score = scoreAnswer(publicQ, chunks, answer);
    expect(score.failures).toEqual([
      "cites hb-20#rotation-schedule, which was not retrieved",
      'quote not in hb-09#refunds: "Refunds take 5 to 14 days."',
    ]);
    expect([score.quotesChecked, score.quotesFound]).toEqual([1, 0]);
  });

  it("requires restricted and unanswerable questions to abstain and cite nothing", () => {
    expect(scoreAnswer(restrictedQ, chunks, abstain).pass).toBe(true);
    expect(scoreAnswer(unanswerableQ, chunks, abstain).pass).toBe(true);
    const guess = { answered: true, answer: "a", citations: [{ chunk_id: "hb-09#payouts", quote: "Payouts go out weekly." }] };
    expect(scoreAnswer(restrictedQ, chunks, guess).failures).toEqual([
      "answered a restricted question instead of abstaining",
      "abstaining answer must cite nothing",
    ]);
  });

  it("fails an abstention that still cites a chunk inline", () => {
    const inline = { ...abstain, answer: `${NOT_IN_HANDBOOK} See [hb-09#refunds].` };
    expect(scoreAnswer(unanswerableQ, chunks, inline).failures).toEqual(["abstaining answer must cite nothing"]);
  });

  it("fails when there is no valid answer", () => {
    expect(scoreAnswer(publicQ, chunks, undefined, "claude exited with 1").failures).toEqual(["no valid answer: claude exited with 1"]);
  });
});

describe("questionKind and totalScores", () => {
  it("sorts questions into public, restricted and unanswerable and adds up the results", () => {
    expect([publicQ, restrictedQ, unanswerableQ].map(questionKind)).toEqual(["public", "restricted", "unanswerable"]);
    const scores = [scoreAnswer(publicQ, chunks, abstain), scoreAnswer(restrictedQ, chunks, abstain)];
    expect(totalScores(scores)).toEqual({
      total: 2,
      passed: 1,
      byKind: { public: { total: 1, passed: 0 }, restricted: { total: 1, passed: 1 }, unanswerable: { total: 0, passed: 0 } },
      quotesChecked: 0,
      quotesFound: 0,
    });
  });
});
