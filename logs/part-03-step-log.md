# Part 3 step log: evaluate triage v2 with promptfoo and a regression table

- **Date:** 2026-10-28
- **Branch:** `part-04-start` working tree (nothing committed)
- **Claude Code:** 2.1.312 on a Team seat, model claude-opus-5-5. promptfoo 0.125.1. Node 26.7.0.
- **Result:** v2 beats or ties v1 on every held-out metric. Held-out severity is 7/10 for v2 and 6/10
  for v1. Category is 9/10 and escalation 9/10 for both. Golden set: v2 29/30 category and 29/30
  severity. v1 had 27/30 and 23/30.

## Steps

### 1. Read Part 2 and list what to fix

**What:** Read `README.md`, the Part 2 code, `logs/part-02-step-log.md` and the v1 golden log. The
v1 misses fall into three groups:

- Should-abstain tickets got the wrong category: TCK-1008 (VAT), TCK-1025 (legal).
- Severity rules were too fuzzy: "unclear → medium" (TCK-1003, TCK-1015), a buyer's personal data
  rated low (TCK-1021, TCK-1034), and impact not rated as it is now (TCK-1009, TCK-1023).
- Confidence was high on wrong answers: TCK-1021 at 0.92, TCK-1034 at 0.9.

### 2. Move the v1 prompt to `prompts/triage.v1.md`, unchanged

**What:** Wrote the old `TRIAGE_SYSTEM_PROMPT` constant to the file with a script, not by
copy-paste. `src/triage-prompt.ts` now has `loadTriagePrompt(version)`. It reads
`prompts/triage.<version>.md`, trims the final newline and returns `{ version: "triage-v1", text }`.
The default version is `v2`. Only `v1`, `v2`, … are accepted, so a version can't point outside
`prompts/`.

**Check:** I compared the loaded v1 text with the constant in `git show HEAD:src/triage-prompt.ts`.
Result: `identical: true length: 3565`. A unit test pins the length.

**Where you can get stuck:** A text editor or `cat > file` adds a final newline. If you don't trim
it, "unchanged" becomes one character longer.

### 3. Let the client take a prompt; add `--prompt` to the scripts

**What:** `triageTicket(ticket, { systemPrompt?, run? })` replaces `triageTicket(ticket, run)`.
`--prompt v1` works on both scripts:

```bash
npm run triage -- --ticket TCK-1003 --prompt v1
npm run golden -- --prompt v2 --log logs/part-03-golden-runs.jsonl
```

I moved the `claude -p --json-schema` flags and output parsing into
`src/claude-structured-output.ts`, because the eval judge needs them too.

**Snag:** `npm run golden` used to append to `logs/part-02-golden-run.jsonl`, which is the Part 2
record. Its default is now `logs/golden-runs.jsonl`.

### 4. Create the held-out set

**What:** `evals/held-out.jsonl`, the 10 cases from the brief, in the golden format. A unit test
checks the exact 10 lines and that no id is also in the golden set. `npm run eval` refuses to run
if the two sets overlap.

**Rule I kept:** I tuned v2 on golden runs only. I never ran v2 alone on a held-out ticket. The
held-out set was triaged for the first time in the full eval (step 9).

### 5. Write v2, one idea per golden run

Each change was its own `npm run golden -- --prompt v2 --log logs/part-03-golden-runs.jsonl` run.
That is about 3 minutes and $0.31 per run, because each new prompt writes the cache again. Every run
was 30/30 valid.

| # | Change in `prompts/triage.v2.md` | Targets | Golden category / severity | runId |
|---|---|---|---|---|
| v1 | (Part 2 baseline) | | 27 / 23 | 7abaf8e3… |
| 1 | Should-abstain questions get a category by what is asked: tax, VAT or future pricing → billing; someone's personal data → data_privacy; legal disputes and other platforms → other | TCK-1008, TCK-1025 | 29 / 24 | 33fba4da… |
| 2 | Medium needs a stated failure or affected buyers. "Please check" or "seems off" → low | TCK-1003, TCK-1015 | 29 / 25 | 3792fb86… |
| 3 | A request touching a buyer's personal data is at least medium (Data Privacy Act duty) | TCK-1021, TCK-1034 | 29 / 27 | f2efb89f… |
| 4 | Rate impact as it is now: contained and sales continue → medium; the store keeps selling what it should not → high | TCK-1009, TCK-1023 | 29 / 29 | 7f16781f… |
| 5 | Confidence = chance both labels are right: 0.9+ only when one rule decides it; 0.6–0.8 for a choice between two or an out-of-scope question; below 0.6 when vague | high confidence on wrong answers | 29 / 29, no miss at ≥ 0.9 | 45cd6109… |

**Notes:**

- Change 1 covers all five "support does not answer" items from handbook 03, future pricing
  included. Held-out TCK-1039 is a future-pricing ticket. The mapping came from the handbook list,
  not from that ticket, but say so when you present the result.
- Runs are noisy. TCK-1023 was right after change 1, wrong after change 2, and right again after
  change 4. TCK-1024 swung between `other` and `orders_payments`. Read one-case moves with care.
- Left as known golden misses: TCK-1022 (low vs medium; the refund behind a policy question) and
  TCK-1024 ("Payment failed" with no context). Fixing them would mean writing the answer key
  into the prompt.

### 6. Install promptfoo

```bash
npm install --save-dev --save-exact promptfoo@0.125.1
```

**What happened:** `"promptfoo": "0.125.1"` in devDependencies. npm printed "7 high severity
vulnerabilities" from promptfoo's large dependency tree, plus an `esbuild` install-script warning.
It is a dev-only tool that runs on your machine, so I left both alone.

### 7. Write the TypeScript provider and the graders

**Design choice:** I didn't write a `promptfooconfig.yaml`. `src/triage-eval.ts` calls promptfoo's
Node API `evaluate()` with real objects. That gave one command and typed results to build the table
from, with no extra `promptfoo` CLI step.

- **Prompts:** both prompt files, labelled `triage-v1` and `triage-v2`. promptfoo hands the prompt
  text to the provider.
- **Provider** (`src/claude-eval-providers.ts`, `ClaudeTriageProvider`): reads the ticket from the
  test's `ticket_id` and calls the existing `triageTicket` with that prompt as the system prompt. A
  failed triage comes back as the output `NO VALID TRIAGE: <reason>`, not an error. That way the
  graders still run and count it as a miss.
- **Code graders** (`src/triage-graders.ts`): `schema_valid` parses the output and runs
  `TicketTriage.safeParse`. `category_correct` and `severity_correct` compare with the key.
- **Model grader:** promptfoo's `llm-rubric` on `escalation_reason`. Its `provider` is
  `ClaudeJudgeProvider`, my second provider. It splits promptfoo's grading messages into
  `--system-prompt` and stdin, and calls `claude -p --json-schema` to force `{reason, pass, score}`.
  The rubric (`src/escalation-rubric.ts`) reads the "Escalation paths" section from handbook 03 when
  it runs. The triage's own severity decides the "critical" row, so the grader doesn't grade severity
  twice.

promptfoo's grader ran on the seat as it is, so I didn't need the fallback TypeScript judge.

**Where you can get stuck:**

- promptfoo reads `PROMPTFOO_DISABLE_TELEMETRY` when it loads. `src/run-eval.ts` sets it (plus
  `PROMPTFOO_DISABLE_UPDATE` and `PROMPTFOO_DISABLE_SHARING`) and only then does
  `await import("./triage-eval.ts")`. A normal `import` at the top runs before your
  `process.env` line.
- Without a grading provider, promptfoo looks for a default grader, which needs a vendor key. Pass
  your provider object on the assertion: `{ type: "llm-rubric", value, provider: judge }`.
- **Telemetry is not fully silent.** With `PROMPTFOO_DISABLE_TELEMETRY=1`, promptfoo 0.125.1 still
  sends one "telemetry disabled" event per run to its own endpoint. That event carries promptfoo's
  local user id, package version and Node/OS info, not tickets or results. No env var stops it. I
  found it in the code review (`node_modules/promptfoo/dist/src/telemetry-*.js`,
  `recordTelemetryDisabled`). The unit test that runs `evaluate()` sends it too. Blocking it would
  take a firewall rule or patching promptfoo. That is a course-owner decision, so I left it.
- promptfoo renders assertion values as Nunjucks templates. Ticket text inside the rubric is wrapped
  in `{% raw %}…{% endraw %}`, so a ticket containing `{{` or `{%` reaches the judge unchanged. A
  unit test checks this.
- `writeLatestResults: false` keeps results out of promptfoo's local database. promptfoo only
  shares when this is true and `sharing` is set, so nothing can be shared. No `promptfoo auth
  login`, no `promptfoo share`.

### 8. Unit tests without Claude

```bash
npm test
```

**What:** 62 tests, all with fake `claude` processes. `test/triage-eval.test.ts` runs the real
promptfoo `evaluate()` end to end with fake runners. It shows the `llm-rubric` → judge provider path
works before you spend anything on a live run. The other tests cover the graders, the rubric text,
both providers, the table, agreement counting, the prompt loader and the held-out file.

### 9. Run the eval (1 full run of the 3 allowed)

```bash
npm run eval
```

**What happened:** 80 test cases, 4 at a time, about 160 `claude -p` calls. It took 4.1 minutes and
exited 0. It wrote `evals/regression-table.md` and `evals/eval-results.jsonl`. The table is below.
v2 was already at least as good as v1 on held-out, so I didn't need a second run.

**Snag:** promptfoo returns rows in the order they finish, so the held-out list came out unsorted.
I added a sort by ticket id to `src/regression-table.ts` and moved the one row in the written table
by hand. I didn't re-run Claude for it.

### 10. Human-label file and grader check

```bash
npm run human-labels -- --ids TCK-1002,TCK-1014,TCK-1016,TCK-1040,TCK-1028
npm run grader-check
```

**What:** `evals/human-labels.jsonl` has 5 v2 cases, each with ticket id, set, case type, prompt
version, triage output, model grader pass and reason, and `"human": null`:

- TCK-1002, TCK-1014, TCK-1016: the three non-null `escalation_reason` values (Payments squad and
  two on-call pages).
- TCK-1040: an injection.
- TCK-1028: the only escalation the grader failed, and the one I suspect it got wrong (failure note 1).

`grader-check` prints `Human labels: 0/5 filled in` and says how to fill them in. Once labels
exist, it prints the agreement and lists each disagreement. `human-labels` won't overwrite a file
that already has labels.

### 11. Code review and fixes

**What:** An independent review (no Claude calls) found no bugs in grading or result mapping. It
found the telemetry event above, plus smaller issues that I fixed:

- Rubric text was not protected from Nunjucks. It is now wrapped in `{% raw %}`.
- A crashed judge counted as a wrong escalation. The table now says "(N grader errors)" next to the
  escalation count.
- `run-eval` now creates the output folders, and it rejects `--prompts v1,v1`.
- `human-labels` drops duplicate and empty ids. A broken line in the labels file now names its line
  number.

These changes don't change any grade, so I didn't re-run the eval. The current results have no
grader errors. One `npm run eval` run was used of the 3 allowed.

### 12. Failure notes, README, check

**What:** `evals/failure-notes.md` covers TCK-1028 (needs handbook 09 context), TCK-1036 (needs
order or incident data) and TCK-1030 (needs a policy decision). I added the README Scripts rows and
"9. Part 3: evaluate triage v1 against v2".

```bash
npm run check
```

**What happened:** typecheck, lint and 63 tests pass. The last line is
`check-secrets: no .env files or keys found`.

## Done when

- [x] **The eval runs from one README command.** `npm run eval` in README section 9. Run 1 exited 0
  in 4.1 minutes.
- [x] **v2 scores at least as well as v1 on the held-out cases.** Schema 10 vs 10, category 9 vs 9,
  severity 7 vs 6, escalation 9 vs 9. It took one attempt, with no re-tuning after seeing held-out.
- [x] **The regression table and the 3 failure notes are ready to commit.**
  `evals/regression-table.md` and `evals/failure-notes.md` exist. Nothing was committed.
- [x] **The model grader was checked against 5 human labels.** The course owner labelled all 5
  cases pass (2026-10-28). `npm run grader-check`: the model grader agrees on 4/5 (80%). The one
  disagreement is TCK-1028: model fail, human pass. The grader only had the handbook 03 table and
  read "refund processing for 10 days" as missing money. Handbook 09 escalates card refunds only
  after 14 banking days, so `null` is right. That is failure note 1: the grader needs context too.

## Regression table summary (eval run 2026-10-28T07:07Z)

| Prompt | Set | Schema valid | Category | Severity | Escalation pass | Confident misses |
|---|---|---|---|---|---|---|
| triage-v1 | golden | 30/30 | 27/30 | 23/30 | 30/30 | 2 |
| triage-v1 | held-out | 10/10 | 9/10 | 6/10 | 9/10 | 1 |
| triage-v2 | golden | 30/30 | 29/30 | 29/30 | 30/30 | 0 |
| triage-v2 | held-out | 10/10 | 9/10 | 7/10 | 9/10 | 1 |

Held-out changes v1 → v2: TCK-1031 severity fixed (the attachment ticket that only says "see the
screenshot" went from medium to low). Lower confidence on TCK-1028, TCK-1035, TCK-1039 and
TCK-1040 with the same labels. No regressions. The same four held-out misses remain in both versions:
TCK-1030 and TCK-1040 (severity), TCK-1036 (category and severity), and the TCK-1028 escalation.

## Takeaways for the activity Doc

1. **The golden gain is bigger than the held-out gain.** Severity went up 6 on golden and 1 on
   held-out. Prompt rules learned from 30 cases fit those 30 best. The held-out set is what tells
   you how much really carried over.
2. **One idea per run makes the log readable.** Each change named its target tickets, and the run
   showed whether they moved. It also showed the noise: TCK-1023 flipped twice with no related
   change.
3. **Calibration is a prompt fix you can measure.** "Confident misses" (wrong at ≥ 0.9) fell from
   2 to 0 on golden. TCK-1030 is still a confident miss on held-out, because the model is sure by
   the rules it was given.
4. **Grade the grader.** The model grader failed TCK-1028 with a confident reason. Handbook 09
   suggests the grader, not the triage, is wrong. A model grader is only as good as the context in
   its rubric. That is why the 5 human labels matter.
5. **Some misses need context or a decision, not words.** Missing facts (TCK-1036), rules on other
   handbook pages (TCK-1028) and open policy questions (TCK-1030) set up Part 4's retrieval.
