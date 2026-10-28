// Part 4: BM25 keyword search over the handbook chunks with MiniSearch. Runs locally: no embeddings,
// no API, no key. `search_handbook` is the course's tool function; Part 5 wraps it in an MCP server,
// so its input and output are plain JSON values.
import MiniSearch from "minisearch";
import { loadHandbookChunks, type HandbookChunk } from "./handbook-chunker.ts";

export const DEFAULT_K = 5;
export const MAX_K = 20;

/** One search hit. Every field is a plain string or number, so it serializes to JSON as-is. */
export interface HandbookSearchResult {
  /** Stable chunk ID, `<page id>#<heading slug>`, e.g. `hb-09#refunds`. Cite this. */
  chunk_id: string;
  /** Page file relative to the repo root, e.g. `data/handbook/09-payments-payouts-and-refunds.md`. */
  source_path: string;
  /** Page title from the front matter. */
  title: string;
  /** The `##` heading, or the page title for the text before the first `##`. */
  heading: string;
  /** MiniSearch BM25 score, rounded to 3 decimals. Higher is better; only comparable within one query. */
  score: number;
  /** The chunk's Markdown text, without its heading. */
  text: string;
  /** The page's `access` from the front matter: `public` or `restricted`. Not filtered on yet. */
  access: string;
}

export type HandbookSearch = (query: string, k?: number) => HandbookSearchResult[];

// Words too common to help ranking. Dropping them also keeps prefix search from matching "a*" or "is*".
const STOP_WORDS = new Set(
  ("a an and are as at be but by can do does for from has have how i if in into is it its me my no not " +
    "of on or our so that the their them then there they this to was we what when where which who why " +
    "will with you your").split(" "),
);

function processTerm(term: string): string | null {
  const lower = term.toLowerCase();
  return STOP_WORDS.has(lower) ? null : lower;
}

export function createHandbookSearch(chunks: HandbookChunk[]): HandbookSearch {
  const index = new MiniSearch<HandbookChunk>({
    idField: "chunkId",
    fields: ["title", "heading", "text"],
    storeFields: ["chunkId", "sourcePath", "title", "heading", "text", "access"],
    processTerm,
    searchOptions: {
      // A heading match says more than one word in the body.
      boost: { heading: 2, title: 1.5 },
      // There is no stemming, so "refund" should still find "refunds". Short words must match exactly.
      prefix: (term) => term.length >= 4,
      fuzzy: (term) => (term.length >= 6 ? 0.2 : false),
      combineWith: "OR",
    },
  });
  index.addAll(chunks);

  return (query, k = DEFAULT_K) => {
    if (typeof query !== "string" || query.trim() === "") throw new Error("query must be a non-empty string");
    if (!Number.isInteger(k) || k < 1 || k > MAX_K) throw new Error(`k must be a whole number from 1 to ${MAX_K}`);
    return index.search(query).slice(0, k).map((hit) => ({
      chunk_id: String(hit.chunkId),
      source_path: String(hit.sourcePath),
      title: String(hit.title),
      heading: String(hit.heading),
      score: Math.round(hit.score * 1000) / 1000,
      text: String(hit.text),
      access: String(hit.access),
    }));
  };
}

let defaultSearch: HandbookSearch | undefined;

/**
 * Searches all 20 handbook pages (no role filter yet: Part 5 adds it) and returns the top-k chunks,
 * best first. Throws on an empty query or a k outside 1..20. Builds the index on first use.
 */
export function searchHandbook(query: string, k = DEFAULT_K): HandbookSearchResult[] {
  defaultSearch ??= createHandbookSearch(loadHandbookChunks());
  return defaultSearch(query, k);
}

/** The course's tool name for the same function. */
export const search_handbook = searchHandbook;
