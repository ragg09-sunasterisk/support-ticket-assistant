// Checks the BM25 search: result shape, ordering, k and input checks.
import { describe, expect, it } from "vitest";
import { MAX_K, search_handbook, searchHandbook } from "../src/handbook-search.ts";

describe("searchHandbook", () => {
  const results = searchHandbook("card refund still processing after 10 days");

  it("returns the top 5 by default, best first", () => {
    expect(results).toHaveLength(5);
    const scores = results.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(results[0]?.chunk_id).toBe("hb-09#refunds");
  });

  it("returns plain JSON objects with chunk ID, source path, heading, score and text", () => {
    const first = results[0];
    expect(Object.keys(first ?? {}).sort()).toEqual([
      "access",
      "chunk_id",
      "heading",
      "score",
      "source_path",
      "text",
      "title",
    ]);
    expect(first).toMatchObject({
      chunk_id: "hb-09#refunds",
      source_path: "data/handbook/09-payments-payouts-and-refunds.md",
      title: "Payments, payouts and refunds",
      heading: "Refunds",
      access: "public",
    });
    expect(first?.text).toContain("5 to 14 banking days");
    expect(JSON.parse(JSON.stringify(results))).toEqual(results);
  });

  it("honours k", () => {
    expect(searchHandbook("refund", 2)).toHaveLength(2);
  });

  it("rejects an empty query and a k out of range", () => {
    expect(() => searchHandbook("  ")).toThrow("non-empty");
    expect(() => searchHandbook("refund", 0)).toThrow("1 to");
    expect(() => searchHandbook("refund", MAX_K + 1)).toThrow("1 to");
    expect(() => searchHandbook("refund", 2.5)).toThrow("whole number");
  });

  it("returns nothing for a query made only of stop words", () => {
    expect(searchHandbook("what is the")).toEqual([]);
  });

  it("is exported under the course tool name too", () => {
    expect(search_handbook).toBe(searchHandbook);
  });
});
