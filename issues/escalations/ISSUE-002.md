# ISSUE-002 needs a human

**Golden run prints NaN% accuracy when the golden file is empty**

- Stop rule: protected-path
- Branch: fix/ISSUE-002 (no commit from the loop, nothing merged, no PR)

## What was tried

1. Attempt 1 (1 turns, $0.00): changed test/acceptance/handbook-search.acceptance.test.ts; outcome: protected-path

## Evidence

- `git status --porcelain` → test/acceptance/handbook-search.acceptance.test.ts; `npm run check` was not run (protected path or worker error)
- `git diff --stat` of the last attempt → 1 file changed, 1 insertion(+), 1 deletion(-)
- paths: `["test/acceptance/handbook-search.acceptance.test.ts"]`
- The worker's last message (model text, not evidence): "stand-in: edited test/acceptance/handbook-search.acceptance.test.ts"

## Decision needed

The change touched test/acceptance/handbook-search.acceptance.test.ts, which the loop may never change. Should a person make that change by hand, or should the issue be rewritten so the fix stays outside protected paths?
