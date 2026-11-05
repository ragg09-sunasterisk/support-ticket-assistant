# ISSUE-007 needs a human

**The retrieval set needs more unanswerable questions**

- Stop rule: no-diff
- Branch: fix/ISSUE-007 (no commit from the loop, nothing merged, no PR)

## What was tried

1. Attempt 1 (4 turns, $0.16): changed nothing; outcome: no-diff

## Evidence

- `npm run check` was not run (no change, a protected path, or a worker error)
- `git diff --stat` of the last attempt → no change
- The worker's last message (model text, not evidence): "I made no changes. The fix the issue asks for can't pass `npm run check` without editing `test/acceptance/`, which I'm not allowed to touch. **The conflict:** `test/acceptance/handbook-search.acceptance.test.ts:43-47` requires the retrieval set to have exactly 30 questions, 27 of them answerable: ``…"

## Decision needed

The worker changed nothing (its last message is quoted above). Is the issue fixable as written, or does a person first have to decide the expected behaviour or give more detail?
