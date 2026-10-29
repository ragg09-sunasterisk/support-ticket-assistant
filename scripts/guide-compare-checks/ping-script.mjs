// Check: `npm run ping` exists, calls Claude through the seat (run-claude-process.ts), and the change
// adds no SDK, no API key use, no --bare and no new dependency.
import { existsSync } from "node:fs";
import { baseFile, changed, expectThat, finish, readText } from "./check-helpers.mjs";

const pkg = JSON.parse(readText("package.json"));
const base = JSON.parse(baseFile("package.json"));
const script = pkg.scripts?.ping ?? "";
const entry = /^node (src\/[\w./-]+\.ts)/.exec(script)?.[1];
expectThat(entry !== undefined && existsSync(entry), `package.json has "ping": "node src/….ts" (${script || "missing"})`);

const code = changed.filter((p) => p.startsWith("src/") && p.endsWith(".ts") && existsSync(p)).map((p) => [p, readText(p)]);
expectThat(code.some(([, text]) => /run-claude-process\.ts|claude-structured-output\.ts/.test(text)), "new code calls Claude through run-claude-process.ts");
const bad = code.filter(([, text]) =>
  /@anthropic-ai\/sdk|api\.anthropic\.com|x-api-key|["']--bare["']|ANTHROPIC_API_KEY\s*[:=]/.test(text)).map(([p]) => p);
expectThat(bad.length === 0, `no SDK, API endpoint, key assignment or --bare (${bad.join(", ") || "none"})`);
const deps = (p) => JSON.stringify([p.dependencies, p.devDependencies]);
expectThat(deps(pkg) === deps(base), "no new dependencies");
finish();
