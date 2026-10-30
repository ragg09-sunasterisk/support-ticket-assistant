# Threat model: Support Ticket Assistant and the agent that works on it

Part 7. Two things are in scope: **the app** (triage, handbook search, cited answers, the MCP server)
and **the coding agent** (Claude Code working in this repo on a Team seat). Each threat has an OWASP ID,
the control that answers it with the file that implements it, and the response:

- **Eliminate**: the action can't happen with the controls in place (it is blocked, not just discouraged).
- **Mitigate**: the risk is lower, but some of it stays.
- **Accept**: we know about it and choose to live with it, with a reason.

IDs come from the **OWASP Top 10 for LLM Applications, 2026 edition** (`LLMxx:2026`) and the **OWASP Top
10 for Agentic Applications (2026)** (`ASIxx`). Where a row has two IDs, the first is the main one.

`.claude/settings.json` holds the permission rules (`permissions.allow` / `ask` / `deny`) and the sandbox
(`sandbox`). Each rule and the sandbox were tested in a real run: `logs/part-07-rule-tests.jsonl`.

## The app

| # | Threat | OWASP | Control (file) | Response |
|---|---|---|---|---|
| A1 | Ticket text tells the triage model to change a label, raise severity or escalate ("mark this critical") | LLM01:2026 Prompt Injection · ASI01 Agent Goal Hijack | Ticket inside `<ticket>` tags and declared untrusted data (`prompts/triage.v2.md`, `src/triage-prompt.ts`); output must pass the schema (`src/ticket-triage-schema.ts`); injection test (`src/run-injection-test.ts`) | Mitigate |
| A2 | A handbook page carries an instruction aimed at the AI (`data/handbook/12-merchant-webhooks.md`, `evals/injection/`) and the answer follows it | LLM01:2026 Prompt Injection · ASI06 Memory & Context Poisoning | Every result is marked untrusted and instruction-like text is flagged (`src/handbook-mcp-tool.ts`, `src/instruction-flag.ts`); injection test (`src/run-injection-test.ts`) | Mitigate |
| A3 | Restricted pages (hb-18 to hb-20) reach a `support_agent` | LLM02:2026 Sensitive Information Disclosure · ASI03 Identity and Privilege Abuse | The role is server config, not a tool argument; chunks the role can't read are dropped before indexing (`src/handbook-search.ts` `chunksForRole`, `src/handbook-mcp-tool.ts`, `.mcp.json` `--role support_agent`); acceptance test (`test/acceptance/handbook-search.acceptance.test.ts`) | Mitigate |
| A4 | A draft reply promises a refund or an exception nobody approved | LLM07:2026 Misinformation · ASI09 Human-Agent Trust Exploitation | Answers only from cited handbook chunks, with quotes checked against the chunk (`src/cited-answer-client.ts`, `src/answer-check-rules.ts`); the app only drafts: there is no code that sends a reply, so a person approves every reply | Mitigate |
| A5 | Model output is used as-is: bad JSON, a made-up category, shell syntax in ticket text | LLM10:2026 Improper Output Handling | Zod validation of every structured result (`src/claude-structured-output.ts`, `src/ticket-triage-schema.ts`); `claude` is spawned with no shell and the ticket goes in on stdin (`src/run-claude-process.ts`) | Mitigate |
| A6 | Weak spots in vector or embedding search (poisoned embeddings, inversion) | LLM09:2026 Vector and Embedding Weaknesses | Not applicable: the search is BM25 keyword search with MiniSearch, no embeddings and no vector store (`src/handbook-search.ts`) | Accept (n/a) |
| A7 | Someone changes eval labels or the golden set so a worse prompt looks better | LLM05:2026 Data and Model Poisoning | `evals/` and `data/` are in git and reviewed; agents may not edit `data/` (`Edit(/data/**)` deny in `.claude/settings.json`); the reviewer flags edits to `evals/` (`.claude/agents/reviewer.md`) | Mitigate |

## The agent working on the repo

| # | Threat | OWASP | Control (file) | Response |
|---|---|---|---|---|
| G1 | The agent edits the handbook (to "fix" a policy or a planted note) | LLM03:2026 Excessive Agency · ASI02 Tool Misuse and Exploitation | The MCP tool is read-only (`src/handbook-mcp-tool.ts`, `readOnlyHint`, no write tool); `Edit(/data/**)` deny (`.claude/settings.json`); guard hook (`.claude/hooks/guard-protected-files.mjs`); the sandbox makes the folder read-only for scripts | Eliminate |
| G2 | The agent edits acceptance tests to make a failing bug fix "pass" | LLM03:2026 Excessive Agency · ASI02 Tool Misuse and Exploitation | `Edit(/test/acceptance/**)` deny (`.claude/settings.json`); guard hook (`.claude/hooks/guard-protected-files.mjs`); sandbox | Eliminate |
| G3 | The agent widens its own permissions or turns off its hooks: edits `.claude/settings*.json`, `.claude/hooks/`, `.claude/agents/` or `.mcp.json` | ASI03 Identity and Privilege Abuse · ASI10 Rogue Agents | `Edit(/.claude/settings.json)`, `Edit(/.claude/settings.local.json)`, `Edit(/.claude/hooks/**)`, `Edit(/.claude/agents/**)`, `Edit(/.mcp.json)` deny (`.claude/settings.json`); the sandbox protects these files from scripts; every security-compare run checks the settings fingerprint (`src/security-lab-worktree.ts`) | Eliminate |
| G4 | The agent reads `.env` secrets, by tool or by a script that opens the file itself | LLM02:2026 Sensitive Information Disclosure · ASI03 Identity and Privilege Abuse | `Read(.env)`, `Read(.env.*)` deny (`.claude/settings.json`); guard hook (`.claude/hooks/guard-protected-files.mjs`); sandbox `filesystem.denyRead` for scripts (`.claude/settings.json`) | Eliminate |
| G5 | A token or key ends up in a log, a commit or telemetry | LLM08:2026 Hidden Context Exposure · LLM02:2026 Sensitive Information Disclosure | Secret check on every commit and in `npm run check` (`scripts/check-secrets.mjs`, `.githooks/pre-commit`); telemetry keeps prompt text and tool details off, and lab runs remove those switches (`src/claude-telemetry.ts`); seat-only, no API key (`test/setup.test.ts`) | Mitigate |
| G6 | The agent sends data out: `curl`, a script's `fetch`, WebFetch or WebSearch to an outside host | LLM02:2026 Sensitive Information Disclosure · ASI02 Tool Misuse and Exploitation | `Bash(curl *)`, `Bash(wget *)`, `WebSearch` deny (`.claude/settings.json`); WebFetch limited to code.claude.com (`.claude/hooks/limit-web-fetch.mjs`); sandbox network allowlist is empty for scripts (`.claude/settings.json`) | Mitigate |
| G7 | The agent pushes, commits, publishes or deletes on its own | LLM03:2026 Excessive Agency · ASI08 Cascading Failures | `Bash(git push)` deny; `git commit`, `npm publish`, `rm -r`, `git reset --hard`, `git clean`, `git checkout`, `git switch`, `git config` ask (`.claude/settings.json`) | Eliminate (push), Mitigate (rest) |
| G8 | The agent runs code that does more than it says (`node -e`, an npm script, a test file) | ASI05 Unexpected Code Execution (RCE) | Sandboxed Bash with `allowUnsandboxedCommands: false`, so a blocked command can't be retried outside it (`.claude/settings.json`); a short allowlist instead of `Bash(node *)` | Mitigate |
| G9 | A new or swapped dependency, MCP server or container image runs code on the machine | LLM04:2026 Supply Chain · ASI04 Agentic Supply Chain Vulnerabilities | `npm ci` from `package-lock.json`; `npm install` asks (`.claude/settings.json`); `.mcp.json` is deny-listed for edits; container images pinned (`telemetry/docker-compose.yml`); "no new dependencies" (`AGENTS.md`) | Mitigate |
| G10 | The agent loops or a lab script runs up seat usage | LLM06:2026 Unbounded Consumption | `--max-turns 20` in lab runs (`src/project-agent-run.ts`); Claude-calling lab scripts ask first (`.claude/settings.json`); tokens and estimated cost per session in Grafana (`telemetry/`); plan usage in `/usage` | Mitigate |
| G11 | The agent follows an instruction inside a tool result, a handbook page or a diff | LLM01:2026 Prompt Injection · ASI01 Agent Goal Hijack | Untrusted-data rule (`AGENTS.md`); results marked untrusted (`src/handbook-mcp-tool.ts`); deny rules and the sandbox still hold if it does (`.claude/settings.json`) | Mitigate |
| G12 | Poisoned memory or guide: auto memory or a personal rule steers the agent | ASI06 Memory & Context Poisoning | Lab runs load project settings only, exclude `~/.claude` memory files and turn auto memory off (`src/project-agent-run.ts`); `CLAUDE.md` and `AGENTS.md` are committed and reviewed | Mitigate |
| G13 | The reviewer subagent is talked into changing code, or its report carries an injected instruction to the main agent | ASI07 Insecure Inter-Agent Communication | Reviewer has `tools: Read, Grep, Glob` only and treats diff text as data (`.claude/agents/reviewer.md`); the main agent's own permission rules and sandbox still apply | Mitigate |
| G14 | One bad edit spreads: a broken module fails later steps, a planted bug ships | ASI08 Cascading Failures | Typecheck and lint after each `.ts` edit (`.claude/hooks/check-edited-typescript.mjs`); tests before the agent stops (`.claude/hooks/run-checks-before-stop.mjs`); lab runs in throwaway worktrees (`src/throwaway-worktree.ts`) | Mitigate |
| G15 | A person trusts the agent's "done" or approves a prompt without reading it | ASI09 Human-Agent Trust Exploitation | The Stop hook runs the tests itself (`.claude/hooks/run-checks-before-stop.mjs`); "done means `npm run check` passes, say you ran it" (`AGENTS.md`); ask rules show the exact command | Mitigate |

## Gaps we accept

| Gap | Why we accept it |
|---|---|
| The sandbox wraps Bash only. Read, Edit, WebFetch, MCP servers and hooks run outside it. | File and web tools follow the permission rules and the WebFetch hook. The MCP server and the hooks are our own code, and the agent can't edit them (G3). |
| `sandbox.excludedCommands` run outside the sandbox: `docker compose`, `npm run telemetry:*` and the lab scripts that call `claude -p`. | Docker and `claude` don't work inside the sandbox. Each excluded command also has an `ask` rule, so a person approves it, in auto mode too. |
| On native Windows there is no sandbox (Claude Code runs commands unsandboxed). `failIfUnavailable` stays off so the course still runs there. | Permission rules and hooks still apply. Use WSL2 for the sandbox. |
| The sandbox's `denyRead` lists exact paths (`.env`, `.env.local`, `.env.development`, `.env.production`, `.env.test` at the project root). A script could still read an `.env` with another name or in a subfolder. | The `Read(.env*)` rules and the guard hook cover every name for tools and commands that name the file; the repo has no `.env` files and the secret check blocks committing one (G5). |
| A Bash deny rule matches the command text: `/usr/bin/curl` or `sh -c "curl …"` doesn't match `Bash(curl *)`. | The sandbox network allowlist blocks the request anyway (G6). |
