// Check: a new `npm run <name>` script prints the right chunk count for every handbook page, and the
// README Scripts table lists it.
import { baseFile, changed, expectThat, finish, readText, runNode } from "./check-helpers.mjs";

const pkg = JSON.parse(readText("package.json"));
const base = JSON.parse(baseFile("package.json"));
const added = Object.entries(pkg.scripts ?? {}).filter(([name]) => !(name in (base.scripts ?? {})));
const cli = added.find(([, cmd]) => /^node src\/[\w./-]+\.ts/.test(cmd));
expectThat(cli !== undefined, `a new npm script runs node src/….ts (${added.map(([n]) => n).join(", ") || "none added"})`);

const { loadHandbookChunks } = await import(new URL("../src/handbook-chunker.ts", import.meta.url).href);
const expected = new Map();
for (const chunk of loadHandbookChunks()) {
  const page = chunk.chunkId.split("#")[0];
  expected.set(page, (expected.get(page) ?? 0) + 1);
}
if (cli) {
  const result = runNode(cli[1].replace(/^node /, "").split(/\s+/));
  const wrong = [...expected].filter(([page, n]) => !new RegExp(`\\b${page}\\b\\D*\\b${n}\\b`, "m").test(result.stdout));
  expectThat(result.status === 0 && wrong.length === 0, `prints the right count for all ${expected.size} pages (wrong or missing: ${wrong.map(([p]) => p).join(", ") || "none"})`);
  expectThat(readText("README.md").includes(`npm run ${cli[0]}`), `README mentions \`npm run ${cli[0]}\``);
}
const tests = changed.filter((p) => /^test\/[^/]+\.test\.ts$/.test(p));
console.log(`info new or changed test files: ${tests.join(", ") || "none"}`);
finish();
