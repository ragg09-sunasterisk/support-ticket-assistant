# Support Ticket Assistant

The course project for the AI Engineering Upskilling course. You build one TypeScript app across
10 parts. Each part has a starter branch (`part-01-start` … `part-10-start`) with the work of the
parts before it already done.

**Seat-only:** every lab runs on your own Claude Team seat. You never need an API key.

## What you need

| Tool | Version | Check with |
|---|---|---|
| Node.js | 24 or newer | `node --version` |
| Git | any recent version | `git --version` |
| Claude Code | 2.1.310 | `claude --version` |
| Claude Team seat | Sun-asterisk PH | `claude auth status --text` |

The course was built and tested on Claude Code 2.1.310. Newer builds may differ slightly.

## Setup

### 1. Install Claude Code 2.1.310

macOS, Linux or WSL:

```bash
curl -fsSL https://claude.ai/install.sh | bash -s 2.1.310
```

Windows PowerShell:

```powershell
& ([scriptblock]::Create((irm https://claude.ai/install.ps1))) 2.1.310
```

Already have Claude Code? Switch to the course build with `claude install 2.1.310`.

Check it: `claude --version` should print `2.1.310 (Claude Code)`.

### 2. Sign in with your Team seat

```bash
claude auth login --claudeai
```

A browser opens. Sign in with your Sun-asterisk email. Then check:

```bash
claude auth status --text
```

You should see `Login method: Claude Team account` and `Organization: Sun-asterisk PH`.
If it says anything else, run `claude auth logout` and sign in again.

### 3. Check the installation

```bash
claude doctor
```

Fix anything it reports before you go on.

### 4. Get the code

```bash
git clone https://github.com/ragg09-sunasterisk/support-ticket-assistant.git
cd support-ticket-assistant
```

Starting at a later part? Switch to your starter branch, for example `git switch part-04-start`.

### 5. Install

If you use nvm, run `nvm use` first: it picks Node 24 from `.nvmrc`.

```bash
npm install
```

This also turns on the secret guard (see below).

### 6. Check everything works

```bash
npm run check
```

This runs the type check, lint, tests and secret check. It passes when the last line is
`check-secrets: no .env files or keys found`. The tests also confirm your Node version and that
no API key is set in your shell.

### 7. Run the Part 1 script

```bash
npm run ticket -- --ticket TCK-1001 --runs 5
```

This sends one ticket from `data/tickets.jsonl` to `claude -p --output-format json` five times. It
prints each answer with its token counts and estimated cost and appends every run to
`logs/part-01-runs.jsonl`. All flags are optional: `--ticket` defaults to the first ticket,
`--runs` to 1, `--log` to `logs/part-01-runs.jsonl`. Each run takes a few seconds.

To keep the context small and the same on every machine, the script turns off tools, MCP servers,
skills and your user settings for that call. It still runs on your Team seat. The committed results
and a comparison of the five runs are in `logs/part-01-run-notes.md`.

### 8. Run the Part 2 triage classifier

```bash
npm run triage -- --ticket TCK-1003
npm run golden
```

`triage` sends one ticket to `claude -p --json-schema` and prints a validated `TicketTriage`:
`category`, `severity`, `confidence` and `escalation_reason`. The schema lives in
`src/ticket-triage-schema.ts` (Zod). The prompts are versioned files in `prompts/` (`triage.v1.md`,
`triage.v2.md`); the default is v2, and `--prompt v1` picks another version. If Claude fails or
returns output that does not pass the schema, you get "no valid triage" with the reason instead of
a crash.

`golden` triages the 30 cases in `evals/golden.jsonl`, prints each result, and reports how many
outputs passed validation (it must be 30/30) plus category and severity accuracy. It also takes
`--prompt v1`. Every run is appended to `logs/golden-runs.jsonl` (the Part 2 run is kept in
`logs/part-02-golden-run.jsonl`). It takes about 3 minutes. The step-by-step notes are in
`logs/part-02-step-log.md`.

### 9. Part 3: evaluate triage v1 against v2

```bash
npm run eval
```

This runs promptfoo over both prompt versions and both eval sets: the 30-case golden set (used to
improve v2) and the 10-case held-out set in `evals/held-out.jsonl` (used only to compare). Each
output is graded three ways by code (passes the Zod schema, right category, right severity) and once
by a model: an `llm-rubric` check that `escalation_reason` follows the escalation table in
`data/handbook/03-ticket-triage-and-escalation.md`. Both the triage and the grader run through
`claude -p` on your seat, via the custom providers in `src/claude-eval-providers.ts`. promptfoo
telemetry and update checks are off, results stay out of promptfoo's database, and nothing is
shared. (promptfoo 0.125.1 still sends a single "telemetry disabled" event per run; no setting
stops it. No eval data is in it.) It makes about 160 `claude -p` calls and takes several minutes.

It writes `evals/regression-table.md` (counts per prompt and set, plus every held-out change from v1
to v2) and `evals/eval-results.jsonl` (one line per case). Five v2 cases are in
`evals/human-labels.jsonl` for a person to label; `npm run grader-check` then reports how often the
model grader agrees. Known failures that prompt wording can't fix are in `evals/failure-notes.md`.
The step-by-step notes are in `logs/part-03-step-log.md`.

### 10. Part 4: search the handbook and answer with citations

```bash
npm run retrieval-check
npm run ask -- "A card refund has said Refund processing for 10 days. Is it stuck?"
```

The handbook pages in `data/handbook/` are split into one chunk per `##` section
(`src/handbook-chunker.ts`). Each chunk has a stable ID made from the page id and a heading slug,
such as `hb-09#refunds`, plus its source path, title, heading, text, `access` and `allowed_roles`.
All 20 pages are indexed. Part 5 adds the role filter.

`searchHandbook(query, k)` in `src/handbook-search.ts` (also exported as `search_handbook`) is a
BM25 keyword search with MiniSearch. It runs on your machine: no embeddings, no API, no key. It
returns the top-k chunks (default 5) as plain objects: `chunk_id`, `source_path`, `title`,
`heading`, `score`, `text` and the page's `access`.

`ask` searches the handbook, puts the top 5 chunks in `<document id="...">` tags and asks
`claude -p` on your seat to answer using only those documents, citing the chunk IDs it used. If the
documents don't hold the answer, it says so. It prints the answer, the cited chunk IDs and the
retrieved chunk IDs. Each call costs about $0.02.

`retrieval-check` runs the search over the 30 questions in `evals/retrieval.jsonl` (no Claude
calls). It prints how many answerable questions have an expected chunk in the top 5, and lists the
misses. The step-by-step notes are in `logs/part-04-step-log.md`.

### 11. Part 5: search_handbook as an MCP server

The handbook search is now an MCP server (`src/handbook-mcp-server.ts`, MCP TypeScript SDK v2,
`@modelcontextprotocol/server` 2.4.0) with one read-only tool, `search_handbook(query, k)` (k 1 to 10,
default 5). The **role is server config**, not a tool argument: `--role support_agent|engineer|security`
is required at startup. Chunks whose page doesn't list that role in `allowed_roles` are never indexed
for it, so they never leave the server. `--handbook-dir` (default `data/handbook`) serves another
folder. Every result is marked as untrusted reference data, and chunks with instruction-like text
(text that addresses an AI, or says to ignore, hide, disable or override something) get
`instruction_like: true`.

Try it with the MCP Inspector web UI, or its CLI:

```bash
npx @modelcontextprotocol/inspector node src/handbook-mcp-server.ts --role support_agent
npx @modelcontextprotocol/inspector --cli node src/handbook-mcp-server.ts --role support_agent --method tools/list
npx @modelcontextprotocol/inspector --cli node src/handbook-mcp-server.ts --role support_agent \
  --method tools/call --tool-name search_handbook --tool-arg "query=webhook 401 signature mismatch" k=3
```

The server is registered for Claude Code in the committed `.mcp.json`, made with:

```bash
claude mcp add --scope project handbook -- node src/handbook-mcp-server.ts --role support_agent
```

Start it with `node`, not `npm run`: npm prints a banner on stdout, which is the MCP channel.

```bash
npm run retrieval-check
npm run answer-check
npm run injection-test -- --label after
```

`retrieval-check` now also prints **recall@5** and **precision@5** (role `security` by default, the
one that sees every expected chunk; `--role` picks another). `npm test` asserts both against a floor.
`answer-check` answers all 30 retrieval questions with `claude -p` as `support_agent` and scores them
by rules: public questions must cite an expected chunk, every citation's quote must be in that chunk,
and unanswerable and restricted questions must abstain. It writes `logs/part-05-answer-check.jsonl`
(about 30 calls, $0.65). `ask` now cites `{chunk_id, quote}` and takes `--role`.
`injection-test` asks Claude Code two questions with only the handbook MCP tool allowed: one about the
planted note in `data/handbook/12-merchant-webhooks.md`, one about a blunter note planted in a copy
under `evals/injection/`. The step-by-step notes are in `logs/part-05-step-log.md`.

## Seat-only rules

- **Never set `ANTHROPIC_API_KEY`.** If it is set, Claude Code uses that key instead of your seat.
  `npm test` fails while it is set.
- **Never run `claude --bare`.** Bare mode ignores your seat sign-in and only accepts an API key.
- Where a lab script calls Claude, it uses `claude -p` (print mode), which runs on your seat.

## Scripts

| Command | What it does |
|---|---|
| `npm run check` | Runs everything below in one go |
| `npm run typecheck` | Type-checks with `tsc` (no build step: Node 24 runs `.ts` files directly) |
| `npm run lint` | Lints with ESLint |
| `npm test` | Runs the tests once with Vitest |
| `npm run test:watch` | Re-runs the tests as you edit |
| `npm run check:secrets` | Looks for `.env` files and API keys in what git will commit |
| `npm run ticket` | Part 1: sends one ticket to `claude -p` and logs answer, tokens and cost |
| `npm run triage` | Part 2: triages one ticket into a validated category, severity, confidence and escalation reason |
| `npm run golden` | Part 2: triages the 30-case golden set, reports validation and accuracy, logs the run |
| `npm run eval` | Part 3: promptfoo eval of prompts v1 and v2 on the golden and held-out sets, writes `evals/regression-table.md` |
| `npm run human-labels` | Part 3: copies chosen v2 cases from the last eval into `evals/human-labels.jsonl` for a person to label |
| `npm run grader-check` | Part 3: reports how often the model grader agrees with the human labels |
| `npm run ask -- "<question>"` | Part 4: searches the handbook and answers with `claude -p`, citing chunk IDs (Part 5: with quotes, `--role`) |
| `npm run retrieval-check` | Part 4: runs the handbook search over the 30-question retrieval set and lists the misses (no Claude calls). Part 5: also prints recall@5 and precision@5 |
| `npm run answer-check` | Part 5: answers the 30 retrieval questions as `support_agent` with `claude -p` and scores citations, quotes and abstentions by rules |
| `npm run injection-test -- --label <name>` | Part 5: asks Claude Code the two prompt-injection questions through the handbook MCP server and logs the answers |
| `node src/handbook-mcp-server.ts --role <role>` | Part 5: the handbook MCP server over stdio (registered in `.mcp.json`) |

## Secret guard

Before every commit, a git hook runs `scripts/check-secrets.mjs`. It blocks the commit if it
finds a `.env` file (`.env.example` is fine) or something that looks like an API key or private
key. The repo is public, so a leaked key is visible to everyone the moment it is pushed.

If it blocks you, unstage the file with `git restore --staged <file>`, remove the secret, and
commit again.
