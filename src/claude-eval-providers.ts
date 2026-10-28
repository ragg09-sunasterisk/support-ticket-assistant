// Custom promptfoo providers that run on the Team seat through `claude -p` (no API key):
// - ClaudeTriageProvider triages one ticket through the existing triage client.
// - ClaudeJudgeProvider answers promptfoo's llm-rubric grading prompt with {reason, pass, score}.
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo";
import { z } from "zod";
import type { Ticket } from "./claude-ticket-client.ts";
import { parseStructuredOutput, structuredClaudeArgs } from "./claude-structured-output.ts";
import { runClaudeProcess, type ClaudeRunner } from "./run-claude-process.ts";
import { triageTicket } from "./ticket-triage-client.ts";
import { JUDGE_ERROR, NO_VALID_TRIAGE } from "./triage-graders.ts";

// The prompt promptfoo hands this provider is the triage system prompt (prompts/triage.vN.md).
// The ticket comes from the test's `ticket_id` var.
export class ClaudeTriageProvider implements ApiProvider {
  private readonly tickets: Map<string, Ticket>;
  private readonly run: ClaudeRunner;

  constructor(tickets: Ticket[], run: ClaudeRunner = runClaudeProcess) {
    this.tickets = new Map(tickets.map((t) => [t.id, t]));
    this.run = run;
  }

  id(): string {
    return "claude-p-triage";
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const ticketId = String(context?.vars.ticket_id ?? "");
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return { error: `Unknown ticket_id "${ticketId}"` };

    const result = await triageTicket(ticket, { systemPrompt: prompt, run: this.run });
    // A failed triage is still an output, so the graders run and score it as a miss.
    return {
      output: result.ok ? JSON.stringify(result.triage) : `${NO_VALID_TRIAGE}: ${result.reason}`,
      cost: result.estimatedCostUsd,
      metadata: { model: result.model, durationMs: result.durationMs },
    };
  }
}

export const GraderVerdict = z.object({
  reason: z.string(),
  pass: z.boolean(),
  score: z.number().min(0).max(1),
});

const GRADER_VERDICT_JSON_SCHEMA = JSON.stringify(z.toJSONSchema(GraderVerdict, { target: "draft-7" }));

// llm-rubric sends a JSON list of chat messages. The system message becomes --system-prompt and the
// rest goes in on stdin. A plain string is sent as it is.
export function splitGradingPrompt(prompt: string): { system: string; user: string } {
  const fallback = { system: "You are a strict grader. Reply with the verdict only.", user: prompt };
  let messages: unknown;
  try {
    messages = JSON.parse(prompt);
  } catch {
    return fallback;
  }
  if (!Array.isArray(messages)) return fallback;
  const text = (role: string) =>
    messages
      .filter((m): m is { role: string; content: string } => m?.role === role && typeof m.content === "string")
      .map((m) => m.content)
      .join("\n\n");
  return { system: text("system") || fallback.system, user: text("user") };
}

export class ClaudeJudgeProvider implements ApiProvider {
  private readonly run: ClaudeRunner;

  constructor(run: ClaudeRunner = runClaudeProcess) {
    this.run = run;
  }

  id(): string {
    return "claude-p-judge";
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const { system, user } = splitGradingPrompt(prompt);
    try {
      const result = parseStructuredOutput(await this.run(structuredClaudeArgs(GRADER_VERDICT_JSON_SCHEMA, system), user), GraderVerdict);
      if (!result.ok) return { error: `${JUDGE_ERROR}: ${result.reason}` };
      return { output: JSON.stringify(result.data), cost: result.estimatedCostUsd };
    } catch (error) {
      return { error: `${JUDGE_ERROR}: ${(error as Error).message}` };
    }
  }
}
