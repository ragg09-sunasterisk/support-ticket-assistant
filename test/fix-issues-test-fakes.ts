// Part 9 test helpers: in-memory FixIssuesDeps, a fake worker stream and fake verifier results.
// Not a test file itself (no `.test.ts`), so Vitest only runs it through the tests that import it.
import type { FixIssuesDeps, Workspace } from "../src/fix-issues-controller.ts";
import type { VerifierResult } from "../src/fix-issues-verifier.ts";
import { emptyProgress, type Issue, type IssueStatus, type Progress } from "../src/issue-files.ts";
import type { ProcessOutput } from "../src/run-claude-process.ts";

export function stream(o: { subtype?: string; turns?: number; cost?: number | null; isError?: boolean; result?: string; code?: number } = {}): ProcessOutput {
  const result = {
    type: "result", subtype: o.subtype ?? "success", is_error: o.isError ?? false, num_turns: o.turns ?? 5,
    ...(o.cost === null ? {} : { total_cost_usd: o.cost ?? 0.2 }), result: o.result ?? "Done.",
  };
  return { code: o.code ?? 0, signal: null, stderr: "", stdout: `${JSON.stringify({ type: "system", subtype: "init" })}\n${JSON.stringify(result)}\n` };
}

export const crash = (): ProcessOutput => ({ code: 1, signal: null, stdout: "", stderr: "boom: no result" });

export function verified(kind: "green" | "fail" | "none" | "protected", fp = "fp-a"): VerifierResult {
  const steps = kind === "green" || kind === "fail"
    ? [
      { step: "typecheck" as const, exitCode: 0, detail: [], tail: "" },
      { step: "lint" as const, exitCode: 0, detail: [], tail: "" },
      { step: "test" as const, exitCode: kind === "fail" ? 1 : 0, detail: kind === "fail" ? [`x > ${fp}`] : [], tail: kind === "fail" ? `FAIL ${fp}` : "" },
      ...(kind === "green" ? [{ step: "check:secrets" as const, exitCode: 0, detail: [], tail: "" }] : []),
    ]
    : [];
  return {
    changedFiles: kind === "none" ? [] : kind === "protected" ? ["src/a.ts", "test/acceptance/x.test.ts"] : ["src/a.ts"],
    protectedPaths: kind === "protected" ? ["test/acceptance/x.test.ts"] : [],
    steps,
    green: kind === "green",
    failingStep: kind === "fail" ? "test" : null,
    failingDetail: kind === "fail" ? [`x > ${fp}`] : [],
    fingerprint: kind === "fail" ? fp : null,
    diffStat: kind === "none" ? "" : "1 file changed, 2 insertions(+)",
  };
}

const issue = (n: number, autoFix = true, status: IssueStatus = "open"): Issue => {
  const id = `ISSUE-00${n}`;
  return { id, status, autoFix, title: `Issue ${n}`, body: `# Issue ${n}\nSomething is broken.`, path: `issues/${id}.md` };
};

export interface FakeWorld {
  deps: FixIssuesDeps;
  issues: Map<string, Issue>;
  progress: () => Progress;
  logs: Record<string, unknown>[];
  prompts: string[];
  commits: string[];
  fixes: string[];
  escalations: Map<string, string>;
  toggle: { enabled: boolean };
  removed: number;
}

/** `workers` and `verifies` are consumed in order, one per iteration. */
export function fakeWorld(opts: { issues?: Issue[]; workers: ProcessOutput[]; verifies: VerifierResult[]; onIteration?: (w: FakeWorld) => void }): FakeWorld {
  let progress = emptyProgress();
  const world: FakeWorld = {
    issues: new Map((opts.issues ?? [issue(1)]).map((i) => [i.id, i])),
    progress: () => progress, logs: [], prompts: [], commits: [], fixes: [], escalations: new Map(),
    toggle: { enabled: true }, removed: 0,
    deps: undefined as unknown as FixIssuesDeps,
  };
  world.deps = {
    readToggle: () => ({ enabled: world.toggle.enabled, read: JSON.stringify(world.toggle) }),
    loadIssues: () => [...world.issues.values()],
    loadProgress: () => structuredClone(progress),
    saveProgress: (p) => (progress = structuredClone(p)),
    setIssueStatus: (i, status) => world.issues.set(i.id, { ...(world.issues.get(i.id) as Issue), status }),
    writeEscalation: (id, md) => world.escalations.set(id, md),
    commitState: (_id, message) => (world.commits.push(message), "sha-state"),
    createWorkspace: (): Workspace => ({ dir: "/tmp/fake-wt" }),
    removeWorkspace: () => void world.removed++,
    runnerFor: () => async (args) => {
      world.prompts.push(args[args.indexOf("-p") + 1] ?? "");
      return opts.workers.shift() ?? crash();
    },
    verify: () => {
      const v = opts.verifies.shift() ?? verified("none");
      opts.onIteration?.(world);
      return v;
    },
    commitFix: (_ws, message) => (world.fixes.push(message), "sha-fix"),
    log: (r) => void world.logs.push(r),
    branchFor: (id) => `fix/${id}`,
  };
  return world;
}

export { issue };
