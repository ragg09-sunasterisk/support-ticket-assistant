// Checks the Part 7 telemetry helpers with a fake Prometheus (no Claude calls, no network).
import { describe, expect, it } from "vitest";
import { promQuery, sessionUsage, telemetryEnv, usageQuery, type FetchJson } from "../src/claude-telemetry.ts";

const reply = (result: unknown[], ok = true): FetchJson => async () =>
  ({ ok, status: ok ? 200 : 400, json: async () => (ok ? { status: "success", data: { result } } : { status: "error", error: "bad query" }) });

describe("telemetryEnv", () => {
  it("turns OTLP metrics on for the local collector and labels the run", () => {
    const env = telemetryEnv({ PATH: "/bin" }, { lab: "part-07", arm: "after" });
    expect(env).toMatchObject({
      PATH: "/bin", CLAUDE_CODE_ENABLE_TELEMETRY: "1", OTEL_METRICS_EXPORTER: "otlp",
      OTEL_EXPORTER_OTLP_PROTOCOL: "grpc", OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4317",
      OTEL_RESOURCE_ATTRIBUTES: "lab=part-07,arm=after",
      OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: "cumulative",
    });
  });

  it("keeps prompt text and tool details out, even if the shell turned them on", () => {
    const env = telemetryEnv({ OTEL_LOG_USER_PROMPTS: "1", OTEL_LOG_TOOL_DETAILS: "1", OTEL_LOGS_EXPORTER: "otlp" }, {});
    expect(env.OTEL_LOG_USER_PROMPTS).toBeUndefined();
    expect(env.OTEL_LOG_TOOL_DETAILS).toBeUndefined();
    expect(env.OTEL_LOGS_EXPORTER).toBeUndefined();
  });
});

describe("promQuery and sessionUsage", () => {
  it("returns a reason instead of throwing when Prometheus is down or rejects the query", async () => {
    const down: FetchJson = async () => { throw new Error("ECONNREFUSED"); };
    expect(await promQuery("up", down)).toMatchObject({ ok: false, reason: expect.stringMatching(/telemetry:up/) });
    expect(await promQuery("up", reply([], false))).toEqual({ ok: false, reason: "Prometheus 400: bad query" });
  });

  it("asks for each counter's last value, so a finished session stays visible after it goes stale", () => {
    expect(usageQuery("claude_code_cost_usage_USD_total", '{session_id="s1"}', "session_id"))
      .toBe('sum by (session_id) (last_over_time(claude_code_cost_usage_USD_total{session_id="s1"}[1d]))');
  });

  it("groups tokens by type and cost by session", async () => {
    const fake: FetchJson = async (url) => {
      const query = decodeURIComponent(url);
      return reply(query.includes("token")
        ? [{ metric: { session_id: "s1", type: "input" }, value: [0, "12"] }, { metric: { session_id: "s1", type: "output" }, value: [0, "340"] }]
        : [{ metric: { session_id: "s1" }, value: [0, "0.05"] }])(url);
    };
    expect(await sessionUsage("s1", fake)).toEqual([{ sessionId: "s1", tokens: { input: 12, output: 340 }, costUsd: 0.05 }]);
  });
});
