// Check: a new prompt version carries the change and is the default; v1 and v2 are untouched.
import { existsSync } from "node:fs";
import { changed, expectThat, finish, readText } from "./check-helpers.mjs";

expectThat(!changed.includes("prompts/triage.v1.md") && !changed.includes("prompts/triage.v2.md"), "prompts/triage.v1.md and v2.md unchanged");
const newVersions = changed.filter((p) => /^prompts\/triage\.v([3-9]|\d{2,})\.md$/.test(p) && existsSync(p));
expectThat(newVersions.length > 0, `a new prompt version was added (${newVersions.join(", ") || "none"})`);
expectThat(newVersions.some((p) => /20 words/i.test(readText(p))), "the new version mentions the 20-word limit");

const { loadTriagePrompt } = await import(new URL("../src/triage-prompt.ts", import.meta.url).href);
const prompt = loadTriagePrompt();
expectThat(/20 words/i.test(prompt.text) && prompt.version !== "triage-v2", `the default prompt is the new one (${prompt.version})`);
finish();
