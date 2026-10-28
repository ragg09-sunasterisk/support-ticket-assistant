// Part 2 lab: triage one ticket and print the validated result (or why there is no valid triage).
//
//   npm run triage -- [--ticket TCK-1001]
import { parseArgs } from "node:util";
import { loadTicket } from "./claude-ticket-client.ts";
import { triageTicket } from "./ticket-triage-client.ts";
import { TRIAGE_PROMPT_VERSION } from "./triage-prompt.ts";

const { values } = parseArgs({
  options: {
    ticket: { type: "string" },
    tickets: { type: "string", default: "data/tickets.jsonl" },
  },
});

const ticket = loadTicket(values.tickets, values.ticket);
console.log(`Ticket ${ticket.id}: ${ticket.subject}`);
console.log(`Prompt: ${TRIAGE_PROMPT_VERSION}\n`);

const result = await triageTicket(ticket);
if (result.ok) {
  console.log(JSON.stringify(result.triage, null, 2));
} else {
  console.log(`No valid triage, send to a person. Reason: ${result.reason}`);
  process.exitCode = 1;
}
const seconds = result.durationMs === undefined ? "?" : (result.durationMs / 1000).toFixed(1);
console.log(`\nModel: ${result.model ?? "unknown"} | ${seconds}s | est. $${result.estimatedCostUsd?.toFixed(6) ?? "?"}`);
