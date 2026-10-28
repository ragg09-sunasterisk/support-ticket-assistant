// The TicketTriage contract: one Zod schema that validates Claude's output and generates the
// JSON Schema handed to `claude -p --json-schema`.
import { z } from "zod";

// Categories from data/handbook/03-ticket-triage-and-escalation.md.
export const CATEGORIES = [
  "billing",
  "orders_payments",
  "technical_bug",
  "account_access",
  "integrations",
  "data_privacy",
  "feature_request",
  "other",
] as const;

// Severity levels from data/handbook/02-support-severity-levels.md.
export const SEVERITIES = ["low", "medium", "high", "critical"] as const;

export const TicketTriage = z.object({
  category: z.enum(CATEGORIES),
  severity: z.enum(SEVERITIES),
  confidence: z.number().min(0).max(1),
  escalation_reason: z.string().nullable(),
});

export type TicketTriage = z.infer<typeof TicketTriage>;

// The CLI rejects Zod's default target (draft 2020-12), so generate draft-7.
export const TICKET_TRIAGE_JSON_SCHEMA = JSON.stringify(z.toJSONSchema(TicketTriage, { target: "draft-7" }));
