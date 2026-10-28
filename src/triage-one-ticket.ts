// Part 2 lab: triage one ticket and print the validated result (or why there is no valid triage).
//
//   npm run triage -- [--ticket TCK-1001] [--prompt v2]
import { parseArgs } from "node:util";
import { loadTicket } from "./claude-ticket-client.ts";
import { triageTicket } from "./ticket-triage-client.ts";
import { DEFAULT_TRIAGE_PROMPT_VERSION, loadTriagePrompt } from "./triage-prompt.ts";

const { values } = parseArgs({
  options: {
    ticket: { type: "string" },
    tickets: { type: "string", default: "data/tickets.jsonl" },
    prompt: { type: "string", default: DEFAULT_TRIAGE_PROMPT_VERSION },
  },
});

const prompt = loadTriagePrompt(values.prompt);
const ticket = loadTicket(values.tickets, values.ticket);
console.log(`Ticket ${ticket.id}: ${ticket.subject}`);
console.log(`Prompt: ${prompt.version}\n`);

const result = await triageTicket(ticket, { systemPrompt: prompt.text });
if (result.ok) {
  console.log(JSON.stringify(result.triage, null, 2));
} else {
  console.log(`No valid triage, send to a person. Reason: ${result.reason}`);
  process.exitCode = 1;
}
const seconds = result.durationMs === undefined ? "?" : (result.durationMs / 1000).toFixed(1);
console.log(`\nModel: ${result.model ?? "unknown"} | ${seconds}s | est. $${result.estimatedCostUsd?.toFixed(6) ?? "?"}`);
