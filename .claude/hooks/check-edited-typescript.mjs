// PostToolUse hook (Edit/Write): after Claude edits a .ts file, run the project typecheck (tsc, as in
// `npm run typecheck`) and ESLint on that file. On failure, exit 2 with the errors on stderr so Claude
// sees them and fixes them; the edit itself has already happened.
// Runs tsc and eslint through `node <package bin>`, not npx, so no shell is needed on Windows.
import { spawnSync } from "node:child_process";
import { isAbsolute, join, relative } from "node:path";

const MAX_LINES = 40;

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw || "{}");
const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
const filePath = input.tool_input?.file_path;
if (typeof filePath !== "string" || !filePath.endsWith(".ts")) process.exit(0);

const rel = relative(root, filePath);
if (rel.startsWith("..") || isAbsolute(rel)) process.exit(0); // not a project file

function run(label, script, args) {
  const result = spawnSync(process.execPath, [join(root, "node_modules", ...script), ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.status === 0) return null;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() || result.error?.message || "no output";
  const lines = output.split("\n");
  const shown = lines.slice(0, MAX_LINES).join("\n");
  return `${label} failed:\n${shown}${lines.length > MAX_LINES ? `\n… ${lines.length - MAX_LINES} more lines` : ""}`;
}

const failures = [
  run("tsc (project typecheck)", ["typescript", "bin", "tsc"], []),
  run(`eslint ${rel}`, ["eslint", "bin", "eslint.js"], [rel]),
].filter(Boolean);

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n\n")}\n\nFix these before you go on (checked by .claude/hooks/check-edited-typescript.mjs).\n`);
  process.exit(2);
}
process.exit(0);
