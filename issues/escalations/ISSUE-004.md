# ISSUE-004 needs a human

**Retrieval check reports recall 0.000 and passes on a set with no answerable questions**

- Stop rule: no-diff
- Branch: fix/ISSUE-004 (no commit from the loop, nothing merged, no PR)

## What was tried

1. Attempt 1 (2 turns, $0.11): changed nothing; outcome: no-diff

## Evidence

- `npm run check` was not run (no change, a protected path, or a worker error)
- `git diff --stat` of the last attempt → no change
- The worker's last message (model text, not evidence): "I haven't changed anything. The issue needs a decision it doesn't make, and the instructions for this attempt say to stop in that case. **What's wrong:** when a set has no answerable questions, `src/run-retrieval-check.ts` still prints recall@k and precision@k at line 40 and after, as if it had meas…"

## Decision needed

The worker changed nothing (its last message is quoted above). Is the issue fixable as written, or does a person first have to decide the expected behaviour or give more detail?
