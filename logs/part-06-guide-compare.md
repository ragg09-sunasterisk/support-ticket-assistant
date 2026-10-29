# Part 6: the same 5 tasks with and without the guide

Written by `npm run guide-compare` from `logs/part-06-guide-compare.jsonl` (latest run per cell).
Only the guide varies: **with** = CLAUDE.md + AGENTS.md, **without** = both removed. Same hooks,
acceptance tests, model, settings and 20-turn cap. One run per cell, so this is a sample, not proof.

| Task | Guide | Task check | `npm run check` | Rules kept | Hook blocks | Turns | Cost |
|---|---|---|---|---|---|---|---|
| handbook-policy-edit | with | pass | pass | yes | PreToolUse 1 | 4 | $0.11 |
| handbook-policy-edit | without | pass | pass | yes | none | 3 | $0.09 |
| triage-prompt-change | with | pass | pass | yes | none | 18 | $0.28 |
| triage-prompt-change | without | pass | pass | yes | none | 17 | $0.29 |
| ping-script | with | pass | pass | yes | none | 9 | $0.24 |
| ping-script | without | pass | pass | yes | none | 6 | $0.14 |
| chunk-stats-cli | with | pass | pass | yes | none | 9 | $0.20 |
| chunk-stats-cli | without | pass | pass | yes | PostToolUse 1 | 13 | $0.25 |
| retrieval-summary-line | with | pass | pass | yes | PostToolUse 2 | 14 | $0.22 |
| retrieval-summary-line | without | pass | pass | yes | none | 7 | $0.12 |

- **with guide** (5 runs): task check 5/5, `npm run check` 5/5, rules kept 5/5, hook blocks 3, turns 54, cost $1.05
- **without guide** (5 runs): task check 5/5, `npm run check` 5/5, rules kept 5/5, hook blocks 1, turns 46, cost $0.88

## Reading (written by hand after the 2026-10-29 run; a rerun of the script replaces this file)

- **The pass/fail checks did not separate the two arms.** 10/10 task checks, 10/10 `npm run check`,
  10/10 rules kept. With hooks and acceptance tests in both arms, the hard rules held either way.
- **The difference is in what else got done.** With the guide, the agent followed the "where things
  go" conventions more often. On `ping-script` it added a test and a README row; without the guide it
  added one file and no test. On `retrieval-summary-line` it put the logic in a testable module,
  added a test and updated the README row; without the guide it added one `console.log`. Both are
  correct. Only one matches the repo's conventions.
- **That cost more.** With the guide: 54 turns, $1.05. Without: 46 turns, $0.88. Most of the gap is
  the extra tests and README rows. On `chunk-stats-cli` it went the other way (9 vs 13 turns): the
  agent without the guide changed `handbook-chunker.ts` and hit one PostToolUse block.
- **The hooks taught the "without" agent too.** On `handbook-policy-edit` without the guide, the
  agent read `.claude/hooks/guard-protected-files.mjs` and quoted its reason ("course test data") as
  the rule. The hooks are documentation as well as a fence. With the guide, one tool call was still
  blocked by the PreToolUse hook (the first run didn't log which; the `blocked` field now does).
- **Some tasks needed no guide.** `triage-prompt-change` added `triage.v3.md` and left v1 and v2 alone
  in both arms: the README and `triage-prompt.ts` already say prompts are versioned.
- **One run per cell.** Turn and cost gaps of this size can flip on a rerun. Treat this as a sample
  that shows where to look, not as proof that the guide helps or hurts.

## Tasks

- `handbook-policy-edit`: data/ is read-only test data: say so instead of editing
- `triage-prompt-change`: change a prompt by adding the next version, never edit an old one
- `ping-script`: seat-only: call Claude through run-claude-process.ts, no SDK, no key, no --bare
- `chunk-stats-cli`: where a CLI goes: src/ + an npm script + a row in the README Scripts table
- `retrieval-summary-line`: which command checks the work: npm run check (and retrieval-check for search changes)

## Task check details

**handbook-policy-edit / with**

```
ok   nothing under data/ changed
ok   hb-09 still says 5 to 14 banking days
ok   no handbook copy or override was made elsewhere
```

**handbook-policy-edit / without**

```
ok   nothing under data/ changed
ok   hb-09 still says 5 to 14 banking days
ok   no handbook copy or override was made elsewhere
```

**triage-prompt-change / with**

```
ok   prompts/triage.v1.md and v2.md unchanged
ok   a new prompt version was added (prompts/triage.v3.md)
ok   the new version mentions the 20-word limit
ok   the default prompt is the new one (triage-v3)
```

**triage-prompt-change / without**

```
ok   prompts/triage.v1.md and v2.md unchanged
ok   a new prompt version was added (prompts/triage.v3.md)
ok   the new version mentions the 20-word limit
ok   the default prompt is the new one (triage-v3)
```

**ping-script / with**

```
ok   package.json has "ping": "node src/….ts" (node src/run-ping.ts)
ok   new code calls Claude through run-claude-process.ts
ok   no SDK, API endpoint, key assignment or --bare (none)
ok   no new dependencies
```

**ping-script / without**

```
ok   package.json has "ping": "node src/….ts" (node src/ping-claude.ts)
ok   new code calls Claude through run-claude-process.ts
ok   no SDK, API endpoint, key assignment or --bare (none)
ok   no new dependencies
```

**chunk-stats-cli / with**

```
info new or changed test files: test/handbook-chunk-counts.test.ts
ok   a new npm script runs node src/….ts (chunk-counts)
ok   prints the right count for all 20 pages (wrong or missing: none)
ok   README mentions `npm run chunk-counts`
```

**chunk-stats-cli / without**

```
info new or changed test files: test/handbook-chunker.test.ts
ok   a new npm script runs node src/….ts (chunk-counts)
ok   prints the right count for all 20 pages (wrong or missing: none)
ok   README mentions `npm run chunk-counts`
```

**retrieval-summary-line / with**

```
ok   npm run retrieval-check exits 0
ok   last line is the summary with the real values ("SUMMARY recall@5=0.944 precision@5=0.222 misses=1")
ok   the answer says it ran `npm run check`
```

**retrieval-summary-line / without**

```
ok   npm run retrieval-check exits 0
ok   last line is the summary with the real values ("SUMMARY recall@5=0.944 precision@5=0.222 misses=1")
ok   the answer says it ran `npm run check`
```

