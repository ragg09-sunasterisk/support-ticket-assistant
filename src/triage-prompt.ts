// Loads a versioned triage system prompt from prompts/triage.<version>.md. The prompts live in Git
// as plain files so every wording change shows up in a diff and logged runs can be compared by version.
import { readFileSync } from "node:fs";

export const DEFAULT_TRIAGE_PROMPT_VERSION = "v2";

export interface TriagePrompt {
  version: string; // e.g. "triage-v2", logged with every run
  text: string;
}

const PROMPTS_DIR = new URL("../prompts/", import.meta.url);

// `version` is "v1", "v2", … Anything else is rejected so it can't point outside prompts/.
export function loadTriagePrompt(version: string = DEFAULT_TRIAGE_PROMPT_VERSION): TriagePrompt {
  if (!/^v\d+$/.test(version)) throw new Error(`Prompt version must look like "v2", got "${version}"`);
  const file = new URL(`triage.${version}.md`, PROMPTS_DIR);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`No prompt file for ${version}: expected prompts/triage.${version}.md`);
  }
  // Files end with a newline; the prompt sent to Claude does not.
  return { version: `triage-${version}`, text: text.trimEnd() };
}
