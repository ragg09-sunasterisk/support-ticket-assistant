// Part 8 lab: the evaluator-optimizer loop on one ticket. Drafts a reply with `claude -p`, has a second
// `claude -p` judge it against the rubric, and repeats with the feedback until PASS, FAIL or 4 rounds.
//
//   npm run reply-loop -- --ticket TCK-1028 [--max-rounds 1..4] [--log logs/part-08-reply-loop.jsonl]
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { loadTicket } from "./claude-ticket-client.ts";
import { DEFAULT_K, searchHandbook } from "./handbook-search.ts";
import { claudeReplyEvaluator, claudeReplyGenerator } from "./reply-loop-calls.ts";
import { MAX_ROUNDS, resolveMaxRounds, runReplyLoop } from "./reply-loop-controller.ts";
import type { ReplyTicket } from "./reply-loop-prompts.ts";

const { values } = parseArgs({
  options: {
    ticket: { type: "string" },
    "max-rounds": { type: "string" },
    log: { type: "string", default: "logs/part-08-reply-loop.jsonl" },
    tickets: { type: "string", default: "data/tickets.jsonl" },
  },
});

const usage = `Usage: npm run reply-loop -- --ticket <TCK-id> [--max-rounds 1..${MAX_ROUNDS}] [--log <file>]`;
if (!values.ticket) {
  console.error(usage);
  process.exit(1);
}
const maxRounds = resolveMaxRounds(values["max-rounds"] === undefined ? undefined : Number(values["max-rounds"]));
if (!maxRounds.ok) {
  console.error(`${maxRounds.reason}\n${usage}`);
  process.exit(1);
}

if (process.env.ANTHROPIC_API_KEY !== undefined) {
  console.error("ANTHROPIC_API_KEY is set: unset it so claude -p runs on your Team seat, not a key.");
  process.exit(1);
}

let ticket: ReplyTicket;
try {
  ticket = loadTicket(values.tickets, values.ticket) as ReplyTicket;
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

// support_agent: restricted pages are not in this role's index, so they can't reach either prompt.
const query = `${ticket.subject}\n${ticket.description}`.trim();
const chunks = query === "" ? [] : searchHandbook(query, DEFAULT_K, "support_agent");
mkdirSync(dirname(values.log), { recursive: true });

console.log(`Ticket ${ticket.id}: ${ticket.subject}`);
console.log(`Handbook chunks (support_agent): ${chunks.map((c) => c.chunk_id).join(", ") || "(none)"}`);
console.log(`Max rounds: ${maxRounds.value} | log: ${values.log}\n`);

const result = await runReplyLoop({
  ticket,
  chunks,
  maxRounds: maxRounds.value,
  generate: claudeReplyGenerator(),
  evaluate: claudeReplyEvaluator(),
  log: (record) => {
    appendFileSync(values.log, `${JSON.stringify(record)}\n`);
    console.log(`--- Round ${record.round}: ${record.evaluation ?? "no evaluation"} (${record.word_count ?? "?"} words)`);
    if (record.draft) console.log(record.draft);
    if (record.reason) console.log(`Evaluator: ${record.reason}`);
    for (const item of record.feedback) console.log(`  - line ${item.rubric_line}: ${item.problem}`);
    console.log(`  $${record.cost_usd.toFixed(4)} | ${record.turns} turns | ${(record.duration_ms / 1000).toFixed(1)}s\n`);
  },
});

console.log(`Stopped: ${result.stopReason} after ${result.rounds} round(s) | est. $${result.totalCostUsd.toFixed(4)}`);
if (result.error) console.log(`Error: ${result.error}`);
if (result.escalate) console.log("Escalate: a person must write or approve this reply.");
if (result.stopReason === "error") process.exitCode = 1;
