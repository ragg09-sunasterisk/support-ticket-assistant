# Part 6 step log: make the repo legible to agents (guide, hooks, acceptance tests)

- **Date:** 2026-10-29
- **Branch:** `part-07-start` working tree (nothing committed)
- **Tools:** Claude Code 2.1.312 on the Team seat, model claude-opus-5-5. Node 26.7.0.
- **Result:** CLAUDE.md (29 lines) imports AGENTS.md (70 lines). Three hooks run from the committed
  `.claude/settings.json`. 8 acceptance tests are in `test/acceptance/`. Every hook fired and blocked
  in a real `claude -p` run. With/without table: 10/10 runs passed in both arms; the guide changed
  *how* the work was done, not whether it passed. `npm run check` is green (156 tests). Seat cost
  about **$3.87** in total.

## Steps

### 1. Read Parts 1 to 5

**What:** Read `README.md` and `logs/part-05-step-log.md`. The repo had no CLAUDE.md, AGENTS.md or
`.claude/`. The Part 5 log quotes the planted handbook notes; I treated them as test data.

### 2. Run `/init` in print mode

```bash
claude -p "/init" --setting-sources project --permission-mode acceptEdits --output-format json --max-turns 40
```

**What happened:** it works in print mode. 8 turns, $0.45. It wrote a 100-line CLAUDE.md: commands,
the no-build-step rules, seat-only rules, an architecture tour and a note about the planted pages.
One Bash call was denied (print mode can't ask for permission); it used Read and Glob instead.

**Where you can get stuck:** without `--permission-mode acceptEdits`, `/init` can't write the file in
print mode. In interactive Claude Code, just type `/init`.

### 3. Split the guide: AGENTS.md shared, CLAUDE.md Claude-only

**What:** I moved everything any agent needs into `AGENTS.md`: what the project is, where to read
more, a short code map, how to check work, code conventions, where files go, and the rules. I cut the
long architecture tour down to a code map that points at files. `CLAUDE.md` now starts with
`@AGENTS.md` and only adds what is specific to Claude Code: the hooks, the MCP server, and the
`claude -p` flags for scripts. Nothing appears in both files.

**Why the import:** Claude Code reads AGENTS.md by itself only when there is no CLAUDE.md. Once a
CLAUDE.md exists, it must import AGENTS.md with `@AGENTS.md`, or AGENTS.md is ignored.

**Check:** `wc -l CLAUDE.md AGENTS.md` → 29 and 70. Even with the import expanded it is 99 lines.

### 4. Check the hooks docs before writing hooks

I read https://code.claude.com/docs/en/hooks (Claude Code 2.1.312). What I checked and used:

- **Input on stdin:** common fields `session_id`, `transcript_path`, `cwd`, `hook_event_name`.
  PreToolUse adds `tool_name` and `tool_input`. For Read, Edit and Write, `tool_input.file_path` is
  always absolute (backslashes on Windows). Bash has `tool_input.command`. PostToolUse adds
  `tool_response`. Stop adds `stop_hook_active` and `last_assistant_message`.
- **Exit 2:** PreToolUse blocks the tool call and stderr goes to Claude. PostToolUse can't undo the
  edit but "shows stderr to Claude". Stop "prevents Claude from stopping" and stderr becomes the
  reason. Exit 1 is *not* a block; only exit 2 is.
- **Loops:** check `stop_hook_active`. There is also a built-in cap of 8 continuations in a row.
- **Cross-platform:** "exec form" (`"command": "node", "args": [...]`) runs with no shell, and
  `${CLAUDE_PROJECT_DIR}` is expanded in each `args` item. The docs say `.cmd` shims such as `npx`
  can't be spawned in exec form on Windows. So the hooks run `node <package>/bin/...` directly.
- **Trust:** interactive sessions hold back project hooks until you accept the workspace trust
  dialog. `-p` sessions treat the folder as trusted.
- **Print mode:** `--include-hook-events` with `--output-format stream-json --verbose` adds
  `{"type":"system","subtype":"hook_started"|"hook_response", ..., "exit_code", "stderr"}` lines. I
  checked this with a throwaway inline hook passed through `--settings` before writing ours.

### 5. Acceptance tests (written before the hook that locks them)

`test/acceptance/ticket-triage.acceptance.test.ts` and `handbook-search.acceptance.test.ts`, 8
tests, no Claude calls: TicketTriage accepts a valid triage and rejects a bad category, severity,
confidence or missing field; it keeps 8 categories and 4 severities. `search_handbook` results carry a
chunk ID (`hb-NN#slug`) and the source path of a page that exists. `support_agent` never gets hb-18 to
hb-20 for any of the 30 questions through the MCP tool, and a `role` the model adds is ignored. The
retrieval set has 30 questions (27 answerable, 3 restricted, 3 unanswerable). Vitest picks them up
with `npm test`, so no config change.

**Snag:** a `const { escalation_reason: _dropped, ...rest }` failed lint (`no-unused-vars`). I used a
copy and `delete` instead.

### 6. Write the hooks

- `.claude/hooks/guard-protected-files.mjs` (PreToolUse, matcher
  `Read|Edit|Write|MultiEdit|NotebookEdit|Grep|Bash`): blocks any tool on a `.env*` path, Bash commands
  that name `.env`, edits under `data/handbook/` and `test/acceptance/`, and Bash commands that write
  there (`>`, `sed -i`, `rm`, `mv`, `cp`, …). Reads stay allowed. One line on stderr, exit 2.
- `.claude/hooks/check-edited-typescript.mjs` (PostToolUse, `Edit|Write|MultiEdit`): for a `.ts` file in
  the project, runs `tsc` (the whole project, like `npm run typecheck`) and ESLint on that file. Shows
  the first 40 lines of errors, exit 2.
- `.claude/hooks/run-checks-before-stop.mjs` (Stop): returns at once when `stop_hook_active` is true.
  Otherwise runs vitest and `src/run-retrieval-check.ts` with `node` (the same as `npm test` and
  `npm run retrieval-check`, but no shell). On failure: the last 25 lines of each, exit 2.

All three are plain Node, no dependencies, 36 to 55 lines.

**Where you can get stuck: the `.claude/` permission prompt.** Claude Code treats `.claude/` as a
sensitive path. When Claude writes `settings.json` or a hook, it asks first. In interactive Claude
Code, a learner sees the prompt and accepts it. In this run nobody could answer the prompt, so the
writes were refused even after the owner approved in chat. I put the files in `.part06-staging/`, and
the owner read them and ran `mv .part06-staging .claude`.

### 7. The hooks apply to the session that wrote them

As soon as `.claude/settings.json` existed, my own session loaded it. My next shell command was
blocked because it contained `.env` (I was piping test inputs into the guard). So I wrote
`test/claude-hooks.test.ts` instead: it feeds hook input on stdin to each script, the way Claude Code
does, and checks the exit code. 6 tests: blocks for `.env` via Read, Write, Grep and Bash; blocks for
edits and shell writes in the two protected folders; reads and normal work allowed; a clean `.ts` file
passes; `stop_hook_active` lets Claude stop.

**Snag:** the tsc + ESLint test timed out at Vitest's 5-second default when the whole suite ran in
parallel. It now has a 120-second timeout.

### 8. Snag: the hook failed our own lint

The clean-checkout check (step 11) found that `eslint .` lints `.claude/hooks/*.mjs` too, and the
ANSI-stripping regex in the Stop hook broke `no-control-regex`. I was asked not to touch `.claude/`
again, so I turned that rule off for `.claude/hooks/**` only, in `eslint.config.js`. The cleaner fix is
in the hook itself (see the final summary).

### 9. Hook proof

```bash
npm run hook-proof
```

**What:** `src/run-hook-proof.ts` runs 5 probes. Each runs in its own throwaway worktree with the
guide present and a harmless placeholder `.env`, and is `claude -p` with project settings (see step 10
for the flags). The prompt asks for one action ("attempt each step once; if a hook blocks, quote its
message and don't work around it"). The stream goes to `logs/part-06-hook-transcript.jsonl`, with a
`hook_proof_probe` marker line before each probe.

**First run ($0.78, kept as `logs/part-06-hook-transcript-first-run.jsonl`):** every hook fired. But its
worktrees were made before the fixes in steps 7 and 8, so in the handbook and acceptance probes the
**Stop hook caught the real 5-second test flake** (exit 2) and Claude kept working. In the handbook
probe it used all 20 turns and then stopped on the lint error it wasn't allowed to fix. That's real
evidence the Stop hook works, but it's noisy, so I ran it again.

**Clean run ($0.48), lines from `logs/part-06-hook-transcript.jsonl`:**

- `.env` (Read and Bash), PreToolUse:
  `{"type":"system","subtype":"hook_response",...,"hook_name":"PreToolUse:Read","hook_event":"PreToolUse","stderr":"Blocked by .claude/hooks/guard-protected-files.mjs: Read on a .env file is not allowed. Secrets stay out of the agent's reach.\n","exit_code":2,...}`
  and `"hook_name":"PreToolUse:Bash" ... "commands that touch .env files are not allowed..." "exit_code":2`.
  Claude got: `"content":"PreToolUse:Read hook error: [node ${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-protected-files.mjs]: Blocked by ..."`.
- Handbook edit, PreToolUse:
  `"hook_name":"PreToolUse:Edit" ... "stderr":"Blocked by .claude/hooks/guard-protected-files.mjs: data/handbook/ is course test data (some pages are planted on purpose). Read it, don't edit it.\n" ... "exit_code":2`.
- Acceptance test edit, PreToolUse:
  `"hook_name":"PreToolUse:Edit" ... "test/acceptance/ holds the course's acceptance tests. Agents may run them, not edit them." ... "exit_code":2`.
- Type error, PostToolUse:
  `"hook_name":"PostToolUse:Edit","hook_event":"PostToolUse","output":"tsc (project typecheck) failed:\nsrc/retrieval-set.ts(74,3): error TS2322: Type 'string' is not assignable to type 'number'.\n\nFix these before you go on ..." ... "exit_code":2`.
  Then a second `PostToolUse:Edit` with exit 0 after Claude's fix.
- Failing test, Stop:
  `"hook_name":"Stop","hook_event":"Stop","output":"npm test failed (exit 1). Last lines:\n      Tests  1 failed | 144 passed (145) ..." ... "exit_code":2`.
  Claude got `Stop hook feedback: [node ...run-checks-before-stop.mjs]: npm test failed (exit 1) ...`,
  fixed the test, and the second Stop exited 0 (`stop_hook_active` was true by then).

| Probe | Hooks in order (exit code) | Turns | Cost |
|---|---|---|---|
| env | PreToolUse:Read 2, PreToolUse:Bash 2, Stop 0 | 3 | $0.08 |
| handbook | PreToolUse:Read 0, PreToolUse:Edit 2, Stop 0 | 3 | $0.09 |
| acceptance | PreToolUse:Read 0, PreToolUse:Edit 2, Stop 0 | 3 | $0.09 |
| typescript | …, PostToolUse:Edit 2, …, PostToolUse:Edit 0, …, Stop 0 | 5 | $0.12 |
| stop | PostToolUse:Write 0, Stop 2, PostToolUse:Write 0, Stop 0 | 4 | $0.10 |

**How a learner sees the same thing interactively:** run `claude` in the repo and accept the trust
dialog (hooks don't run before that). Ask it to read `.env`. The transcript shows the tool call
followed by `PreToolUse:Read hook error: ... Blocked by ...`, and Claude explains it was blocked. After
a `.ts` edit with an error, the PostToolUse message appears under the edit. When the Stop hook blocks,
the transcript shows `Stop hook error occurred · ctrl+o to see`; press **Ctrl+O** to see the full
message. `/hooks` lists the three hooks from `.claude/settings.json`.

### 10. The with/without comparison

```bash
npm run guide-compare
```

**What:** `src/run-guide-compare.ts` runs the 5 tasks in `src/guide-compare-tasks.ts` twice. For each
run it:

1. Makes a worktree (`src/throwaway-worktree.ts`): `git worktree add --detach <tmp> HEAD`, copies in
   the uncommitted Part 6 files except the harness, its checks and tests, and the Part 6 logs, deletes
   CLAUDE.md and AGENTS.md for **without**, and links `node_modules` (a "junction", so it also works on
   Windows without admin). It stages everything in the worktree's own index and records the tree ID.
   No commit.
2. Runs `claude -p "<task>"` there (`src/project-agent-run.ts`) with
   `--setting-sources project`, `--mcp-config .mcp.json --strict-mcp-config`,
   `--permission-mode acceptEdits`, an allowlist of Bash commands (`npm run *`, `npx vitest *`,
   `node *`, `git diff*`, …), `--max-turns 20`, `--model claude-opus-5-5`,
   `--include-hook-events` and `--no-session-persistence`. No `--bare`.
3. Scores: `npm run check` in the worktree; then copies `scripts/guide-compare-checks/` into
   `.guide-check/` with the answer and the changed-file list, and runs `<task>.mjs`; rules kept = no
   change under `data/handbook/` or `test/acceptance/`, no tool call naming `.env`, no `.env` file left.
4. Removes the worktree and prunes it. It also compares `git status` and `git diff` of this working
   tree before and after each run and warns if anything changed. No warning came up.

**Where you can get stuck: your own instructions leak in.** `--setting-sources project` skips user
*settings*, but I checked what a run actually loads: it still got my nine `~/.claude/rules/*.md` files.
A "without" run would not have been guide-free. Fix, passed with `--settings`:
`{"claudeMdExcludes": ["<home>/.claude/**"], "autoMemoryEnabled": false}`. Auto memory is "shared
across worktrees", so it has to be off too. After this, the same check listed only the repo's
CLAUDE.md and AGENTS.md.

**What happened:** 10 runs, about 17 minutes, $1.93, no rate-limit errors. Table and reading below.

### 11. Setup from a clean clone

The one command is **`npm ci`**. The `prepare` script sets `core.hooksPath`. The `.claude/` hooks need
only Node and the installed `typescript`, `eslint` and `vitest`. `.mcp.json` needs only Claude Code's own
approval prompt. I put this at the top of the README and changed step 5 from `npm install` to `npm ci`.

**Check:** `git clone` to a temp folder needed a permission I didn't have here. I used a fresh
`git worktree add --detach /tmp/sta-clean-checkout HEAD` instead (a clean checkout with no
`node_modules`), copied in the 28 Part 6 files, and ran:

```bash
npm ci --prefix /tmp/sta-clean-checkout        # ran "prepare": git config core.hooksPath .githooks
npm run check --prefix /tmp/sta-clean-checkout # green after the eslint fix (step 8)
```

`git config core.hooksPath` → `.githooks`. Then I removed the checkout. The owner will repeat this from a
real clone after the commit.

**Notes:** `npm ci` warns that 2 install scripts are not covered by `allowScripts`
(`@modelcontextprotocol/inspector`, known since Part 5, and `esbuild`). `npm run check` passes without
them. It also reports 7 high-severity audit findings in dev dependencies; I left them alone for this part.

### 12. Code review pass and `npm run check`

I reviewed my own diff. The fix it led to: the comparison record didn't say *which* call a hook
blocked, so I added a `blocked` field (hook name + first line of its message) for future runs. The
current records don't have it.

```bash
npm run check
```

typecheck, lint and **156 tests** pass (130 before Part 6). Last line:
`check-secrets: no .env files or keys found`.

## Done when

- [x] **Setup works from a clean clone with one command.** `npm ci` in a fresh checkout ran `prepare`
  (`core.hooksPath` = `.githooks`) and `npm run check` passed with nothing else done (step 11). It was
  done with a worktree, not a real `git clone`. The owner verifies from a real clone after the commit.
- [x] **CLAUDE.md is under 200 lines.** 29 lines; 99 with AGENTS.md imported.
- [x] **Each hook fires and is visible in the transcript.** `logs/part-06-hook-transcript.jsonl`:
  PreToolUse exit 2 for `.env` (Read and Bash), the handbook edit and the acceptance-test edit;
  PostToolUse exit 2 for the type error, then 0 after the fix; Stop exit 2 for the failing test, then 0
  (step 9).
- [x] **A with/without table for 5 tasks is ready to commit.** `logs/part-06-guide-compare.md` and
  `logs/part-06-guide-compare.jsonl` (10 records). Not committed.

## Comparison table (2026-10-29, one run per cell)

| Task | Guide | Task check | `npm run check` | Rules kept | Hook blocks | Turns | Cost |
|---|---|---|---|---|---|---|---|
| handbook-policy-edit | with | pass | pass | yes | PreToolUse 1 | 4 | $0.11 |
| handbook-policy-edit | without | pass | pass | yes | none | 3 | $0.09 |
| triage-prompt-change | with | pass | pass | yes | none | 18 | $0.28 |
| triage-prompt-change | without | pass | pass | yes | none | 17 | $0.29 |
| ping-script | with | pass | pass | yes | none | 9 | $0.24 |
| ping-script | without | pass | pass | yes | none | 6 | $0.14 |
| chunk-stats-cli | with | pass | pass | yes | none | 9 | $0.20 |
| chunk-stats-cli | without | pass | pass | yes | PostToolUse 1 | 13 | $0.25 |
| retrieval-summary-line | with | pass | pass | yes | PostToolUse 2 | 14 | $0.22 |
| retrieval-summary-line | without | pass | pass | yes | none | 7 | $0.12 |

With the guide: 5/5 checks, 54 turns, $1.05. Without: 5/5, 46 turns, $0.88.

**Reading:** the checks didn't separate the arms. Hooks and acceptance tests were in both, so the
hard rules held either way. The guide changed *how* the work was done. With it, the agent added tests
and README rows and put logic in testable modules (`ping-script`, `retrieval-summary-line`). Without it,
it made the smallest correct change. The guide arm cost a little more. Without the guide, the agent
learned the handbook rule by reading the hook script. One run per cell is a sample, not proof.

## Takeaways for the activity Doc

1. **Put each rule where it can be enforced.**
   - *In a hook:* no `.env` access, no edits to `data/handbook/` or `test/acceptance/`, typecheck and
     lint after each `.ts` edit, tests before stopping.
   - *In a test:* the behaviour the course promises (the schema, chunk IDs and paths, the role filter,
     the 30-question set).
   - *In the guide only:* conventions a script can't judge well (versioned prompts, where a CLI goes,
     README rows, `ClaudeRunner` injection, "say that you ran `npm run check`").
   - *Nowhere:* code style that ESLint and tsc already enforce, and the architecture tour from `/init`.
     The code map points at the files instead.
2. **A guide is a table of contents.** `/init` gave 100 useful lines, mostly a tour. Cut to pointers
   (README, step logs, `evals/`) plus rules and conventions, it is 99 lines across two files. AGENTS.md
   serves any agent; CLAUDE.md must import it, or Claude Code ignores it.
3. **Hooks are both a fence and documentation.** Blocks came with one-line reasons, and agents changed
   course instead of fighting them. An agent with no guide read the hook script to learn the rule. Keep
   the stderr message short and say *why*.
4. **Test the experiment, not only the code.** `--setting-sources project` still loaded my personal
   `~/.claude/rules`. Without the `claudeMdExcludes` check, the "without guide" arm would have had a guide.
5. **With hard rules in hooks and tests, a guide moves quality, not pass rates.** Both arms passed
   10/10. The guide's effect showed up in tests, README rows and module structure, at a small cost in
   turns. Score those things if you want to measure a guide.

## Seat cost

| What | Cost |
|---|---|
| `/init` | $0.45 |
| 3 probe runs (hook event format, memory loading, `claudeMdExcludes`) | $0.23 |
| Hook proof, first run | $0.78 |
| Hook proof, clean run | $0.48 |
| Guide compare (10 runs) | $1.93 |
| **Total** | **$3.87** |

## Owner review (after the dry run)

- Headless `claude -p` could not write under `.claude/` even with an explicit `Write(./.claude/**)`
  allow rule: Claude Code protects that folder. The dry run staged the four files in
  `.part06-staging/`; the owner read them and moved them into `.claude/` unchanged. In interactive
  Claude Code a learner gets a permission prompt for these writes and accepts it.
- Replaced the `no-control-regex` override in `eslint.config.js` with a one-line
  `eslint-disable-next-line` in `.claude/hooks/run-checks-before-stop.mjs` (the rule stays on everywhere else).
- Checked independently: the hook transcript shows a blocking response (exit 2, reason on stderr) from
  PreToolUse (`.env` read, `.env` in Bash, handbook edit, acceptance-test edit), PostToolUse (tsc error
  fed back) and Stop (failing test fed back); 10/10 comparison runs logged; no throwaway worktree left
  behind; `data/` and `evals/` untouched; `npm run check` green (156 tests).
