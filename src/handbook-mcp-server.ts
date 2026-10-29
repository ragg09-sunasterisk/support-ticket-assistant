// Part 5: the handbook MCP server over stdio. The role is server config, set once at startup:
//
//   node src/handbook-mcp-server.ts --role support_agent [--handbook-dir data/handbook]
//
// stdout carries the MCP protocol, so every message for people goes to stderr.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { HANDBOOK_DIR } from "./handbook-chunker.ts";
import { createHandbookMcpServer } from "./handbook-mcp-tool.ts";
import { handbookSearchFor, isRole, ROLES } from "./handbook-search.ts";

const USAGE = `Usage: node src/handbook-mcp-server.ts --role <${ROLES.join("|")}> [--handbook-dir data/handbook]`;

function fail(message: string): never {
  console.error(`${message}\n${USAGE}`);
  process.exit(2);
}

let values: { role?: string; "handbook-dir"?: string };
try {
  ({ values } = parseArgs({ options: { role: { type: "string" }, "handbook-dir": { type: "string" } } }));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const role = values.role;
if (role === undefined) fail("--role is required.");
if (!isRole(role)) fail(`Unknown role "${role}".`);

const dir = values["handbook-dir"] === undefined ? HANDBOOK_DIR : resolve(values["handbook-dir"]);
if (!existsSync(dir)) fail(`Handbook directory not found: ${dir}`);

// Build the index now, so a broken page fails at startup instead of on the first tool call.
try {
  handbookSearchFor(role, dir);
} catch (error) {
  fail(`Could not load the handbook: ${error instanceof Error ? error.message : String(error)}`);
}

serveStdio(() => createHandbookMcpServer(role, dir), { onerror: (error) => console.error(error) });
console.error(`handbook MCP server ready: role ${role}, handbook ${dir}`);
