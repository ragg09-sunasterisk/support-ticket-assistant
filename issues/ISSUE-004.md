---
id: ISSUE-004
status: open
auto-fix: false
---
# Retrieval check reports recall 0.000 and passes on a set with no answerable questions

Reported by: Mara (evals), with a note from Jun

If the set file is empty, or every question in it is unanswerable, `npm run retrieval-check` prints
scores as if it had measured something and exits 0:

## How to reproduce

```bash
: > /tmp/empty-set.jsonl
npm run retrieval-check -- --set /tmp/empty-set.jsonl
```

```
Role: security, k = 5, 0 answerable questions
recall@5:    0.000  (share of the expected chunks found, averaged)
precision@5: 0.000  (expected chunks found / 5; best possible 0.000)
…
```

## What should happen

We don't agree yet. Mara thinks the check should **fail** (non-zero exit) because a set with no answerable
questions is always a mistake. Jun uses the script on small partial sets while writing new questions and
wants it to **keep exiting 0** but print `n/a` instead of `0.000`. Both are better than a fake 0.000.
