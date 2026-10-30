// Checks that the 3 Part 7 bugs still plant cleanly into today's src/ (no Claude calls). The bugs are
// planted into copies in a temp folder, never into this checkout.
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/handbook-chunker.ts";
import { PLANTED_BUGS, plantBug } from "../src/planted-bugs.ts";

const tmp = mkdtempSync(join(tmpdir(), "sta-planted-bugs-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("planted bugs", () => {
  it("has 3 bugs, each in a different src/ file, each with a failing test named", () => {
    expect(PLANTED_BUGS.map((b) => b.id)).toEqual(["precision-divisor", "role-from-tool-args", "safeguard-lookbehind"]);
    expect(new Set(PLANTED_BUGS.map((b) => b.file)).size).toBe(3);
    for (const bug of PLANTED_BUGS) {
      expect(bug.file).toMatch(/^src\//);
      expect(bug.failingTest).toMatch(/^test\//);
    }
  });

  it.each(PLANTED_BUGS)("plants $id once, and refuses to plant it twice", (bug) => {
    const root = join(tmp, bug.id);
    cpSync(join(REPO_ROOT, bug.file), join(root, bug.file));
    const before = readFileSync(join(root, bug.file), "utf8");
    expect(plantBug(root, bug)).toBeNull();
    const after = readFileSync(join(root, bug.file), "utf8");
    expect(after).not.toBe(before);
    for (const [, replace] of bug.edits.filter(([, r]) => r !== "")) expect(after).toContain(replace);
    expect(plantBug(root, bug)).toMatch(/already planted/);
  });
});
