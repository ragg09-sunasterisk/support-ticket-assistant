// Part 7: three small, realistic bugs to plant in src/ so every learner gets the same bug-fix tasks.
// Each one is an exact text replacement, and an existing test fails once it is planted.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface PlantedBug {
  id: string;
  file: string;
  /** The test that fails once the bug is planted, as `npx vitest run` would name it. */
  failingTest: string;
  /** Exact [find, replace] pairs. Each `find` must occur exactly once in the file. */
  edits: [find: string, replace: string][];
}

export const PLANTED_BUGS: PlantedBug[] = [
  {
    // Divides by what came back instead of by k, so a search that returns fewer chunks looks more precise.
    id: "precision-divisor",
    file: "src/retrieval-metrics.ts",
    failingTest: "test/retrieval-metrics.test.ts > averages per-question recall and precision over answerable questions only",
    edits: [
      ["      // Divide by k, not by what came back: returning fewer chunks must not look more precise.\n", ""],
      ["precision: found.length / k }", "precision: found.length / retrieved.length }"],
    ],
  },
  {
    // "Let the caller pick the role": the model can now ask search_handbook for restricted pages.
    id: "role-from-tool-args",
    file: "src/handbook-mcp-tool.ts",
    failingTest: "test/acceptance/handbook-search.acceptance.test.ts > ignores a role the model adds to the tool call",
    edits: [
      ['import { DEFAULT_K, handbookSearchFor, type Role } from "./handbook-search.ts";',
        'import { DEFAULT_K, handbookSearchFor, ROLES, type Role } from "./handbook-search.ts";'],
      ["    .describe(`How many chunks to return, best first (1 to ${TOOL_MAX_K}, default ${DEFAULT_K}).`),\n});",
        "    .describe(`How many chunks to return, best first (1 to ${TOOL_MAX_K}, default ${DEFAULT_K}).`),\n" +
        '  role: z.enum(ROLES).optional().describe("Whose handbook view to search. Defaults to the server role."),\n});'],
      ["    const hits = handbookSearchFor(role, dir)(parsed.data.query, parsed.data.k);",
        "    const hits = handbookSearchFor(parsed.data.role ?? role, dir)(parsed.data.query, parsed.data.k);"],
      ["      role,\n      results:", "      role: parsed.data.role ?? role,\n      results:"],
    ],
  },
  {
    // A regex "simplification" drops the look-behind, so "Never disable 2-step verification" is flagged.
    id: "safeguard-lookbehind",
    file: "src/instruction-flag.ts",
    failingTest: "test/instruction-flag.test.ts",
    edits: [
      ['  // "turn off signature verification", "disable 2-step verification" (but not "Never disable ...")',
        '  // "turn off signature verification", "disable 2-step verification"'],
      ["    /(?<!(\\bnever|\\bnot|n't)\\s+)\\b(disable|turn", "    /\\b(disable|turn"],
    ],
  },
];

const count = (text: string, find: string) => text.split(find).length - 1;

/** Plants one bug in the checkout at `root`. Returns null on success, or why it could not be planted. */
export function plantBug(root: string, bug: PlantedBug): string | null {
  const path = join(root, bug.file);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    return `${bug.file}: ${error instanceof Error ? error.message : String(error)}`;
  }
  for (const [find] of bug.edits) {
    const n = count(text, find);
    if (n !== 1) return `${bug.file}: expected the text to plant into exactly once, found it ${n} times (already planted?)`;
  }
  for (const [find, replace] of bug.edits) text = text.replace(find, () => replace);
  writeFileSync(path, text);
  return null;
}

export function bugById(id: string): PlantedBug | undefined {
  return PLANTED_BUGS.find((b) => b.id === id);
}
