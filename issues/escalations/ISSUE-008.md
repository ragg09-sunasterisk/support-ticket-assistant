# ISSUE-008 needs a human

**A heading without Latin letters gets an empty chunk ID**

- Stop rule: max-attempts
- Branch: fix/ISSUE-008 (no commit from the loop, nothing merged, no PR)

## What was tried

1. Attempt 1 (1 turns, $0.00): changed src/retrieval-metrics.ts; outcome: max-attempts

## Evidence

- `npm run typecheck` → exit 0
- `npm run lint` → exit 0
- `npm run test` → exit 1
- `npm run check:secrets` → exit 0
- Failing (test): `retrievalMetrics averages per-question recall and precision over answerable questions only`
- `git diff --stat` of the last attempt → 1 file changed, 1 insertion(+), 1 deletion(-)
- attempts: `1`
- max_attempts: `1`
- The worker's last message (model text, not evidence): "stand-in: changed src/retrieval-metrics.ts"

## Decision needed

1 attempts failed with different errors (last: `test`). Should a person take it over, or is the issue missing information?
