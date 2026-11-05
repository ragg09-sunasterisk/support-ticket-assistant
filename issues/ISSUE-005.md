---
id: ISSUE-005
status: in-progress
auto-fix: true
---
# Duplicate question IDs in a retrieval set are accepted without a word

Reported by: Jun (evals)

I copied a line to start a new question and forgot to change its `id`. Both lines were loaded and both
were scored, so the duplicated question counted twice in recall@5 and nobody noticed for a day.

## How to reproduce

```bash
cat > /tmp/dup-set.jsonl <<'EOF'
{"id": "RQ-01", "question": "How long does a card refund take?", "expected_chunk_ids": ["hb-09#refunds"], "answerable": true}
{"id": "RQ-01", "question": "Can a buyer change the delivery address?", "expected_chunk_ids": ["hb-08#discount-codes"], "answerable": true}
EOF
npm run retrieval-check -- --set /tmp/dup-set.jsonl
```

It prints "2 answerable questions" and scores both.

## What I expected

Loading a set with a repeated `id` fails, the same way a malformed line does: the error names the
repeated id and the line it appears on again. The real `evals/retrieval.jsonl` still loads.
