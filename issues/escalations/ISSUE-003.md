# ISSUE-003 needs a human

**A handbook page title that starts with "[" loses its bracket**

- Stop rule: worker-error
- Branch: fix/ISSUE-003 (no commit from the loop, nothing merged, no PR)

## What was tried

1. Attempt 1 (? turns, cost unknown): changed nothing; outcome: worker-error

## Evidence

- `git status --porcelain` in the worktree → empty: nothing changed, so `npm run check` was not run
- `git diff --stat` of the last attempt → no change
- exit_code: `1`
- subtype: `no result`
- is_error: `null`
- stderr_tail: `claude stand-in: simulated crash before any result event (npm run fix-issues --worker-stand-in crash)
`
- cost_missing: `true`

## Decision needed

The worker process failed (exit 1, no result). Is `claude` working on this machine (sign-in, network, seat limits)? Reopen the issue (status: open) once it is.
