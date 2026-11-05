# ISSUE-009 needs a human

**Add --dry-run to every lab script that calls Claude**

- Stop rule: no-diff
- Branch: fix/ISSUE-009 (no commit from the loop, nothing merged, no PR)

## What was tried

1. Attempt 1 (4 turns, $0.19): changed nothing; outcome: no-diff

## Evidence

- `npm run check` was not run (no change, a protected path, or a worker error)
- `git diff --stat` of the last attempt → no change
- The worker's last message (model text, not evidence): "I made no changes. The issue leaves a design question open that I'd have to guess at, and your instructions say to stop and explain in that case. **The open question: some scripts can't know their `claude` calls in advance.** The issue says a dry run "prints every `claude` command line it would run …"

## Decision needed

The worker changed nothing (its last message is quoted above). Is the issue fixable as written, or does a person first have to decide the expected behaviour or give more detail?
