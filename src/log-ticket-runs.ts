// Part 1 lab: send one ticket to Claude N times, print answer + tokens + estimated cost per run,
// and append every run to a JSONL log.
//
//   npm run ticket -- [--ticket TCK-1001] [--runs 5] [--log logs/part-01-runs.jsonl]
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { askClaude, buildPrompt, loadTicket } from "./claude-ticket-client.ts";

const { values } = parseArgs({
  options: {
    ticket: { type: "string" },
    runs: { type: "string", default: "1" },
    log: { type: "string", default: "logs/part-01-runs.jsonl" },
    tickets: { type: "string", default: "data/tickets.jsonl" },
  },
});

if (process.env.ANTHROPIC_API_KEY !== undefined) {
  console.error("ANTHROPIC_API_KEY is set: unset it so claude -p runs on your Team seat, not a key.");
  process.exit(1);
}

const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 1) {
  console.error(`--runs must be a positive integer, got "${values.runs}"`);
  process.exit(1);
}

const ticket = loadTicket(values.tickets, values.ticket);
const prompt = buildPrompt(ticket);
mkdirSync(dirname(values.log), { recursive: true });

console.log(`Ticket ${ticket.id}: ${ticket.subject}`);
console.log(`Runs: ${runs} | log: ${values.log}\n`);

let totalCost = 0;
let failures = 0;
for (let run = 1; run <= runs; run++) {
  try {
    const result = await askClaude(prompt);
    totalCost += result.estimatedCostUsd;
    const entry = { timestamp: new Date().toISOString(), run, ticketId: ticket.id, ...result };
    appendFileSync(values.log, JSON.stringify(entry) + "\n");

    console.log(`--- Run ${run}/${runs} (${result.model}, ${(result.durationMs / 1000).toFixed(1)}s) ---`);
    console.log(result.answer);
    console.log(
      `Tokens: input ${result.inputTokens}, output ${result.outputTokens}, ` +
        `cache write ${result.cacheCreationInputTokens}, cache read ${result.cacheReadInputTokens}`,
    );
    console.log(`Estimated cost: $${result.estimatedCostUsd.toFixed(6)}\n`);
  } catch (error) {
    failures++;
    console.error(`--- Run ${run}/${runs} failed: ${(error as Error).message}\n`);
  }
}

console.log(`Done: ${runs - failures}/${runs} runs succeeded, estimated total $${totalCost.toFixed(6)}`);
if (failures > 0) process.exitCode = 1;
