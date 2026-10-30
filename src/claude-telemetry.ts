// Part 7: Claude Code telemetry for lab runs. `telemetryEnv` turns OpenTelemetry metrics on for one
// `claude -p` run (sent to the local collector in telemetry/), and `sessionUsage` reads that session's
// tokens and estimated cost back from Prometheus. Failures are returned as values.

export const OTLP_ENDPOINT = "http://localhost:4317";
export const PROMETHEUS_URL = "http://localhost:9090";
// Same port as telemetry/docker-compose.yml: GRAFANA_PORT if set, else 3000.
export const GRAFANA_URL = `http://localhost:${process.env.GRAFANA_PORT ?? "3000"}`;
// The collector's Prometheus exporter adds the unit and `_total` to the OTel names
// claude_code.token.usage (tokens) and claude_code.cost.usage (USD).
export const TOKEN_METRIC = "claude_code_token_usage_tokens_total";
export const COST_METRIC = "claude_code_cost_usage_USD_total";

/**
 * The environment for one run with metrics on. Prompt text and tool details stay out: those switches
 * are off by default and are removed here even if the caller's shell sets them. No logs exporter.
 */
export function telemetryEnv(base: NodeJS.ProcessEnv, attributes: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...base,
    CLAUDE_CODE_ENABLE_TELEMETRY: "1",
    OTEL_METRICS_EXPORTER: "otlp",
    OTEL_EXPORTER_OTLP_PROTOCOL: "grpc",
    OTEL_EXPORTER_OTLP_ENDPOINT: OTLP_ENDPOINT,
    OTEL_METRIC_EXPORT_INTERVAL: "5000",
    // Claude Code exports deltas by default; Prometheus counters are cumulative. With deltas a short run
    // showed only part of its cost in Prometheus (see logs/part-07-step-log.md, step 8).
    OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: "cumulative",
    OTEL_RESOURCE_ATTRIBUTES: Object.entries(attributes).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join(","),
  };
  for (const name of ["OTEL_LOG_USER_PROMPTS", "OTEL_LOG_TOOL_DETAILS", "OTEL_LOGS_EXPORTER"]) delete env[name];
  return env;
}

export interface PromSample {
  labels: Record<string, string>;
  value: number;
}
export type PromResult = { ok: true; samples: PromSample[] } | { ok: false; reason: string };
export type FetchJson = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface PromResponse {
  status?: string;
  error?: string;
  data?: { result?: { metric?: Record<string, string>; value?: [number, string] }[] };
}

/** Runs one instant PromQL query against Prometheus's HTTP API. */
export async function promQuery(query: string, fetchJson: FetchJson = fetch, baseUrl = PROMETHEUS_URL): Promise<PromResult> {
  try {
    const response = await fetchJson(`${baseUrl}/api/v1/query?query=${encodeURIComponent(query)}`);
    const body = (await response.json()) as PromResponse;
    if (!response.ok || body.status !== "success") return { ok: false, reason: `Prometheus ${response.status}: ${body.error ?? "query failed"}` };
    const samples = (body.data?.result ?? []).map((r) => ({ labels: r.metric ?? {}, value: Number(r.value?.[1] ?? NaN) }));
    return { ok: true, samples };
  } catch (error) {
    return { ok: false, reason: `Prometheus not reachable at ${baseUrl} (is \`npm run telemetry:up\` running?): ${error instanceof Error ? error.message : String(error)}` };
  }
}

export interface SessionUsage {
  sessionId: string;
  /** Tokens by type: input, output, cacheRead, cacheCreation. */
  tokens: Record<string, number>;
  costUsd: number;
}

/**
 * The last value of each counter over the past day, summed per label set. A session's series stops
 * changing when the run ends; `last_over_time` keeps it in an instant query after it goes stale.
 */
export function usageQuery(metric: string, filter: string, by: string): string {
  return `sum by (${by}) (last_over_time(${metric}${filter}[1d]))`;
}

/** Tokens by type and estimated cost per session, from the two counters. Optionally one session only. */
export async function sessionUsage(sessionId?: string, fetchJson: FetchJson = fetch, baseUrl = PROMETHEUS_URL): Promise<SessionUsage[] | { reason: string }> {
  const filter = sessionId ? `{session_id="${sessionId.replace(/[^\w-]/g, "")}"}` : "";
  const tokens = await promQuery(usageQuery(TOKEN_METRIC, filter, "session_id, type"), fetchJson, baseUrl);
  const cost = await promQuery(usageQuery(COST_METRIC, filter, "session_id"), fetchJson, baseUrl);
  if (!tokens.ok) return { reason: tokens.reason };
  if (!cost.ok) return { reason: cost.reason };
  const sessions = new Map<string, SessionUsage>();
  const get = (id: string) => {
    const usage = sessions.get(id) ?? { sessionId: id, tokens: {}, costUsd: 0 };
    sessions.set(id, usage);
    return usage;
  };
  for (const s of tokens.samples) get(s.labels.session_id ?? "?").tokens[s.labels.type ?? "?"] = s.value;
  for (const s of cost.samples) get(s.labels.session_id ?? "?").costUsd = s.value;
  return [...sessions.values()];
}
