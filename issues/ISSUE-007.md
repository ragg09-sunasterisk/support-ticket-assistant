---
id: ISSUE-007
status: in-progress
auto-fix: true
---
# The retrieval set needs more unanswerable questions

Reported by: Mara (evals)

`evals/retrieval.jsonl` has only three unanswerable questions (RQ-28 to RQ-30). That's too few to tell
whether `npm run answer-check` really abstains or got lucky: one miss is a third of the bucket.

## What I'd like

Add at least two more unanswerable questions (things the handbook doesn't cover, for example tax advice
for a merchant or a competitor's pricing), with `expected_chunk_ids: []` and `answerable: false`, as
RQ-31 and up. Keep the existing 30 questions as they are.

## Done when

The set has at least 5 unanswerable questions and `npm run check` passes.
