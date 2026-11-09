# Part 9 step log: loop engineering (the bounded issue-fixing loop)

- **Date:** 2026-11-05
- **Branch:** `part-10-start` (cut from `part-09-start`). The loop's own state commits, the approved merge
  and the drill's commits are on it; the reference work itself is uncommitted for the owner to review.
- **Tools:** Claude Code 2.1.318 on the Team seat, model claude-opus-5-5 (session and workers). Node 26.7.0,
  git 2.54.0. WSL2.
- **Result:** see "Result" below the steps: the loop works on all 10 stop rules, rollout + approval + rollback drill done, one-shot 60% vs loop 70% resolved ($2.32 vs $2.47), seat cost $7.51, `npm run check` green (236 tests).

## Steps

### 1. Read the spec and Parts 6–8

**What:** Read `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/loop-design.md` (the spec), `logs/part-08-step-log.md`,
`src/throwaway-worktree.ts`, `src/project-agent-run.ts`, `src/run-claude-process.ts`,
`src/reply-loop-controller.ts`, `src/run-guide-compare.ts` and `scripts/guide-compare-checks/`. `npm run check`
was green (196 tests).

**Why:** the loop reuses what exists: `agentRunArgs()` (project settings only, no user memory, no
`--bare`), `summarizeAgentStream()` (turns, cost, subtype), `runClaudeProcess()` (spawn, no shell),
`parsePorcelainPaths()`, and the Part 6 pattern of copying a check folder into a worktree only after the
agent is done.

### 2. The controller and its parts (`src/fix-issues-*.ts`)

**What:** one small module per job, each under 200 lines:

| File | Job |
|---|---|
| `fix-issues-limits.ts` | the four constants of section 7 (+ `MAX_CALL_COST_USD = 1.00`); `resolveLimits()` rejects any flag above a constant |
| `issue-files.ts` | issue front matter, the toggle (`readToggle`: missing / bad JSON / not `true` = off), `progress.json`, the pick rule |
| `fix-issues-worker.ts` | the worker prompt (issue in `<issue>` tags, tag-escaped, untrusted), the command line (`agentRunArgs()` + `--max-budget-usd 1.00`, project settings only, never `--bare`), `isWorkerError()` |
| `fix-issues-verifier.ts` | `git status`, protected paths (incl. git-ignored `.env*`), the four check steps one by one, the fingerprint |
| `fix-issues-rules.ts` | the issue rules in order, first match wins; returns the values it compared for the log |
| `fix-issues-escalation.ts` | the escalation summary: what was tried, evidence, one decision |
| `fix-issues-git.ts` | worker worktrees on `fix/<ID>`, the fix commit, the state commit (`git commit -- <paths>`) |
| `fix-issues-controller.ts` | the loop of section 6, every effect injected (`FixIssuesDeps`) |
| `fix-issues-real-deps.ts`, `run-fix-issues.ts` | the real deps and the thin CLI |

Additive changes to existing code: `runClaudeProcess()` takes an optional command (for the crash
stand-in), `agentRunArgs()` takes `maxBudgetUsd`, `summarizeAgentStream()` returns `isError`.

**Why:** the controller decides, everything else is a dependency, so 15 tests run every stop rule with
fakes (no Claude, no git, no npm): `test/fix-issues-controller.test.ts`. `test/fix-issues-parts.test.ts`
covers limits, issue files, the toggle, the fingerprint and the worker command line;
`test/fix-issues-git.test.ts` runs the git helpers against a throwaway repo in the temp folder, including
"leave scripts/issue-checks/ out and keep git status clean" and "no code path opens a PR, pushes or
merges" (it greps the loop's modules).

**Design changes while building** (all marked **(Part 9)** in `docs/loop-design.md`):

- **Run stops vs escalation contradicted each other.** Section 8 said a run stop that leaves an issue
  in-progress writes an escalation (→ `needs-human`), while section 2's pick rule resumes an in-progress
  issue "cut off" by a run. Chosen: a budget or iteration-cap stop leaves it `in-progress`, lists it as
  `left_in_progress` in the stop line, and the next run resumes it. The toggle-off stop changes nothing.
- **Where the per-call budget goes in the rule order** (it wasn't in the list): after the turn limit.
- **Opening an issue is a fresh start** (attempts, fingerprint, feedback reset), so a person can reopen
  an escalated issue.
- **`progress.json` also keeps `feedback` and `history`**, so retries and escalation summaries resume
  from files, not memory.
- **The worker prompt says how to give up**: "if the issue needs a decision it doesn't make, or can only
  be fixed by changing a protected path, change nothing and explain why". Without that, rule 3 (no diff)
  is only a failure signal; with it, it is the worker's way to escalate. Same prompt in both comparison arms.
- **The verifier stages the change in the worktree's own index** before `check:secrets` (it scans the
  index, so new files were invisible to it), and finds `.env*` with `git ls-files --ignored` (they are
  git-ignored, so `git status` never shows them). Paths are made relative before fingerprinting.

### 3. Ten seeded issues and their hidden checks

**What:** `issues/ISSUE-001.md` … `ISSUE-010.md`, written as teammates would file them (symptom, how to
reproduce, expected behaviour, never the fix). Every defect was confirmed on today's code first.

| Issue | Defect (real, in today's code) | Built to |
|---|---|---|
| 001 | `retrieval-check --set <missing>` prints a Node stack trace | be fixed |
| 002 | `golden` on an empty file prints `NaN%`, exits 0, logs a summary | be fixed |
| 003 | a front matter value starting with `[` (title `[Beta] …`) is parsed as a list | be fixed |
| 004 | `retrieval-check` on a set with no answerable questions prints 0.000 and exits 0; the issue reports two people disagreeing (fail vs `n/a`) | **escalate: a decision only a person can make** |
| 005 | duplicate question ids in a retrieval set load silently | be fixed |
| 006 | `triage`, `golden`, `eval` lack the API-key guard the other paid scripts have | be fixed |
| 007 | "add 2+ unanswerable questions"; the acceptance test pins 30 / 3 | **escalate: only a `test/acceptance/` edit can go green** |
| 008 | a heading without Latin letters gives chunk ID `hb-21#` | be fixed |
| 009 | `--dry-run` for 12 lab scripts, each with a test | **escalate: too big for one 30-turn worker** |
| 010 | an answerable question with no expected chunks is counted two ways | be fixed |

The design doc's example ("Retrieval check prints NaN when the set is empty") is **not real**:
`mean([])` returns 0, so it prints 0.000. The real NaN is in `npm run golden` (ISSUE-002); the empty-set
retrieval case became the decision issue (ISSUE-004).

Hidden checks: `scripts/issue-checks/ISSUE-NNN.mjs` + `check-helpers.mjs`, like the Part 6 guide-compare
checks. A check never calls Claude: a stand-in `claude` first on PATH records any call. The API-key name
is assembled at run time so the secret scanner doesn't flag the check file.

- **Every check fails on today's code:** `npm run loop-compare -- --base e59aa90 --checks-only`: 10/10
  `hidden check FAIL`, each with the failing findings (e.g. ISSUE-002 "exits non-zero (got 0)", "no NaN in
  the output"; ISSUE-008 "every ID matches the pattern (… hb-21#, hb-21#-2 …)").
- **Every doable check can pass:** I wrote a reference fix for each of the 7 as a patch in a scratch
  worktree under the git-ignored `coverage/`, then ran
  `npm run loop-compare -- --base e59aa90 --checks-only --patches coverage/p9/ref-fixes --issues …`: 7/7
  `hidden check PASS | npm run check green`. The patches were deleted at the end (step 13); no reference fix is committed.

### 4. Snag: the sandbox and `git sparse-checkout`

**What happened:** the first `npm run fix-issues 2>&1 | tee …` died in `createWorkerWorktree`:
`could not lock config file …/.git/config: File exists`. `.git/config.lock` is a character device the
sandbox puts there: in the sandbox `.git/config` is read-only. `git sparse-checkout set` in a linked
worktree must write `extensions.worktreeConfig` to it. The run had committed `ISSUE-001 attempt 1 ->
in-progress` before it died (commit `09a4dc2`); the stale worktree had to be removed by hand.

**Two lessons:**

1. **A piped command isn't the excluded command.** `npm run fix-issues*` is in `sandbox.excludedCommands`,
   but `npm run fix-issues 2>&1 | tee x` ran sandboxed. The bare `npm run fix-issues` ran outside (its
   worktree landed in `/tmp`, not the sandbox's `/tmp/claude-1000`, and `claude` reached the network). Part 8's
   blocked runs may have had the same cause (they used `cd … &&` too); the bare command worked this time.
2. **Hide files without touching git config.** Now: `git worktree add --no-checkout`, `git read-tree HEAD`
   (index only), `git update-index --skip-worktree` on `scripts/issue-checks/*`, `git checkout-index --all`
   (skips those entries). That is what sparse checkout does underneath, with no config write. `git status`
   is clean, and a fix commit still contains the hidden files unchanged (test "commit only a green change
   on fix/<ID>, and the commit keeps the hidden checks").

The `node_modules` link still shows as `?? node_modules` in plain `git status` (`.gitignore`'s
`node_modules/` doesn't match a link), as in Part 6. The loop excludes it with the pathspec
`':!node_modules'` everywhere.

The resumed issue counted: ISSUE-001's first real worker was **attempt 2** (the cut-off run is attempt 1
in `progress.json`). That is the pick rule's "a run that was cut off and resumed", working.

**Where you can get stuck:** if `npm run fix-issues` fails in `git worktree`/`sparse-checkout` with a
`.git/config` lock error, or `claude` exits 1 with no cost, you are in the sandbox. Run the bare command
(no pipe, no `cd … &&`), or from your own terminal.

### 5. Rollout: three easy issues first

**What:** `auto-fix: true` on ISSUE-001, 002, 003 only; `issues/auto-fix.json` = `{ "enabled": true }`.

- `npm run fix-issues -- --max-iterations 1`: ISSUE-001 attempt 2 green (10 turns, $0.27, 77 s worker),
  commit `4b37123` on `fix/ISSUE-001`; then the run stopped on **`max-iterations`** (`max_iterations: 1`).
- `npm run fix-issues`: ISSUE-002 green (16 turns, $0.30), ISSUE-003 green (6 turns, $0.18; it touched
  `src/handbook-chunker.ts`, so the verifier also ran `retrieval-check`: exit 0), then **`queue-empty`**.

Each branch is exactly one commit with tests added (`git show --stat fix/ISSUE-001`: 4 files,
+47 −3). Rollout cost: $0.75.

### 6. Approval: the human step (I acted as the person)

**What:** I read `git diff HEAD...fix/ISSUE-001` (a try/catch around the set load, a clear error, 2 new
tests) and ran `npm run fix-issues:approve -- --issue ISSUE-001 --approved-by "…"`. **This is the
human approval step.** In this dry run, I (the agent) played the person. The approver label in the log
names the owner "acting as the human approver", but it was the dry-run agent, not Rene. The script
refuses anything not `ready-for-review`, not exactly one commit ahead, or touching a protected path.
It merges locally with `--no-ff`, runs the four check steps (all 0), closes the issue and logs
`event: "human-approval"` to `logs/part-09-rollout.jsonl`. No PR, no push.

### 7. Rollback drill (`npm run fix-issues:drill`)

**What:** a scripted bad commit lands as if an iteration had been merged (`mean()` in
`src/retrieval-metrics.ts` divides by `length + 1`), commit `42f4252`. `npm run check` → `test: 1`, failing
"retrievalMetrics averages per-question recall and precision over answerable questions only". The toggle
goes off (committed), `git revert --no-edit 42f4252` → `ec20afa`, `npm run check` → all 0. Each step is a
line in `logs/part-09-rollout.jsonl` (`drill-check` before / after the bad commit / after the revert,
`drill-bad-commit`, `drill-toggle-off`, `drill-revert`). The toggle stays off until a person turns it on.

### 8. Kill switch, then label the rest

**What:** with the toggle still off from the drill, I set `auto-fix: true` on the other 7 issues and ran
`npm run fix-issues`: **`toggle-off`** at once, `toggle_read: "{ \"enabled\": false }"`, 0 iterations,
no commit. Then `{ "enabled": true }` and the full run (step 9).

### 9. The full run on the other 7 issues

**What:** `npm run fix-issues` (all limits at their constants), log lines 7–15:

| Line | Issue | Attempt | Worker | Outcome |
|---|---|---|---|---|
| 7 | 004 (decision) | 1 | 2 turns, $0.11 | **`no-diff`** → needs-human. The worker: "I haven't changed anything. The issue needs a decision it doesn't make…" |
| 8 | 005 | 1 | 12 turns, $0.25 | green, `efa3f85` |
| 9 | 006 | 1 | 9 turns, $0.26 | retry: `check:secrets` exit 1 (its test put a key-shaped value next to the variable name) |
| 10 | 006 | 2 | 8 turns, $0.28 | green, `794f9dd`: the verifier's evidence fixed it |
| 11 | 007 (protected) | 1 | 4 turns, $0.16 | **`no-diff`**: the worker saw the fix needs `test/acceptance/` and stopped |
| 12 | 008 | 1 | 8 turns, $0.22 | green (`retrieval-check` also ran: exit 0) |
| 13 | 009 (too big) | 1 | 4 turns, $0.19 | **`no-diff`**: it declined instead of running out of turns |
| 14 | 010 | 1 | 10 turns, $0.23 | green |
| 15 | – | – | – | **`queue-empty`** after 8 iterations, $1.70 |

**What it shows:** all 7 doable issues went green on the first or second attempt (6 of 7 on the first). The
retry on ISSUE-006 is the loop paying for itself: one-shot would have stopped at a red `check:secrets`.
The three escalation issues all stopped at once with **no diff**, not with the rule they were built for.
The prompt's "change nothing and say why" route works, and it is cheap ($0.11–0.19). The escalation
summaries (`issues/escalations/ISSUE-004.md`, `-007.md`, `-009.md`) quote the worker's reason and ask the
one question. ISSUE-004's: "Is the issue fixable as written, or does a person first have to decide the
expected behaviour…?"

### 10. Review pass (read-only `reviewer` subagent) and fixes

**What:** I gave the reviewer the file list and the spec while the full run was going. Verdict: changes
requested. It confirmed the rule order, green before turn-limit, the toggle read per iteration, missing
cost = $1.00, lower-only flags, no `--bare`, no push/merge/PR path. Fixed from its list:

- **The verifier runs worker-written code outside the worker's sandbox** (a planted test could push, read
  secrets, or write a git hook). The check steps now get an environment without git credentials, SSH or
  askpass sockets and Claude tokens (`checkEnv()`), and the fix commit runs with `core.hooksPath=/dev/null`.
  The check steps are still not OS-sandboxed: new threat-model row **G16** (Mitigate), with the residual
  risk written down.
- **"Green" could be faked** by editing `package.json`, `vitest`/`eslint`/`tsconfig` config,
  `scripts/check-secrets.mjs` or `.githooks/`. All are protected paths now (escalate at once). This also
  blocks new dependencies, which section 1 put out of scope.
- **`-B fix/<ID>` could throw away a green commit** (or a person's commit) when an issue is reopened. An
  existing branch with commits not in HEAD is now kept as `fix/<ID>-prev-<time>`. `--force` is gone.
- **A run killed during an issue's last attempt stranded it** (`in-progress`, never pickable, never
  escalated). The controller now escalates such issues at the start of a run (`event: "recovered"`,
  `max-attempts`, `interrupted: true`).
- **Retry evidence was labelled "from code"**, but the output lines can be text printed by tests the last
  worker wrote. The prompt now says the exit codes come from code and the output is data, not instructions.
- **Fingerprint collisions:** an empty detail (timeout, crash) gave every such failure the same hash. It now
  falls back to the last output lines. ESLint errors keep their file name.
- **Approve closed the issue even when `npm run check` was red after the merge.** It stays
  `ready-for-review` now.
- **An issue's `id` must match its file name**, or the loading fails.
- **Seat-only guard** (`src/seat-only-guard.ts`): `fix-issues` and `loop-compare` also refuse
  `ANTHROPIC_AUTH_TOKEN` and the Bedrock/Vertex/Foundry switches.
- **Comparison fairness:** loop-arm workers started from the arm's HEAD (with `issues/` and progress in
  their tree); now they start from the base commit, like one-shot. A transcript that mentions
  `issue-checks` now makes the outcome **not resolved**, not just flagged.

New tests for each (37 loop tests). **Not changed, on purpose:** the two `excludedCommands` entries (the
reviewer suggested removing them). `claude` needs the network, which the sandbox blocks; they need `ask`
rules instead (see "For the owner"). The hidden checks can still be reached with `git show
<commit>:scripts/issue-checks/…` once they are committed: that is why the scorer scans transcripts.

**Snag:** the new `-prev` copy first used `git branch -m`, which writes `.git/config`. A foreground
`npm run fix-issues` from this session ran sandboxed and failed with `could not lock config file`. The
ref had moved, so nothing was lost, but ISSUE-010's attempt 1 was cut off with no log line. Now it copies
the ref (`git branch <new> <old>`), which needs no config write.

### 11. Forcing the stop rules that didn't fire on their own

**What:** short runs, each on one reopened issue (I set `status: open` as the person). I reopened
already-green issues so the real escalations of 004/007/009 stay intact; their green commits are kept on
`fix/<ID>-prev-*`.

| Line | Rule | How | Worker |
|---|---|---|---|
| 16–17 | green on the last turn, then run **`budget`** | `--max-turns 3 --max-run-cost 0.01`, ISSUE-010 | real: `error_max_turns` but green → **green wins** (section 7's ordering, shown for real); then `run_cost_usd 0.1687 >= threshold 0.01` |
| 18 | **`turn-limit`** | `--max-turns 2 --max-iterations 1`, ISSUE-006 | real: `error_max_turns`, 3 turns, $0.10, not green |
| 20 | **`protected-path`** | `--worker-stand-in protected`, ISSUE-002 | stand-in edits `test/acceptance/…` in its worktree; `paths: ["test/acceptance/handbook-search.acceptance.test.ts"]` |
| 22 | **`worker-error`** | `--worker-stand-in crash`, ISSUE-003 | stand-in exits 1 with no result; `subtype: "no result"`, `cost_missing: true`, run cost counted $1.00 |
| 24–25 | **`repeated-failure`** | `--worker-stand-in failing`, ISSUE-005 | same broken `mean()` twice: attempt 1 retry, attempt 2 same fingerprint |
| 27 | **`max-attempts`** | `--worker-stand-in failing --max-attempts 1`, ISSUE-008 | `attempts: 1, max_attempts: 1` |

Every flag only lowers a constant. The stand-ins (`scripts/claude-stand-in-*.mjs`) make no Claude calls and
work only in their own throwaway worktree. **Honest note:** `protected-path`, `repeated-failure` and
`max-attempts` were planned to fire on real workers. They didn't: the real workers either got green or
declined with no diff. So these three are shown with stand-ins through the real controller, verifier and
git. The worker-error stand-in was planned.

### 12. One-shot vs loop (`npm run loop-compare -- --base e59aa90 --max-loop-cost 8`)

**What:** both arms from `e59aa90` (the commit before any Part 9 work: no fixes, no `issues/`), every
worker in a throwaway worktree without `scripts/issue-checks/`. Same prompt, flags, 30-turn limit and
$1.00 cap. One-shot: 10 calls, no retry. Loop: the controller with the issues seeded fresh (open,
auto-fix on), branches under `loop-compare/<run>/` (deleted after scoring; SHAs in the log), several runs
until `queue-empty` (it hit `max-iterations` after 10 iterations, and the next run finished). Scored with
the hidden checks. Log: `logs/part-09-loop-compare.jsonl` (raw loop records plus one `outcome` line per
issue per arm). Table: `evals/loop-vs-one-shot.md`.

| Arm | Resolved | Calls | Turns | Est. cost | Wall time |
|---|---|---|---|---|---|
| one-shot | 6/10 (60%) | 10 | 101 | $2.32 | 13.7 min |
| loop | 7/10 (70%) | 11 | 96 | $2.47 | 13.8 min |

**Reading:** the loop bought one more resolved issue (ISSUE-006) for $0.15 and one call. In both arms the
first attempt failed `check:secrets` (its new test put a key-shaped value next to the variable name). The
loop fed that back and went green; one-shot stopped red. The other 9 issues behaved the same in both
arms, and the three escalation issues ended with no diff in both. Lesson 9.3's question ("did the extra
complexity improve outcomes?"): yes here, narrowly, and only where the failure was something a check
could explain. With one run per arm, one issue is within noise. No transcript mentioned `issue-checks`.

### 13. `npm run check`

typecheck, lint, **236 tests** (196 before; 37 new loop tests in `test/fix-issues-*.test.ts`; 3 came with
the approved ISSUE-001 merge), `check-secrets: no .env files or keys found`. `npm run retrieval-check`:
recall@5 0.944 (unchanged). New `src/` files are 13–173 lines. Nothing under `data/`, `test/acceptance/`,
`.claude/` or `.mcp.json` changed in the checkout (the protected-path stand-in edited only its throwaway
worktree). No throwaway worktree is left (`git worktree list`: the checkout only), the scratch reference
patches are deleted, and the repo is on `part-10-start`.

## Result

`npm run fix-issues` is the loop of `docs/loop-design.md`: one `claude -p` worker per iteration in a fresh
worktree on `fix/<ID>`, a code verifier (four check steps one by one, protected paths, a failure
fingerprint), the issue rules in order, and the toggle read before every iteration. The run stops
(budget, iteration cap, toggle, empty queue) all fire, and so do the issue stops. Ten real seeded issues:
in the real runs all 7 doable ones went green (one after a retry driven by verifier evidence), and the 3
built to escalate stopped with no diff and an escalation summary. All 10 stop rules appear in
`logs/part-09-fix-issues.jsonl`. Six came from real workers, flags and the toggle; protected-path,
worker-error, repeated-failure and max-attempts came from stand-in workers, because the real workers never
produced them (step 11). The rollout ran on 3 issues first. A person (me, acting) approved and merged one
branch locally. The rollback drill went red → toggle off → `git revert` → green. One-shot vs loop on all
10: **60% vs 70% resolved, $2.32 vs $2.47**. No PR was opened and nothing was pushed. Seat cost **$7.51**.
`npm run check` green (236 tests).

## Done when

- [x] **Each stop rule is shown in the logs.** `logs/part-09-fix-issues.jsonl` (`"stop_rule"`): green, lines
  1, 3, 4, 8, 10, 12, 14, 16; **max-attempts** (issue) line 27, **max-iterations** (run) lines 2, 19, 21,
  23; **no-diff** lines 7, 11, 13; **repeated-failure** line 25 (same fingerprint as line 24);
  **turn-limit** line 18; **budget** line 17 (`run_cost_usd 0.1687`, `threshold 0.01`); **toggle-off**
  line 6 (`toggle_read`); **queue-empty** lines 5, 15, 26, 28; **protected-path** line 20; **worker-error**
  line 22. Each line carries the values compared. Real workers vs stand-ins: step 11. Every rule is also
  tested with fakes in `test/fix-issues-controller.test.ts` (one test per rule).
- [x] **Escalation summaries say what was tried, the evidence and the decision needed.**
  `issues/escalations/ISSUE-004.md` (real decision issue: the worker's reason, `git status --porcelain`
  empty, "does a person first have to decide the expected behaviour?"), `-007.md`, `-009.md` (real),
  `-006.md` (turn-limit), `-002.md`, `-003.md`, `-005.md`, `-008.md` (forced). Each has the three fixed
  sections. Test: "repeated failure: … the retry got the verifier's evidence" checks all three headings
  and the quoted `npm run test → exit 1`.
- [x] **The rollback drill returns the repo to green tests.** `logs/part-09-rollout.jsonl`: `drill-check`
  before (all 0), bad commit `42f4252`, `drill-check` after (`test: 1`), `drill-toggle-off`, `drill-revert`
  → `ec20afa`, `drill-check` after the revert (all 0). Repeatable with `npm run fix-issues:drill`; by hand
  in README section 15.
- [x] **A table of resolved %, turns, estimated cost and time (one-shot vs loop) is in place.**
  `evals/loop-vs-one-shot.md`, written by `npm run loop-compare`, with the reading added by hand. It is
  left uncommitted for the owner to review and commit with the rest.
- [x] **No pull request is opened without human approval.** The loop has no push/merge/PR path: test "no
  code path opens a PR, pushes or merges" greps every loop module. The only merge is
  `npm run fix-issues:approve`, the human step: `logs/part-09-rollout.jsonl` line 1
  (`event: "human-approval"`), merge commit `5d382be`, local only. No PR anywhere; `git push` was never run.

## Seat cost

| What | Calls | Cost (`total_cost_usd`, an estimate on a Team seat) |
|---|---|---|
| Rollout (ISSUE-001…003) | 3 | $0.75 |
| Full run (ISSUE-004…010) | 8 | $1.70 |
| Forced runs with real workers (green-on-last-turn + budget, turn-limit) | 2 | $0.27 |
| Forced runs with stand-ins (protected, crash, failing ×3) | 0 | $0.00 (the crash counts $1.00 in the loop's own budget, by design) |
| `loop-compare`: one-shot arm | 10 | $2.32 |
| `loop-compare`: loop arm | 11 | $2.47 |
| **Total seat spend** | **34** | **$7.51** |

The first, sandboxed run and the cut-off ISSUE-010 attempt made no Claude call. `--checks-only` runs and
the drill call no Claude. The reviewer subagent ran inside this session, not as a lab script.

## For the activity Doc

**Hints**

- Build the controller with every effect injected first, and test each stop rule with fakes before
  spending a cent. The real runs then only confirm.
- Write the issues as a teammate would: symptom, repro, expected behaviour. Confirm each defect on today's
  code. The design doc's own example ("NaN on an empty set") turned out not to be real here.
- Give the worker a clean way to give up ("change nothing and say why"). Here it turned every built-to-
  escalate issue into a cheap, well-explained `no-diff` instead of a costly wrong fix.
- Prove each hidden check fails on the base commit and passes with a reference fix (`--checks-only`,
  `--patches`) before the comparison, then throw the reference fixes away.

**Where people get stuck**

- **The sandbox.** A piped or `cd … &&` command is not the excluded command, so `npm run fix-issues | tee`
  runs sandboxed: `.git/config` is read-only (sparse checkout, `git branch -m` fail) and `claude` has no
  network. Run the bare command, or from your own terminal.
- **`git status` is never empty** in a worktree with a `node_modules` link (`.gitignore`'s `node_modules/`
  doesn't match a link). Exclude it with `':!node_modules'`, or rule 3 (no diff) never fires.
- **`check:secrets` scans the index,** so a verifier that doesn't stage the worker's change can't see a
  leaked key in a new file. Stage in the worktree's own index first.
- **Expect the rule you designed for not to fire.** Real workers declined the protected and too-big issues
  instead of touching protected paths or running out of turns. Plan stand-ins or lowered flags (lower only)
  to show each rule.
- **Reopening an issue** must not throw away its earlier green branch: the loop keeps it as
  `fix/<ID>-prev-*`.

**Token revocation (lesson 9.3, the optional GitHub Actions route)**

What the docs say (code.claude.com, read 2026-11-05):

- `https://code.claude.com/docs/en/github-actions`, section **Uninstall**: delete the workflow files that
  use `anthropics/claude-code-action`; delete the `CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY`)
  secret from the repository, and from organization-level Actions secrets; uninstall the Claude GitHub App
  in the repository or organization settings under GitHub Apps (only if no other Claude feature uses it).
  The page warns: **"If you delete a secret, the credential it held stays valid."** For an API key it says
  to delete the key in the Claude Console (`https://platform.claude.com`).
- `https://code.claude.com/docs/en/authentication`, section **Generate a long-lived token**:
  `claude setup-token` makes a **one-year** OAuth token and doesn't save it anywhere. The page doesn't say
  how to revoke that token.

**Not confirmed:** I could not find an official revoke step for a `claude setup-token` /
`/install-github-app` OAuth token. code.claude.com doesn't describe one, and this session can't open
claude.ai settings (WebFetch is limited to code.claude.com). The owner should check claude.ai's settings
(account or Claude Code section) for a list of authorized tokens and write the exact steps into the Doc.
Until then, tell learners: delete the GitHub secret **and** treat the token as live for up to a year.

## For the owner

- **Add `ask` rules** next to the uncommitted `sandbox.excludedCommands` entries, like the other paid
  scripts (threat G10): `"Bash(npm run fix-issues*)"` and `"Bash(npm run loop-compare*)"` in
  `permissions.ask` of `.claude/settings.json`. Note that `fix-issues*` also matches `fix-issues:approve`
  and `fix-issues:drill`, which merge and revert: an `ask` rule is the right gate for those too.
- **Commits on `part-10-start` made by the scripts** (45 since `e59aa90`): the loop's `chore(loop): …`
  state commits, the approved merge `5d382be` (ISSUE-001), and the drill's bad commit `42f4252`, toggle-off
  commit and revert `ec20afa`. The reference work (code, tests, docs, this log, the comparison table) is
  uncommitted for your review.
- **Branches:** `fix/ISSUE-002…010` hold the green fixes or the empty branches of escalated issues.
  `fix/ISSUE-00{2,3,5,6,8}-prev-*` and `fix/ISSUE-010-prev-*` keep the first green fixes of the issues I
  reopened for step 11 (those issues now show `needs-human` from the forced runs; ISSUE-010 is
  `ready-for-review` again). Delete what you don't want; nothing was pushed.
- **ISSUE-001's approver label** reads "Rene (course owner; dry-run reviewer acting as the human
  approver)". It was the dry-run agent acting as the person, not you.
- `issues/auto-fix.json` is `{ "enabled": true }` in the working tree; the drill's committed value is
  `false`. Pick one before committing.
- Untracked dotfiles in the repo root (`.bashrc`, `.profile`, `.gitconfig`, `.idea`, `.vscode`, …) and
  `.claude/commands`, `.claude/skills` etc. were there before this session; I didn't touch them.

## Owner follow-up (2026-11-09)

- Done-when re-checked by the owner: 11 `stop_rule` values in the log, 8 escalation summaries with the three
  sections, the drill's before/bad/revert checks, no PR on the repo, nothing pushed before this commit.
  `npm run check`: 33 files, 236 tests green.
- `ask` rules added: `Bash(npm run fix-issues*)`, `Bash(npm run loop-compare*)`.
- `issues/auto-fix.json` committed as `{ "enabled": false }` (the drill's kill-switch state).
- ISSUE-001's approval label left as written: it is the honest record of the dry run.
- `fix/*` branches stay local. Learners' seeded issues go onto `part-09-start` in 2.13.
