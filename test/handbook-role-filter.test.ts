// Checks the role filter: restricted pages never come back for a role that isn't in `allowed_roles`.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadHandbookChunks } from "../src/handbook-chunker.ts";
import { chunksForRole, handbookSearchFor, isRole, MAX_K, searchHandbook, type Role } from "../src/handbook-search.ts";
import { loadRetrievalSet } from "../src/retrieval-set.ts";

const questions = loadRetrievalSet(fileURLToPath(new URL("../evals/retrieval.jsonl", import.meta.url)));
const pageOf = (chunkId: string) => chunkId.split("#")[0] ?? "";

// Every page each role gets back over all 30 questions. k = MAX_K, so it checks far deeper than the top 5.
function pagesReturned(role: Role): Set<string> {
  const search = handbookSearchFor(role);
  return new Set(questions.flatMap((q) => search(q.question, MAX_K).map((r) => pageOf(r.chunk_id))));
}

describe("role filter over the 30 retrieval questions", () => {
  it("never returns hb-18, hb-19 or hb-20 to support_agent", () => {
    const pages = pagesReturned("support_agent");
    expect(["hb-18", "hb-19", "hb-20"].filter((p) => pages.has(p))).toEqual([]);
  });

  it("never returns hb-18 to engineer, but does return hb-19 and hb-20", () => {
    const pages = pagesReturned("engineer");
    expect(pages.has("hb-18")).toBe(false);
    expect(pages.has("hb-19") && pages.has("hb-20")).toBe(true);
  });

  it("returns all three restricted pages to security", () => {
    const pages = pagesReturned("security");
    expect(["hb-18", "hb-19", "hb-20"].every((p) => pages.has(p))).toBe(true);
  });

  it("answers the restricted questions for security but not for support_agent", () => {
    for (const q of questions.filter((r) => r.restricted)) {
      const ids = (role: Role) => handbookSearchFor(role)(q.question, 5).map((r) => r.chunk_id);
      expect(q.expected_chunk_ids.some((id) => ids("security").includes(id))).toBe(true);
      expect(q.expected_chunk_ids.some((id) => ids("support_agent").includes(id))).toBe(false);
    }
  });
});

describe("chunksForRole", () => {
  const chunks = loadHandbookChunks();

  it("keeps exactly the chunks whose page lists the role", () => {
    expect(chunksForRole(chunks, "security")).toHaveLength(chunks.length);
    for (const role of ["support_agent", "engineer"] as const) {
      expect(chunksForRole(chunks, role).every((c) => c.allowedRoles.includes(role))).toBe(true);
    }
    expect(new Set(chunksForRole(chunks, "support_agent").map((c) => c.access))).toEqual(new Set(["public"]));
  });

  it("gives nobody a chunk with an empty allowed_roles list", () => {
    const orphan = { ...chunks[0]!, allowedRoles: [] };
    expect(chunksForRole([orphan], "security")).toEqual([]);
  });
});

describe("roles", () => {
  it("accepts only the three known roles", () => {
    expect(["support_agent", "engineer", "security"].every(isRole)).toBe(true);
    expect(["admin", "", "Security", undefined].some(isRole)).toBe(false);
    expect(() => handbookSearchFor("admin" as Role)).toThrow("unknown role");
  });

  it("defaults searchHandbook to support_agent, the least access", () => {
    expect(searchHandbook("payment provider keys rotated", MAX_K).map((r) => r.chunk_id))
      .toEqual(handbookSearchFor("support_agent")("payment provider keys rotated", MAX_K).map((r) => r.chunk_id));
  });
});
