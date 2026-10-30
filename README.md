# Support Ticket Assistant

The course project for the AI Engineering Upskilling course. You build one TypeScript app across
10 parts. Each part has a starter branch (`part-01-start` … `part-10-start`) with the work of the
parts before it already done.

**Seat-only:** every lab runs on your own Claude Team seat. You never need an API key.

**Setup is one command.** After you clone (with Node 24+ and Claude Code signed in, see below):

```bash
npm ci
```

That installs the exact locked packages and turns on the git secret guard. Nothing else is needed:
the agent guide (`AGENTS.md`, `CLAUDE.md`), the Claude Code hooks (`.claude/`) and the handbook MCP
server (`.mcp.json`) are committed files. The first time you start `claude` here, it asks you to
trust the folder and to approve the `handbook` MCP server; say yes. Check it with `npm run check`.

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
npm ci
```

This installs the exact versions in `package-lock.json` and turns on the secret guard (see below).
(`npm install` works too, but may update the lock file.)

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

### 12. Part 6: make the repo legible to agents

- `AGENTS.md` is the shared guide for any coding agent. `CLAUDE.md` imports it (`@AGENTS.md`) and
  adds only what is specific to Claude Code.
- `.claude/settings.json` (committed) runs the hooks in `.claude/hooks/`: a PreToolUse guard, a
  typecheck and lint after each `.ts` edit, and the tests before Claude stops. CLAUDE.md lists them.
- `test/acceptance/` holds the course's acceptance tests. `npm test` runs them.

```bash
npm run hook-proof
npm run guide-compare
```

`hook-proof` makes each hook fire in a real `claude -p` run and saves the stream to
`logs/part-06-hook-transcript.jsonl` (5 runs, about $1). `guide-compare` runs 5 tasks twice, with
and without the guide, each in its own throwaway `git worktree`, and writes
`logs/part-06-guide-compare.md` (10 runs, a few dollars). The step-by-step notes are in
`logs/part-06-step-log.md`.

### 13. Part 7: security and operations

- `.claude/settings.json` now also has **permission rules** (`allow` for routine checks, `ask` for
  outward or irreversible actions and for scripts that call Claude, `deny` for `.env`, `data/`,
  `test/acceptance/`, the `.claude/` config, `git push`, `curl`/`wget`, WebSearch and `--bare`) and the
  **sandboxed Bash tool** (`sandbox.enabled`, `allowUnsandboxedCommands: false`). A new hook,
  `.claude/hooks/limit-web-fetch.mjs`, lets WebFetch reach the Claude Code docs only.
- `.claude/agents/reviewer.md` is a **read-only reviewer subagent** (`tools: Read, Grep, Glob`).
- `docs/threat-model.md` lists the threats with OWASP 2026 IDs, the control and the file for each.
- `telemetry/` is the OpenTelemetry Collector + Prometheus + Grafana stack from Anthropic's
  claude-code-monitoring-guide, with a dashboard for tokens by type and estimated cost per session.

Turn the sandbox on in interactive Claude Code with `/sandbox` (it saves your choice to
`.claude/settings.local.json`); this repo already turns it on for everyone in `.claude/settings.json`.
On Linux and WSL2 it needs `bubblewrap` and `socat` (`sudo apt-get install bubblewrap socat`). Native
Windows has no sandbox: use WSL2.

```bash
npm run rule-tests          # Claude tries to break each deny rule and the sandbox (9 runs, about $1.50)
npm run reviewer-proof      # the reviewer is asked to fix code and can't (2 runs, under $0.50)
npm run telemetry:up        # needs Docker; Grafana on http://localhost:3000 (GRAFANA_PORT=3300 to move it)
npm run plant-bugs -- --dir <a checkout you can throw away>
npm run security-compare    # 3 bug-fix tasks, Part 6 vs Part 7 settings (6 runs, a few dollars)
npm run telemetry:query     # tokens and estimated cost per session, from Prometheus
npm run telemetry:down
```

The lab scripts run every agent in a throwaway `git worktree`, never in your checkout. Their logs are
`logs/part-07-rule-tests.jsonl`, `logs/part-07-reviewer-run.jsonl` and
`logs/part-07-security-compare.md`. On a Team seat the dollar figures are estimates; your real limit is
plan usage (`/usage`). The step-by-step notes are in `logs/part-07-step-log.md`.
`security-compare` takes the "before" settings from `HEAD`, which holds Part 6 until you commit Part 7.
After that, pass your Part 6 commit: `npm run security-compare -- --before-ref <commit>`.

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
| `npm run hook-proof` | Part 6: makes each Claude Code hook fire in a `claude -p` run and saves the stream-json transcript |
| `npm run guide-compare` | Part 6: runs 5 tasks with and without the agent guide in throwaway worktrees and writes the comparison table |
| `npm run rule-tests` | Part 7: makes Claude try to break each deny rule and the sandbox in `claude -p` runs and saves the stream-json |
| `npm run reviewer-proof` | Part 7: asks the read-only reviewer subagent to review and fix a change, and shows it can't edit |
| `npm run plant-bugs -- --dir <checkout>` | Part 7: plants the 3 lab bugs in `src/` of that checkout (undo with `git restore src/`) |
| `npm run security-compare` | Part 7: runs the 3 bug-fix tasks with the Part 6 and the Part 7 settings in throwaway worktrees and writes the table (`--mode auto`, `--dry-run`) |
| `npm run telemetry:up` / `telemetry:down` | Part 7: starts / stops the OpenTelemetry Collector, Prometheus and Grafana in Docker |
| `npm run telemetry:query` | Part 7: prints tokens by type and estimated cost per Claude Code session from Prometheus |

## Secret guard

Before every commit, a git hook runs `scripts/check-secrets.mjs`. It blocks the commit if it
finds a `.env` file (`.env.example` is fine) or something that looks like an API key or private
key. The repo is public, so a leaked key is visible to everyone the moment it is pushed.

If it blocks you, unstage the file with `git restore --staged <file>`, remove the secret, and
commit again.
