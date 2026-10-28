# Failure notes: what more prompt text won't fix

From the Part 3 eval (`npm run eval`, see `evals/regression-table.md`). Each of these failed for both
triage-v1 and triage-v2 on the held-out set. Wording changes fixed the fuzzy-rule misses on the
golden set. These three need context the model doesn't have, or a decision from a person.

## 1. TCK-1028: "Refund stuck in processing" (escalation grader failed)

**What went wrong:** A card refund has shown "Refund processing" for 10 days. Both prompts returned
`orders_payments / medium` with `escalation_reason: null`. The model grader failed that: it read
"refund money missing" in the escalation table and wanted the Payments squad.

**Why prompt wording isn't the fix:** The answer is in a different handbook page.
`data/handbook/09-payments-payouts-and-refunds.md` says a card refund still processing after
**14 banking days** goes to the Payments squad. At 10 days, the triage's `null` is probably right
and the grader is wrong. The triage prompt and the grader rubric both have only the handbook 03
table, and neither knows the 14-day rule. You could paste that rule into both prompts. The handbook
has 20 pages of rules like it, though. That is retrieval: put the right handbook section in front of
the model (Part 4). This case is in `evals/human-labels.jsonl` so a person can check the grader.

## 2. TCK-1036: "orders not coming in" (category and severity wrong)

**What went wrong:** The whole ticket is "pls fix asap 🙏🙏 orders not coming in". Both prompts
returned `orders_payments / medium` at confidence 0.5. The key says `technical_bug / high`.

**Why prompt wording isn't the fix:** The ticket doesn't say whether checkout is broken, the
storefront is down, or the shop simply had no buyers. The low confidence shows the model knows it is
guessing. A rule like "orders not coming in = technical_bug/high" would only teach it the answer
key. What would decide it is context: the shop's recent orders and checkout errors, or an open
incident (handbook 04). Without those, the right move is the handbook's "ask one specific question".
That is a tool or data lookup, not wording.

## 3. TCK-1030: "Transfer shop ownership" (severity wrong, at confidence 0.9)

**What went wrong:** A merchant asks how to move the owner role from a partner who left. Both
prompts returned `account_access / low` at 0.9, a confident miss. The key says medium.

**Why prompt wording isn't the fix:** By the written rules, low is a fair answer. Handbook 02 says
how-to questions are low, and the ticket says the old owner is still reachable. The key rates it
medium because an ownership change hands over billing and payouts, and handbook 14 sends some
transfers to the Security team. Whether "who controls the shop" outranks "it's a how-to" is a
**policy decision** for the support lead. Once someone makes it, it belongs in handbook 02 and in
the prompt. Picking a side in the prompt now would be guessing the policy.
