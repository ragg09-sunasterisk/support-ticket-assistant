---
id: ISSUE-002
status: in-progress
auto-fix: true
---
# Golden run prints NaN% accuracy when the golden file is empty

Reported by: Paolo (evals)

I pointed `npm run golden` at a new golden file before I had filled it in. It didn't call Claude (good),
but the summary is nonsense and it exits 0, so my wrapper script thought the run passed.

## How to reproduce

```bash
: > /tmp/empty-golden.jsonl
npm run golden -- --golden /tmp/empty-golden.jsonl --log /tmp/golden-test.jsonl
```

## What happens

```
Passed Zod validation: 0/0
Category accuracy:     0/0 (NaN%)
Severity accuracy:     0/0 (NaN%)
Estimated total cost:  $0.000000
```

Exit code 0, and a "summary" line with `total: 0` is appended to the log.

## What I expected

An empty golden set is always a mistake (wrong path, file not filled in yet). The run should stop
before the summary with a clear message that the golden file has no cases, exit non-zero, and not write
a summary line to the log. No `NaN` anywhere. Runs with the real golden set are unchanged.
