// Part 9: the escalation summary (docs/loop-design.md, section 8) written to issues/escalations/<ID>.md
// when an issue stops without going green. Three fixed parts: what was tried (per attempt), the evidence
// (commands and exit codes from the verifier, not the model's summary) and one decision for a person.
import type { AttemptSummary } from "./issue-files.ts";
import type { IssueStopRule } from "./fix-issues-rules.ts";

export interface EscalationInput {
  id: string;
  title: string;
  rule: IssueStopRule;
  compared: Record<string, unknown>;
  branch: string;
  history: AttemptSummary[];
}

const money = (n: number | null) => (n === null ? "cost unknown" : `$${n.toFixed(2)}`);
const short = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);

function decisionNeeded(input: EscalationInput): string {
  const last = input.history.at(-1);
  const c = input.compared;
  switch (input.rule) {
    case "no-diff":
      return "The worker changed nothing (its last message is quoted above). Is the issue fixable as written, or does a person first have to decide the expected behaviour or give more detail?";
    case "protected-path":
      return `The change touched ${(c.paths as string[]).join(", ")}, which the loop may never change. Should a person make that change by hand, or should the issue be rewritten so the fix stays outside protected paths?`;
    case "repeated-failure":
      return `Two attempts in a row failed \`npm run ${String(c.failing_step)}\` the same way. Is the expected behaviour in the issue right (and the failing test wrong), or should a person fix it?`;
    case "turn-limit":
      return `The worker hit the turn limit (${String(c.num_turns)} of ${String(c.max_turns)}). Should the issue be split into smaller issues, or fixed by a person?`;
    case "budget":
      return `The worker call hit its ${money(c.threshold as number)} cap. Is the issue worth a bigger budget from a person, or should it be split?`;
    case "max-attempts":
      return `${String(c.attempts)} attempts failed with different errors (last: \`${last?.failing_step ?? "?"}\`). Should a person take it over, or is the issue missing information?`;
    case "worker-error":
      return `The worker process failed (exit ${String(c.exit_code)}, ${String(c.subtype)}). Is \`claude\` working on this machine (sign-in, network, seat limits)? Reopen the issue (status: open) once it is.`;
    default:
      return "What should happen with this issue?";
  }
}

export function renderEscalation(input: EscalationInput): string {
  const { id, title, rule, compared, branch, history } = input;
  const last = history.at(-1);
  const fp = typeof compared.fingerprint === "string" ? ` (fingerprint ${compared.fingerprint.slice(0, 12)}…)` : "";
  const lines = [
    `# ${id} needs a human`,
    "",
    `**${title}**`,
    "",
    `- Stop rule: ${rule}${fp}`,
    `- Branch: ${branch} (no commit from the loop, nothing merged, no PR)`,
    "",
    "## What was tried",
    "",
    ...history.map((a) =>
      `${a.attempt}. Attempt ${a.attempt} (${a.turns ?? "?"} turns, ${money(a.cost_usd)}): ` +
      `${a.files_changed.length > 0 ? `changed ${a.files_changed.join(", ")}` : "changed nothing"}; outcome: ${a.outcome}`),
    "",
    "## Evidence",
    "",
  ];
  if (last) {
    const checks = Object.entries(last.check);
    if (checks.length > 0) lines.push(...checks.map(([step, code]) => `- \`npm run ${step}\` → exit ${code}`));
    else if (last.files_changed.length === 0) lines.push("- `git status --porcelain` in the worktree → empty: nothing changed, so `npm run check` was not run");
    else lines.push(`- \`git status --porcelain\` → ${last.files_changed.join(", ")}; \`npm run check\` was not run (protected path or worker error)`);
    if (last.failing_detail.length > 0) lines.push(`- Failing (${last.failing_step}): ${last.failing_detail.slice(0, 10).map((d) => `\`${short(d, 160)}\``).join("; ")}`);
    lines.push(`- \`git diff --stat\` of the last attempt → ${last.diff_stat || "no change"}`);
  }
  for (const [key, value] of Object.entries(compared)) {
    if (key === "worker_message" || key === "failing") continue;
    lines.push(`- ${key}: \`${short(typeof value === "string" ? value : JSON.stringify(value), 300)}\``);
  }
  if (last?.worker_message) lines.push(`- The worker's last message (model text, not evidence): "${short(last.worker_message.replace(/\s+/g, " "))}"`);
  lines.push("", "## Decision needed", "", decisionNeeded(input), "");
  return lines.join("\n");
}
