---
id: ISSUE-006
status: in-progress
auto-fix: true
---
# triage, golden and eval run on an API key when ANTHROPIC_API_KEY is set

Reported by: Rene (course owner)

The course is seat-only. `npm run ticket`, `ask`, `answer-check`, `reply-loop` and the other lab scripts
refuse to start when `ANTHROPIC_API_KEY` is set in the shell, so nobody bills a key by accident. Three
scripts that call Claude don't check it: `npm run triage`, `npm run golden` and `npm run eval`. With the
variable set, they go ahead and call `claude -p`, which then uses the key instead of the seat.

## How to reproduce

In a shell where `ANTHROPIC_API_KEY` is exported (any value), run `npm run triage -- --ticket TCK-1003`.
It calls Claude.

## What I expected

All three refuse before calling Claude, with the same message and exit code as the other paid scripts.
Without the variable they work as before.
