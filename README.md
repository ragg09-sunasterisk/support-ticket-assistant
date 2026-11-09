# Support Ticket Assistant

The course project for the AI Engineering Upskilling course. You build one TypeScript app across
10 parts. Each part has a starter branch (`part-01-start` … `part-10-start`) with the work of the
parts before it already done.

**Seat-only:** every lab runs on your own Claude Team seat. You never need an API key.

## What you need

| Tool | Version | Check with |
|---|---|---|
| macOS, Linux, or Windows with WSL2 | on Windows, run everything inside WSL2 | `echo $WSL_DISTRO_NAME` (WSL only) |
| Node.js | 24 or newer | `node --version` |
| Git | any recent version | `git --version` |
| Claude Code | a recent build | `claude --version` |
| Claude Team seat | Sun-asterisk PH | `claude auth status --text` |

The course was built and tested on Claude Code 2.1.310. Newer builds may differ slightly.

## Setup

The course's **Start here** Doc (in Google Classroom, Start here topic) has the full setup with checks
and hints. Steps 1–4 below are the short version.

### 1. Set up your machine

Follow Start here steps 1–4: WSL2 on Windows, Git connected to GitHub, Node 24 with nvm, and
Claude Code. On macOS, Linux and WSL, Claude Code installs with:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

### 2. Sign in with your Team seat

```bash
claude auth login --claudeai
claude auth status --text
```

You should see `Login method: Claude Team account` and `Organization: Sun-asterisk PH`.
If it says anything else, run `claude auth logout` and sign in again.

### 3. Check the installation

```bash
claude doctor
```

Fix anything it reports before you go on.

### 4. Get your own copy of the project

You work in your own public GitHub repo. This repo's `part-NN-start` branches are checkpoints you
start from and compare against. Create an empty repo on your personal GitHub account (no README),
then copy your starter branch into it. Replace `NN` with your start part (`01`, `04`, `06` or `08`)
and `<your repo URL>` with your new repo's URL:

```bash
git clone --branch part-NN-start https://github.com/ragg09-sunasterisk/support-ticket-assistant.git my-ticket-assistant
cd my-ticket-assistant
git branch -m main
git remote rename origin course
git remote add origin <your repo URL>
git push -u origin main
```

Your work goes to `origin`. The course branches stay readable as `course/part-NN-start`.
Never commit client or company data: the project uses made-up tickets only.

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

## Secret guard

Before every commit, a git hook runs `scripts/check-secrets.mjs`. It blocks the commit if it
finds a `.env` file (`.env.example` is fine) or something that looks like an API key or private
key. The repo is public, so a leaked key is visible to everyone the moment it is pushed.

If it blocks you, unstage the file with `git restore --staged <file>`, remove the secret, and
commit again.
