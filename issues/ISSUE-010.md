---
id: ISSUE-010
status: ready-for-review
auto-fix: true
---
# Retrieval check counts an answerable question without expected chunks two different ways

Reported by: Jun (evals)

I added a question as `answerable: true` but hadn't filled in `expected_chunk_ids` yet. The report then
disagrees with itself: the first line leaves the question out, the hit line counts it as a miss.

## How to reproduce

```bash
cat > /tmp/half-set.jsonl <<'EOF'
{"id": "RQ-01", "question": "How long does a card refund take?", "expected_chunk_ids": ["hb-09#refunds"], "answerable": true}
{"id": "RQ-02", "question": "Can staff export buyer emails?", "expected_chunk_ids": [], "answerable": true}
EOF
npm run retrieval-check -- --set /tmp/half-set.jsonl
```

```
Role: security, k = 5, 1 answerable questions
…
Answerable questions with an expected chunk in the top 5: 1/2
```

## What I expected

An answerable question with no expected chunks is a mistake in the set. Loading the set should fail with
the line number and the question id, the same way a malformed line does, so the report never shows two
different counts. Unanswerable questions keep `expected_chunk_ids: []` and still load. The real
`evals/retrieval.jsonl` still loads.
