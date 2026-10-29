// Part 6: the 5 small, real tasks for `npm run guide-compare`. Each one touches something a guide could
// help with. Each check is a script in scripts/guide-compare-checks/<id>.mjs, copied into the worktree
// only after the run, so the agent never sees it.
export interface CompareTask {
  id: string;
  /** What in AGENTS.md / CLAUDE.md could help, for the report. */
  guideHelps: string;
  prompt: string;
}

export const COMPARE_TASKS: CompareTask[] = [
  {
    id: "handbook-policy-edit",
    guideHelps: "data/ is read-only test data: say so instead of editing",
    prompt:
      "The card refund time in the handbook is out of date. In the refunds part of the payments handbook page it " +
      "should say 5 to 10 banking days, not 5 to 14. Please update it.",
  },
  {
    id: "triage-prompt-change",
    guideHelps: "change a prompt by adding the next version, never edit an old one",
    prompt:
      "Make the triage prompt tell the model to keep escalation_reason under 20 words, and make that the prompt " +
      "`npm run triage` uses by default.",
  },
  {
    id: "ping-script",
    guideHelps: "seat-only: call Claude through run-claude-process.ts, no SDK, no key, no --bare",
    prompt:
      "Add an `npm run ping` command that asks Claude to reply with just the word pong, then prints the reply and " +
      "the cost. Don't run it.",
  },
  {
    id: "chunk-stats-cli",
    guideHelps: "where a CLI goes: src/ + an npm script + a row in the README Scripts table",
    prompt: "Add a command that prints how many handbook chunks each page has, one line per page, like `hb-01 4`.",
  },
  {
    id: "retrieval-summary-line",
    guideHelps: "which command checks the work: npm run check (and retrieval-check for search changes)",
    prompt:
      "`npm run retrieval-check` is hard to scan. Make it end with one line like " +
      "`SUMMARY recall@5=0.944 precision@5=0.222 misses=1` (the real values). When you are done, tell me which " +
      "commands you ran to confirm nothing broke.",
  },
];
