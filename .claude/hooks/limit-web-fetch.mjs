// PreToolUse hook (matcher WebFetch): the agent may fetch the Claude Code docs and nothing else.
// A permission rule can't say "deny every domain except one" (deny beats allow, and auto mode fetches
// without asking), so this gate lives in a hook. Blocking = exit 2 with one line on stderr.
const ALLOWED_HOSTS = new Set(["code.claude.com"]);

function block(reason) {
  process.stderr.write(`Blocked by .claude/hooks/limit-web-fetch.mjs: ${reason}\n`);
  process.exit(2);
}

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input;
try {
  input = JSON.parse(raw || "{}");
} catch {
  // Fail closed: a crash would exit 1, which Claude Code treats as a non-blocking error.
  block("unreadable hook input.");
}
if (input.tool_name !== "WebFetch") process.exit(0);

let host = "";
try {
  host = new URL(String(input.tool_input?.url ?? "")).hostname.toLowerCase().replace(/\.$/, "");
} catch {
  block("WebFetch needs a valid URL.");
}
if (!ALLOWED_HOSTS.has(host)) {
  block(`WebFetch is limited to the Claude Code docs (code.claude.com); ${host} is not allowed in this repo.`);
}
process.exit(0);
