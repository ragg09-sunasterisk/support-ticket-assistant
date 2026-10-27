# Part 1: five runs of one ticket

Raw log: [`part-01-runs.jsonl`](part-01-runs.jsonl) (one JSON object per run: answer, tokens, cost).

- **Command:** `npm run ticket -- --ticket TCK-1001 --runs 5`
- **Ticket:** TCK-1001, "Charged twice for my October subscription" (Lola's Kakanin, Growth plan)
- **Model:** claude-opus-5-5 via `claude -p --output-format json` on a Team seat, Claude Code 2.1.311
- **Date:** 2026-10-27

## Tokens and estimated cost

| Run | Input | Output | Cache write | Cache read | Est. cost (USD) | Time |
|---|---|---|---|---|---|---|
| 1 | 2 | 203 | 846 | 0 | 0.010836 | 3.2 s |
| 2 | 2 | 246 | 0 | 846 | 0.005097 | 4.4 s |
| 3 | 2 | 199 | 0 | 846 | 0.004157 | 3.3 s |
| 4 | 2 | 232 | 0 | 846 | 0.004817 | 3.7 s |
| 5 | 2 | 225 | 0 | 846 | 0.004677 | 3.8 s |
| **Total** | | **1,105** | | | **0.029585** | |

"Est. cost" is Claude Code's `total_cost_usd` at list price. The seat is not billed per call.

## How the outputs differed

**Stable across all 5 runs**
- The four-line format (Category / Priority / Summary / Suggested reply) every time.
- `Category: billing` and `Priority: high` every time.
- Every reply says sorry, promises to check billing records, and promises a refund to the original
  payment method if the charge is a duplicate.

**Varied run to run**
- Wording of the summary and reply. No two runs matched.
- Output length: 199 to 246 tokens. Output tokens drive almost all of the cost difference
  between runs 2 to 5.
- Asking for a bank-statement screenshot: runs 2, 4 and 5 did, runs 1 and 3 did not.
- Greeting: "Hi," / "Hi!" / "Hi Lola,". The requester is Maria Santos. "Lola" was guessed from
  the shop name because the prompt doesn't include the requester's name.
- Run 3 alone gave a refund timeline ("5–10 business days").

**Checked against the handbook** (`data/handbook/16-billing-plans-and-invoices.md`)
- The handbook rates duplicate charges **medium**. All 5 runs said **high**: consistent, and
  consistently wrong. Consistency doesn't mean correctness.
- The handbook timeline is **5 to 14 banking days**. Run 3's "5–10" was invented.
- The handbook says to first rule out a pending authorization next to the final charge. No run
  asked.

## Cost observations

- Run 1 paid to write the 846-token prompt prefix to the cache. Runs 2 to 5 read it back, which
  cut the cost per run roughly in half.
- Context dominates cost. With Claude Code's defaults (user settings, rules, skills, MCP tools)
  a one-word test reply used about 57k context tokens (~$0.36). The script passes
  `--setting-sources "" --strict-mcp-config --disable-slash-commands --tools ""` and its own
  `--system-prompt`, which brings the same test down to ~565 tokens (~$0.005) and keeps the
  context the same on every machine.

## Takeaways for later parts

- The model has no Kariton policy knowledge yet. It fills gaps with plausible, wrong defaults
  (severity, refund timeline). The handbook needs to be in its context.
- Send the requester's name with the ticket, or tell the model not to address the customer by name.
- One run per ticket isn't enough to judge quality. Free-text parts vary, so evaluate on several runs.
