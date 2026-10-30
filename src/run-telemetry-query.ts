// Part 7 lab: after a `claude -p` run with telemetry on, ask Prometheus (from `npm run telemetry:up`)
// for each session's tokens by type and estimated cost. No Claude calls.
//
//   npm run telemetry:query -- [--session <session id>]
import { parseArgs } from "node:util";
import { COST_METRIC, GRAFANA_URL, PROMETHEUS_URL, sessionUsage, TOKEN_METRIC, usageQuery } from "./claude-telemetry.ts";

const { values } = parseArgs({ options: { session: { type: "string" } } });
const usage = await sessionUsage(values.session);
if ("reason" in usage) {
  console.error(usage.reason);
  process.exit(1);
}

console.log(`Prometheus ${PROMETHEUS_URL}/api/v1/query:\n  ${usageQuery(TOKEN_METRIC, "", "session_id, type")}\n  ${usageQuery(COST_METRIC, "", "session_id")}\n`);
if (usage.length === 0) console.log("No claude_code series yet. Run claude with telemetry on, wait about 15 seconds, and try again.");
for (const s of usage) {
  const tokens = ["input", "output", "cacheRead", "cacheCreation"].map((t) => `${t} ${s.tokens[t] ?? 0}`).join(", ");
  console.log(`session ${s.sessionId}: ${tokens}; estimated cost $${s.costUsd.toFixed(4)}`);
}
console.log(`\nDashboard: ${GRAFANA_URL} (Claude Code usage). On a seat the dollar figure is an estimate; your real limit is plan usage (/usage).`);
