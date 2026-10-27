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

## Secret guard

Before every commit, a git hook runs `scripts/check-secrets.mjs`. It blocks the commit if it
finds a `.env` file (`.env.example` is fine) or something that looks like an API key or private
key. The repo is public, so a leaked key is visible to everyone the moment it is pushed.

If it blocks you, unstage the file with `git restore --staged <file>`, remove the secret, and
commit again.
