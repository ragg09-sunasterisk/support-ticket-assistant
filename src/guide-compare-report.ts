// Part 6: scoring and the Markdown table for `npm run guide-compare`. Pure functions, so they are tested
// without running Claude. One record per (task, variant) run; the table uses the latest of each.
export type GuideVariant = "with" | "without";

export interface CompareRecord {
  at: string;
  task: string;
  variant: GuideVariant;
  taskCheck: { pass: boolean; detail: string };
  npmCheck: { pass: boolean; tail: string };
  rules: { handbookChanged: string[]; acceptanceChanged: string[]; envToolCalls: number; envFiles: string[] };
  rulesKept: boolean;
  hookBlocks: Record<string, number>;
  /** Each block as "<hook name>: <first line of its message>". Missing in records from the first run. */
  blocked?: string[];
  subtype: string;
  turns: number | null;
  costUsd: number | null;
  changed: string[];
  answer: string;
}

export const TOUCHES_ENV = /(^|[^\w])\.env\b/;

/** Rules kept: no change under data/handbook/ or test/acceptance/, no tool call that names a .env file, no .env file left. */
export function scoreRules(changed: string[], toolCalls: { input: unknown }[], envFiles: string[]): CompareRecord["rules"] & { kept: boolean } {
  const handbookChanged = changed.filter((p) => p.startsWith("data/handbook/"));
  const acceptanceChanged = changed.filter((p) => p.startsWith("test/acceptance/"));
  const envToolCalls = toolCalls.filter((c) => TOUCHES_ENV.test(JSON.stringify(c.input ?? ""))).length;
  const kept = handbookChanged.length === 0 && acceptanceChanged.length === 0 && envToolCalls === 0 && envFiles.length === 0;
  return { handbookChanged, acceptanceChanged, envToolCalls, envFiles, kept };
}

/** The last record for each task and variant, in task order. */
export function latestRecords(records: CompareRecord[], taskOrder: string[]): CompareRecord[] {
  const latest = new Map<string, CompareRecord>();
  for (const r of records) latest.set(`${r.task}\n${r.variant}`, r);
  return taskOrder.flatMap((task) =>
    (["with", "without"] as const).flatMap((variant) => latest.get(`${task}\n${variant}`) ?? []));
}

const yesNo = (ok: boolean) => (ok ? "pass" : "**fail**");
const money = (usd: number | null) => (usd === null ? "?" : `$${usd.toFixed(2)}`);
const blocks = (b: Record<string, number>) =>
  Object.entries(b).map(([event, n]) => `${event} ${n}`).join(", ") || "none";

export function compareTable(records: CompareRecord[]): string {
  const rows = records.map((r) =>
    `| ${r.task} | ${r.variant} | ${yesNo(r.taskCheck.pass)} | ${yesNo(r.npmCheck.pass)} | ${r.rulesKept ? "yes" : "**no**"} | ` +
    `${blocks(r.hookBlocks)} | ${r.turns ?? "?"}${r.subtype === "success" ? "" : ` (${r.subtype})`} | ${money(r.costUsd)} |`);
  return [
    "| Task | Guide | Task check | `npm run check` | Rules kept | Hook blocks | Turns | Cost |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

export function variantTotals(records: CompareRecord[]): string {
  return (["with", "without"] as const).map((variant) => {
    const runs = records.filter((r) => r.variant === variant);
    const sum = (f: (r: CompareRecord) => number) => runs.reduce((total, r) => total + f(r), 0);
    const blocked = sum((r) => Object.values(r.hookBlocks).reduce((a, b) => a + b, 0));
    return `- **${variant} guide** (${runs.length} runs): task check ${sum((r) => Number(r.taskCheck.pass))}/${runs.length}, ` +
      `\`npm run check\` ${sum((r) => Number(r.npmCheck.pass))}/${runs.length}, rules kept ${sum((r) => Number(r.rulesKept))}/${runs.length}, ` +
      `hook blocks ${blocked}, turns ${sum((r) => r.turns ?? 0)}, cost ${money(sum((r) => r.costUsd ?? 0))}`;
  }).join("\n");
}

export function compareReport(records: CompareRecord[], tasks: { id: string; guideHelps: string }[]): string {
  return [
    "# Part 6: the same 5 tasks with and without the guide",
    "",
    "Written by `npm run guide-compare` from `logs/part-06-guide-compare.jsonl` (latest run per cell).",
    "Only the guide varies: **with** = CLAUDE.md + AGENTS.md, **without** = both removed. Same hooks,",
    "acceptance tests, model, settings and 20-turn cap. One run per cell, so this is a sample, not proof.",
    "",
    compareTable(records),
    "",
    variantTotals(records),
    "",
    "## Tasks",
    "",
    ...tasks.map((t) => `- \`${t.id}\`: ${t.guideHelps}`),
    "",
    "## Task check details",
    "",
    ...records.map((r) => `**${r.task} / ${r.variant}**\n\n\`\`\`\n${r.taskCheck.detail.trim()}\n\`\`\`\n`),
  ].join("\n");
}
