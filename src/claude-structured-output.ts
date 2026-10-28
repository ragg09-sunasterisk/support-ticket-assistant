// Shared by every `claude -p --json-schema` call (the triage client and the eval judge): the CLI
// flags, and turning the process output into validated data or a reason it failed.
import { z } from "zod";
import { processFailure, type ProcessOutput } from "./run-claude-process.ts";

export interface RunInfo {
  model?: string;
  estimatedCostUsd?: number;
  durationMs?: number;
}

export type StructuredResult<T> = ({ ok: true; data: T } | { ok: false; reason: string }) & RunInfo;

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
// still works with every tool turned off (checked on Claude Code 2.1.312). Not `--bare`: that
// ignores the seat sign-in.
export function structuredClaudeArgs(jsonSchema: string, systemPrompt: string): string[] {
  return [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    jsonSchema,
    "--system-prompt",
    systemPrompt,
    "--tools",
    "",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--setting-sources",
    "",
    "--no-session-persistence",
  ];
}

export function parseStructuredOutput<T>(output: ProcessOutput, schema: z.ZodType<T>): StructuredResult<T> {
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

  const parsed = schema.safeParse(json.structured_output);
  if (!parsed.success) {
    return { ok: false, reason: `structured_output failed validation: ${z.prettifyError(parsed.error)}`, ...info };
  }
  return { ok: true, data: parsed.data, ...info };
}
