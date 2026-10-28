// Part 2: triages one ticket with `claude -p --json-schema` and validates `structured_output` with Zod.
// Any failure becomes a "no valid triage" result with a reason, so the ticket can go to a person.
import { z } from "zod";
import { buildPrompt, type Ticket } from "./claude-ticket-client.ts";
import { processFailure, runClaudeProcess, type ClaudeRunner, type ProcessOutput } from "./run-claude-process.ts";
import { TICKET_TRIAGE_JSON_SCHEMA, TicketTriage } from "./ticket-triage-schema.ts";
import { TRIAGE_SYSTEM_PROMPT } from "./triage-prompt.ts";

interface RunInfo {
  model?: string;
  estimatedCostUsd?: number;
  durationMs?: number;
}

export type TriageResult = ({ ok: true; triage: TicketTriage } | { ok: false; reason: string }) & RunInfo;

// The subset of the `claude -p --output-format json` result we rely on.
interface ClaudeStructuredJson {
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  total_cost_usd?: number;
  duration_ms?: number;
  modelUsage?: Record<string, unknown>;
}

// Same small, machine-independent context as Part 1. `--tools ""` is safe here: structured output
// still works with every tool turned off (checked on Claude Code 2.1.312).
export const TRIAGE_CLAUDE_ARGS = [
  "-p",
  "--output-format",
  "json",
  "--json-schema",
  TICKET_TRIAGE_JSON_SCHEMA,
  "--system-prompt",
  TRIAGE_SYSTEM_PROMPT,
  "--tools",
  "",
  "--strict-mcp-config",
  "--disable-slash-commands",
  "--setting-sources",
  "",
  "--no-session-persistence",
];

export function parseTriageOutput(output: ProcessOutput): TriageResult {
  const failure = processFailure(output);
  if (failure) return { ok: false, reason: failure };

  let json: ClaudeStructuredJson;
  try {
    json = JSON.parse(output.stdout) as ClaudeStructuredJson;
  } catch {
    return { ok: false, reason: `claude did not return JSON: ${output.stdout.slice(0, 200)}` };
  }
  if (typeof json !== "object" || json === null) {
    return { ok: false, reason: `claude returned JSON that is not an object: ${output.stdout.slice(0, 200)}` };
  }

  const info: RunInfo = {
    model: Object.keys(json.modelUsage ?? {}).join(", ") || undefined,
    estimatedCostUsd: json.total_cost_usd,
    durationMs: json.duration_ms,
  };
  if (json.is_error) return { ok: false, reason: `claude returned an error: ${json.result}`, ...info };
  if (json.structured_output === undefined || json.structured_output === null) {
    return { ok: false, reason: "claude returned no structured_output", ...info };
  }

  const parsed = TicketTriage.safeParse(json.structured_output);
  if (!parsed.success) {
    return { ok: false, reason: `structured_output failed validation: ${z.prettifyError(parsed.error)}`, ...info };
  }
  return { ok: true, triage: parsed.data, ...info };
}

// `run` is injectable so tests can fake the claude process.
export async function triageTicket(ticket: Ticket, run: ClaudeRunner = runClaudeProcess): Promise<TriageResult> {
  try {
    return parseTriageOutput(await run(TRIAGE_CLAUDE_ARGS, buildPrompt(ticket)));
  } catch (error) {
    return { ok: false, reason: `triage call failed: ${(error as Error).message}` };
  }
}
