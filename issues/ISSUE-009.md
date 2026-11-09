---
id: ISSUE-009
status: open
auto-fix: false
---
# Add --dry-run to every lab script that calls Claude

Reported by: Rene (course owner)

Learners want to see what a lab script would send to Claude before it spends seat money.
`npm run security-compare -- --dry-run` already has a dry run; none of the others do.

## What I'd like

Every script that calls Claude gets `--dry-run`: `ticket`, `triage`, `golden`, `eval`, `ask`,
`answer-check`, `injection-test`, `hook-proof`, `guide-compare`, `rule-tests`, `reviewer-proof` and
`reply-loop`. With `--dry-run` a script:

- prints every `claude` command line it would run (`claude -p …`, long prompts shortened), one per call,
- never starts `claude`, never appends to a log, never creates a worktree, and exits 0,
- still checks its other arguments as it does today.

Each script gets a test for its dry run (no Claude calls), and the README's Scripts table mentions the
flag.
