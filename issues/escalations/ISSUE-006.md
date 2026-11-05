# ISSUE-006 needs a human

**triage, golden and eval run on an API key when ANTHROPIC_API_KEY is set**

- Stop rule: turn-limit
- Branch: fix/ISSUE-006 (no commit from the loop, nothing merged, no PR)

## What was tried

1. Attempt 1 (3 turns, $0.10): changed nothing; outcome: turn-limit

## Evidence

- `git status --porcelain` in the worktree → empty: nothing changed, so `npm run check` was not run
- `git diff --stat` of the last attempt → no change
- num_turns: `3`
- subtype: `error_max_turns`
- max_turns: `2`

## Decision needed

The worker hit the turn limit (3 of 2). Should the issue be split into smaller issues, or fixed by a person?
