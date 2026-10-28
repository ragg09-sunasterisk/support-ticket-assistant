// Triages one ticket with `claude -p --json-schema` and validates `structured_output` with Zod.
// Any failure becomes a "no valid triage" result with a reason, so the ticket can go to a person.
import { buildPrompt, type Ticket } from "./claude-ticket-client.ts";
import { parseStructuredOutput, structuredClaudeArgs, type RunInfo } from "./claude-structured-output.ts";
import { runClaudeProcess, type ClaudeRunner, type ProcessOutput } from "./run-claude-process.ts";
import { TICKET_TRIAGE_JSON_SCHEMA, TicketTriage } from "./ticket-triage-schema.ts";
import { loadTriagePrompt } from "./triage-prompt.ts";

export type TriageResult = ({ ok: true; triage: TicketTriage } | { ok: false; reason: string }) & RunInfo;

export interface TriageOptions {
  systemPrompt?: string; // defaults to the default prompt version (see src/triage-prompt.ts)
  run?: ClaudeRunner; // injectable so tests can fake the claude process
}

export function triageClaudeArgs(systemPrompt: string): string[] {
  return structuredClaudeArgs(TICKET_TRIAGE_JSON_SCHEMA, systemPrompt);
}

export function parseTriageOutput(output: ProcessOutput): TriageResult {
  const result = parseStructuredOutput(output, TicketTriage);
  if (!result.ok) return result;
  const { data, ...info } = result;
  return { ...info, triage: data };
}

export async function triageTicket(ticket: Ticket, options: TriageOptions = {}): Promise<TriageResult> {
  try {
    const systemPrompt = options.systemPrompt ?? loadTriagePrompt().text;
    const run = options.run ?? runClaudeProcess;
    return parseTriageOutput(await run(triageClaudeArgs(systemPrompt), buildPrompt(ticket)));
  } catch (error) {
    return { ok: false, reason: `triage call failed: ${(error as Error).message}` };
  }
}
