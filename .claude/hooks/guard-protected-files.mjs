// PreToolUse hook: keeps agents away from secrets and from files the course owns.
//   - .env* files: no Read, Edit, Write, Grep or Bash command that touches one.
//   - data/handbook/ and test/acceptance/: reads are fine, edits are not (also blocks Bash writes there).
// Blocking = exit 2 with one line on stderr; Claude Code shows that line to Claude as the reason.
// Plain Node, no dependencies, so it runs the same on macOS, Linux and Windows.
import { isAbsolute, relative, resolve } from "node:path";

const READ_ONLY_DIRS = ["data/handbook/", "test/acceptance/"];
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

// .env, .env.local, .env.example … any file whose name starts with ".env".
const isEnvPath = (path) => /(^|\/)\.env[^/]*$/.test(path);
// In a shell command: ".env" as a word or path part, e.g. `cat .env`, `source ./.env.local`, `<.env`.
const ENV_IN_COMMAND = /(^|[\s/'"=<>|;&(`:])\.env(\b|[.\w-]*)/;
// Shell forms that change files: redirects, in-place edits, deletes, moves, copies, git restores.
const WRITES_IN_COMMAND = /(>|\btee\b|\bsed\s+-i|\bperl\s+-i|\brm\b|\bmv\b|\bcp\b|\btruncate\b|\btouch\b|\bgit\s+(checkout|restore|apply|stash)\b)/;

function block(reason) {
  process.stderr.write(`Blocked by .claude/hooks/guard-protected-files.mjs: ${reason}\n`);
  process.exit(2);
}

// Repo-relative path with forward slashes, or null when the file is outside the project.
function projectPath(root, filePath) {
  const rel = relative(root, isAbsolute(filePath) ? filePath : resolve(root, filePath)).replaceAll("\\", "/");
  return rel.startsWith("../") || rel === ".." || isAbsolute(rel) ? null : rel;
}

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw || "{}");
const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
const tool = input.tool_name ?? "";
const args = input.tool_input ?? {};

if (tool === "Bash") {
  const command = String(args.command ?? "");
  if (ENV_IN_COMMAND.test(command)) block("commands that touch .env files are not allowed. Secrets stay out of the agent's reach.");
  const dir = READ_ONLY_DIRS.find((d) => command.includes(d));
  if (dir && WRITES_IN_COMMAND.test(command)) block(`${dir} is read-only for agents. Do not change it from the shell either.`);
  process.exit(0);
}

const filePath = args.file_path ?? args.notebook_path ?? args.path;
if (typeof filePath !== "string" || filePath === "") process.exit(0);
const normalized = filePath.replaceAll("\\", "/");
if (isEnvPath(normalized)) block(`${tool} on a .env file is not allowed. Secrets stay out of the agent's reach.`);

if (EDIT_TOOLS.has(tool)) {
  const rel = projectPath(root, filePath);
  const dir = rel && READ_ONLY_DIRS.find((d) => rel.startsWith(d));
  if (dir === "data/handbook/") block("data/handbook/ is course test data (some pages are planted on purpose). Read it, don't edit it.");
  if (dir === "test/acceptance/") block("test/acceptance/ holds the course's acceptance tests. Agents may run them, not edit them.");
}
process.exit(0);
