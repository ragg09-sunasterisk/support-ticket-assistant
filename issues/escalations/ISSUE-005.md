# ISSUE-005 needs a human

**Duplicate question IDs in a retrieval set are accepted without a word**

- Stop rule: repeated-failure (fingerprint 90e8ad0de287…)
- Branch: fix/ISSUE-005 (no commit from the loop, nothing merged, no PR)

## What was tried

1. Attempt 1 (1 turns, $0.00): changed src/retrieval-metrics.ts; outcome: retry (test failed)
2. Attempt 2 (1 turns, $0.00): changed src/retrieval-metrics.ts; outcome: repeated-failure

## Evidence

- `npm run typecheck` → exit 0
- `npm run lint` → exit 0
- `npm run test` → exit 1
- `npm run check:secrets` → exit 0
- Failing (test): `retrievalMetrics averages per-question recall and precision over answerable questions only`
- `git diff --stat` of the last attempt → 1 file changed, 1 insertion(+), 1 deletion(-)
- fingerprint: `90e8ad0de2873b9520222dc8f527b0610f16ac474efb9ddb083ee9ad4e04f9c8`
- failing_step: `test`
- The worker's last message (model text, not evidence): "stand-in: changed src/retrieval-metrics.ts"

## Decision needed

Two attempts in a row failed `npm run test` the same way. Is the expected behaviour in the issue right (and the failing test wrong), or should a person fix it?
