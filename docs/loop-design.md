# Loop design: the issue-fixing loop (`npm run fix-issues`)

Design for the loop that Part 9 builds. Nothing here exists yet: no `issues/` folder, no controller code.
The headings are lesson 8.2's eight parts. Every stop rule has a condition a script can check without
asking a model.

## 1. Goal

Close small, well-described issues in this repo without a person writing the code, and **never** ship
a change a person hasn't approved.

- **Success for one issue:** a commit on its own branch `fix/<ISSUE-ID>` where `npm run check` exits 0
  and no protected path changed. Its status becomes `ready-for-review`. A person reviews, opens the pull
  request and merges. **The loop never opens a PR, merges or pushes.**
- **Success for one run:** every issue it picked up ends as `ready-for-review` or `needs-human` with an
  escalation summary. Nothing is left half-done without a record.
- **Out of scope:** issues without the `auto-fix: true` label, anything under `data/`,
  `test/acceptance/`, `.claude/`, `.mcp.json`, `.env*`, and adding dependencies.

## 2. Trigger

A person runs `npm run fix-issues` (no cron, no webhook). It works through local Markdown issues:

```markdown
---
id: ISSUE-003
status: open            # open | in-progress | ready-for-review | needs-human | closed
auto-fix: true          # the label; missing or false = people only
---
# Retrieval check prints NaN when the set is empty
...
```

An issue is **picked** when `auto-fix == true` and either `status == "open"`, or `status ==
"in-progress"` with `progress.attempts[id] < MAX_ATTEMPTS_PER_ISSUE` (a retry, or a run that was cut off
and resumed). Lowest `id` first. Part 9 seeds 10 issues.

**The toggle.** `issues/auto-fix.json` holds `{ "enabled": true }`. The controller reads it **before every
iteration**, not once per run. Missing file, bad JSON or `enabled !== true` means off: stop, touch
nothing, leave the remaining issues to people. Turning it off mid-run stops the run at the next
iteration.

**Rollout.** Start with `enabled: true` and the label on 2 or 3 easy issues. Widen the label only after
their branches were reviewed and merged. **Rollback:** each fix is one commit on its own branch, merged
by a person, so undoing it is `git revert <merge commit>`; set `enabled: false` first so the loop doesn't
pick the issue up again.

## 3. State

The loop must be able to stop at any point and resume from files, not from memory.

| File | Committed? | Holds |
|---|---|---|
| `issues/<ISSUE-ID>.md` | yes | the issue; the controller updates only its `status` |
| `issues/progress.json` | yes | `done`, `next`, `needs_human` (lists of IDs), plus per ID `attempts` and `last_fingerprint` (rule 4 survives a restart) |
| `issues/escalations/<ISSUE-ID>.md` | yes | the escalation summary (section 8) |
| `logs/part-09-fix-issues.jsonl` | yes | one line per iteration: issue, attempt, branch, turns, cost, check exit code, failure fingerprint, stop rule (if one fired) |
| git branches `fix/<ISSUE-ID>` | local only | the green change: one commit, made only when rule 1 fires |

After each iteration the controller writes `progress.json` and the issue's `status`, then commits them
(`chore(loop): ISSUE-003 -> ready-for-review`) on the branch the person ran it from. `git log` plus
`progress.json` is the full history; nothing lives only in the process.

## 4. Worker

One `claude -p` call works on **one issue per iteration**, in a **fresh** throwaway git worktree made
from the current `HEAD` on branch `fix/<ISSUE-ID>` (the Part 6 helpers in `src/throwaway-worktree.ts`).
Each attempt starts clean: a failed attempt's diff is thrown away with its worktree, and what carries over
is the verifier's evidence (below). That keeps rule 3 meaningful on every attempt. It never runs in the
person's checkout.

```bash
claude -p --output-format stream-json --verbose \
  --setting-sources project --strict-mcp-config --mcp-config .mcp.json \
  --permission-mode acceptEdits --max-turns 30 --max-budget-usd 1.00 \
  --model claude-opus-5-5          # cwd = the worktree; never --bare, never skip permissions
```

- **Prompt:** the issue text inside `<issue>` tags, marked as untrusted data, plus "fix it so that
  `npm run check` passes; don't change any test in `test/acceptance/`". On a retry it also gets the
  previous attempt's verifier output (failing tests and errors), not its transcript.
- **Limits:** the Part 7 project settings apply (deny rules, sandbox, hooks), so `test/acceptance/`,
  `data/`, `.claude/` and `.env*` are blocked by rules and the sandbox, not by the prompt.
  `--max-turns 30` is the per-iteration turn limit.
- **Started through** `src/run-claude-process.ts` with a `ClaudeRunner` parameter, so tests pass a fake.

## 5. Verifier

Code, not a model, decides whether an attempt worked. In the worktree, after the worker exits:

| Check | Command | Pass when |
|---|---|---|
| Something changed | `git status --porcelain` | output is not empty |
| No protected path touched | `git diff --name-only HEAD -- test/acceptance data .claude .mcp.json` plus `git status --porcelain` filtered to the same paths and `.env*` | output is empty |
| The tests | `npm run check`'s four steps run one by one: `npm run typecheck`, `npm run lint`, `npm test` (incl. `test/acceptance/`), `npm run check:secrets` | every exit code 0 |
| Handbook search unchanged in quality | `npm run retrieval-check` (only if the diff touches `src/handbook-*`) | exit code 0 |

Running the steps one by one tells the verifier which one failed first. It then builds the **failure
fingerprint**, `sha256(step + "\n" + detail)`, where `detail` is:

- `typecheck`, `lint`: the error lines (`file(line,col): error TS…` / ESLint rule lines) with every digit
  removed, sorted;
- `test`: the sorted `fullName`s of failed tests from `npx vitest run --reporter=json --outputFile=<tmp>`;
- `check:secrets`: the file paths it reports, sorted.

Rule 4 compares it with `progress.last_fingerprint[id]`; the controller then stores the new one.

## 6. Controller

`src/run-fix-issues.ts` (thin CLI) over a testable module. Plain code, no model:

```text
load progress.json
loop:
  read issues/auto-fix.json            -> off?           stop run (rule 7)
  run budget / iteration cap reached?                    stop run (rules 2, 6)
  pick next issue (open + auto-fix)    -> none?          stop run (rule 8, normal end)
  attempt = attempts[id] + 1; set status in-progress; commit state
  fresh worktree on fix/<id>; run worker -> log turns, cost (missing cost counts as $1.00)
  run verifier                         -> log exit codes, fingerprint
  apply the issue rules in this order (first match wins):
    worker error, protected path, 1 green, 5 turn limit, 3 no diff, 4 repeated failure, 2 max attempts
    green        -> commit on fix/<id>, status ready-for-review, done += id
    needs human  -> write escalation summary, status needs-human, needs_human += id
    otherwise    -> status stays in-progress; picked again next iteration with the verifier output
  write progress.json + issue status, commit, append the JSONL line
  remove the worktree (only a green attempt leaves a commit on the branch)
```

## 7. Stop rules

Constants in the controller module: `MAX_ATTEMPTS_PER_ISSUE = 3`, `MAX_ITERATIONS_PER_RUN = 10`,
`MAX_TURNS = 30`, `MAX_RUN_COST_USD = 5.00`. A flag may lower them, never raise them. Every firing writes
`"stop_rule": "<name>"` and the values it compared into `logs/part-09-fix-issues.jsonl`.

| # | Rule | Scope | Machine-checkable condition (read → compare → threshold) | Then | Logged when it fires |
|---|---|---|---|---|---|
| 1 | **Green tests** | issue | exit codes of `typecheck`, `lint`, `test`, `check:secrets` all `== 0` **and** protected-path diff output `== ""` | commit, `ready-for-review` (success) | `stop_rule: "green"`, the four exit codes, commit SHA, branch |
| 2 | **N iterations** | issue / run | `progress.attempts[id] >= MAX_ATTEMPTS_PER_ISSUE` (3); run: `iterations_this_run >= MAX_ITERATIONS_PER_RUN` (10) | issue: escalate; run: stop | `stop_rule: "max-attempts"` with `attempts`, or `"max-iterations"` with `iterations` |
| 3 | **No diff** | issue | `git status --porcelain` in the worktree prints `""` after the worker exits | escalate (the worker saw nothing to do or gave up) | `stop_rule: "no-diff"`, worker's last message (first 500 chars) |
| 4 | **Repeated failure** | issue | this attempt failed a step and its fingerprint `== progress.last_fingerprint[id]` (the previous attempt's) | escalate | `stop_rule: "repeated-failure"`, the fingerprint, the failing step and test names |
| 5 | **Turn limit** | issue | worker `result` event `subtype == "error_max_turns"` (the CLI stopped it at `--max-turns 30`). Checked after rule 1, so a change that went green on its last turn still ships | escalate (don't retry a run that couldn't finish) | `stop_rule: "turn-limit"`, `num_turns`, `subtype` |
| 6 | **Budget** | run (and issue) | `sum(total_cost_usd)` of this run's worker `result` events `>= MAX_RUN_COST_USD` ($5), checked before each iteration; per call `--max-budget-usd 1.00` (`subtype == "error_max_budget_usd"` → escalate the issue) | stop run | `stop_rule: "budget"`, `run_cost_usd`, threshold |
| 7 | **Toggle off** | run | `JSON.parse(issues/auto-fix.json).enabled !== true` (or the file is missing / not JSON), read before every iteration | stop run, change nothing | `stop_rule: "toggle-off"`, what was read |
| 8 | **Queue empty** | run | no issue matches the pick condition in section 2 | stop run (normal end) | `stop_rule: "queue-empty"` |
| – | Protected path touched | issue | protected-path diff output `!= ""` | escalate at once, never retry | `stop_rule: "protected-path"`, the paths |
| – | Worker error | issue | the worker exits non-zero, or its stream has no `result` event, or `is_error == true` with a `subtype` other than `error_max_turns` / `error_max_budget_usd` | escalate; add $1.00 to the run cost if `total_cost_usd` is missing | `stop_rule: "worker-error"`, exit code, `subtype`, last 500 chars of stderr |

Rule 4 needs two failures, so with `MAX_ATTEMPTS_PER_ISSUE = 3` an issue gets at most 3 workers. The
budget rule is added because the other rules bound *turns* and *attempts*, not money: 10 iterations of
30 turns can still cost more than a person expects. On a Team seat the dollar figure is an estimate; it is
still the best signal a script can read.

## 8. Escalation

Every issue stop that is not rule 1 (and a run stop that leaves an issue `in-progress`) writes
`issues/escalations/<ISSUE-ID>.md`, sets the issue to `needs-human` and adds it to
`progress.json.needs_human`:

```markdown
# ISSUE-003 needs a human
- Stop rule: repeated-failure (attempts 2 and 3 had fingerprint 3f9a…)
- Branch: fix/ISSUE-003 (kept, not merged, no PR)

## What was tried
1. Attempt 1 (14 turns, $0.21): changed src/retrieval-metrics.ts (guard for k = 0)
2. Attempt 2 (11 turns, $0.18): …

## Evidence
- `npm run check` → exit 1; failing: test/retrieval-metrics.test.ts > precision@k > empty set
- `git diff --stat main...fix/ISSUE-003` → 1 file, +6 −2

## Decision needed
Is NaN or 0 the right precision for an empty set? The issue doesn't say, and the test expects 0.
```

The three parts are fixed: **what was tried** (per attempt: turns, cost, files changed), **the evidence**
(the exact commands and their results, quoted from the verifier, not from the model's summary), and
**the decision needed from a person** (one question). No pull request is ever opened by the loop, on
success or on escalation: a person reads the branch and decides.

## Appendix: the Part 8 reply loop's stop rules

The evaluator-optimizer built in Part 8 (`npm run reply-loop`, `src/reply-loop-controller.ts`) is a much
smaller loop, but its stops follow the same rule: code checks a field, never a model's opinion of itself.

| Rule | Condition (field → comparison → threshold) | `escalate` | Logged on the last line of `logs/part-08-reply-loop.jsonl` |
|---|---|---|---|
| Pass | evaluator `evaluation == "PASS"`, consistent (no feedback, `word_count < 120`) | no | `stop_reason: "pass"` |
| Fail | evaluator `evaluation == "FAIL"`, on any round | yes | `stop_reason: "fail"`, `reason` |
| Cap | `round == max_rounds`; `MAX_ROUNDS = 4`, `--max-rounds` may only lower it | yes | `stop_reason: "cap"`, `max_rounds` |
| Error | generator or evaluator result `ok == false` (process failed, no `structured_output`, Zod rejects it), or `evaluationProblem()` returns a reason | yes | `stop_reason: "error"`, `error` |
