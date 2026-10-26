// Blocks .env files and key-shaped strings from being committed.
// Scans the git index (everything staged or tracked), so it works both as the
// pre-commit hook and as `npm run check:secrets`.
import { execFileSync } from "node:child_process";
import { basename } from "node:path";

// .env, .env.local, .env.production … but .env.example is allowed.
const isEnvFile = (path) => /^\.env(\..+)?$/.test(basename(path)) && basename(path) !== ".env.example";

// POSIX ERE (git grep -E), so no \s or \d.
const KEY_PATTERNS = [
  "sk-ant-[A-Za-z0-9_-]{20,}", // Anthropic
  "ANTHROPIC_API_KEY[[:space:]]*[=:][[:space:]]*['\"]?[A-Za-z0-9]", // key assigned a value
  "sk-(proj-)?[A-Za-z0-9_-]{32,}", // OpenAI
  "gh[pousr]_[A-Za-z0-9]{36,}", // GitHub token
  "AKIA[0-9A-Z]{16}", // AWS access key ID
  "-----BEGIN [A-Z ]*PRIVATE KEY-----",
];

const git = (args) => execFileSync("git", args, { encoding: "utf8" });

function findEnvFiles() {
  return git(["ls-files", "--cached", "-z"]).split("\0").filter(isEnvFile);
}

function findKeys() {
  const patterns = KEY_PATTERNS.flatMap((p) => ["-e", p]);
  // This file holds the patterns themselves, so it is excluded.
  const args = ["grep", "--cached", "-n", "-I", "-E", ...patterns, "--", ".", ":!scripts/check-secrets.mjs"];
  try {
    // Output lines are "path:line:content"; keep path:line so the secret is not echoed.
    return git(args).trim().split("\n").map((line) => line.split(":", 2).join(":"));
  } catch (error) {
    if (error.status === 1) return []; // git grep exits 1 when nothing matches
    throw error;
  }
}

const problems = [
  ...findEnvFiles().map((path) => `${path}: .env files must not be committed`),
  ...findKeys().map((where) => `${where}: looks like an API key or private key`),
];

if (problems.length > 0) {
  console.error("check-secrets: blocked\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("\nUnstage it (git restore --staged <file>) and remove the secret. This course never uses API keys.");
  process.exit(1);
}
console.log("check-secrets: no .env files or keys found");
