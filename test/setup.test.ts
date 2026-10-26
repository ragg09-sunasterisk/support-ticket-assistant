// Setup checks: `npm test` passing means your machine is ready for the course.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  engines: { node: string };
};

describe("setup", () => {
  it("runs on the Node version in package.json engines", () => {
    const minimum = Number(pkg.engines.node.replace(">=", ""));
    const major = Number(process.versions.node.split(".")[0]);
    expect(major).toBeGreaterThanOrEqual(minimum);
  });

  it("has no ANTHROPIC_API_KEY set (labs run on your Team seat, not an API key)", () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});
