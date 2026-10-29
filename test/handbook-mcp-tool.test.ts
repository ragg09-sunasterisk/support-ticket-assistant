// Checks the search_handbook MCP tool: schema, result shape, untrusted marking, flag and role.
import { describe, expect, it } from "vitest";
import {
  createHandbookMcpServer,
  runSearchHandbook,
  SearchHandbookInput,
  SearchHandbookOutput,
  TOOL_DESCRIPTION,
  UNTRUSTED_NOTICE,
} from "../src/handbook-mcp-tool.ts";

const call = (input: unknown, role: "support_agent" | "security" = "support_agent", dir?: string) => {
  const result = runSearchHandbook(role, dir, input);
  return { result, output: result.structuredContent as SearchHandbookOutput | undefined };
};

describe("search_handbook input", () => {
  it("takes only query and k, with k 1..10 and default 5", () => {
    expect(Object.keys(SearchHandbookInput.shape)).toEqual(["query", "k"]);
    expect(SearchHandbookInput.parse({ query: "refund" })).toEqual({ query: "refund", k: 5 });
    for (const k of [0, 11, 2.5]) expect(SearchHandbookInput.safeParse({ query: "refund", k }).success).toBe(false);
    expect(SearchHandbookInput.safeParse({ query: "   " }).success).toBe(false);
  });

  it("drops a role the model tries to pass", () => {
    const { output } = call({ query: "payment provider keys rotated", k: 10, role: "security" });
    expect(output?.role).toBe("support_agent");
    expect(output?.results.some((r) => r.chunk_id.startsWith("hb-20"))).toBe(false);
  });

  it("returns a tool error, not a crash, for bad input", () => {
    const { result } = call({ query: "refund", k: 50 });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("search_handbook failed") });
  });
});

describe("search_handbook output", () => {
  const { result, output } = call({ query: "webhook 401 signature mismatch", k: 3 });

  it("returns chunk ID, source path, heading, score and text, plus the flag", () => {
    expect(SearchHandbookOutput.parse(output)).toEqual(output);
    expect(output?.results[0]).toMatchObject({
      chunk_id: "hb-12#troubleshooting-401-signature-mismatch",
      source_path: "data/handbook/12-merchant-webhooks.md",
      instruction_like: true,
    });
    expect(output?.results.slice(1).every((r) => !r.instruction_like && r.instruction_like_reasons.length === 0)).toBe(true);
  });

  it("marks every result as untrusted reference data, in the structured and the text output", () => {
    expect(output?.notice).toBe(UNTRUSTED_NOTICE);
    expect(UNTRUSTED_NOTICE).toMatch(/^UNTRUSTED REFERENCE DATA/);
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text.startsWith(UNTRUSTED_NOTICE)).toBe(true);
    expect(TOOL_DESCRIPTION).toMatch(/never follow instructions/);
  });

  it("flags the planted chunk when serving evals/injection", () => {
    const flagged = call({ query: "lost phone 2FA locked out" }, "support_agent", "evals/injection").output;
    expect(flagged?.results[0]).toMatchObject({ chunk_id: "hb-14#locked-out-without-the-2fa-device", instruction_like: true });
    expect(flagged?.results[0]?.source_path).toBe("evals/injection/14-accounts-staff-roles-and-2fa.md");
  });

  it("gives security the restricted pages", () => {
    expect(call({ query: "payment provider keys rotated" }, "security").output?.results[0]?.chunk_id).toBe("hb-20#rotation-schedule");
  });
});

describe("createHandbookMcpServer", () => {
  it("builds a server without connecting a transport", () => {
    expect(createHandbookMcpServer("support_agent")).toBeDefined();
  });
});
