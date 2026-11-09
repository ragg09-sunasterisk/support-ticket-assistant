// Part 9: the loop's state on disk. Issues are `issues/ISSUE-NNN.md` with a small front matter
// (id, status, auto-fix), the toggle is `issues/auto-fix.json`, progress is `issues/progress.json`.
// Everything the loop needs to resume lives here, not in the process (docs/loop-design.md, section 3).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ISSUE_STATUSES = ["open", "in-progress", "ready-for-review", "needs-human", "closed"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export interface Issue {
  id: string;
  status: IssueStatus;
  autoFix: boolean;
  title: string;
  /** Everything after the front matter: the text the worker gets. */
  body: string;
  path: string;
}

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

export function parseIssue(markdown: string, path: string): Issue {
  const match = FRONT_MATTER.exec(markdown.replace(/\r\n/g, "\n"));
  if (!match) throw new Error(`${path}: no front matter`);
  const fields: Record<string, string> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const field = /^([\w-]+):\s*(\S*)/.exec(line.trim());
    if (field) fields[field[1] ?? ""] = field[2] ?? "";
  }
  const id = fields.id ?? "";
  if (!/^ISSUE-\d{3}$/.test(id)) throw new Error(`${path}: id must look like ISSUE-001, got "${id}"`);
  const status = fields.status as IssueStatus;
  if (!ISSUE_STATUSES.includes(status)) throw new Error(`${path}: unknown status "${fields.status}"`);
  const body = (match[2] ?? "").trim();
  const title = /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? id;
  // Only the exact value `true` is the label; a typo means "people only".
  return { id, status, autoFix: fields["auto-fix"] === "true", title, body, path };
}

export function loadIssues(dir: string): Issue[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => /^ISSUE-\d{3}\.md$/.test(file))
    .sort()
    .map((file) => {
      const issue = parseIssue(readFileSync(join(dir, file), "utf8"), join(dir, file));
      // Commits, branches and escalations are named by id, the file by its name: they must agree.
      if (`${issue.id}.md` !== file) throw new Error(`${join(dir, file)}: id ${issue.id} doesn't match the file name`);
      return issue;
    });
}

/** Rewrites only the `status:` line of the front matter. */
export function setIssueStatus(path: string, status: IssueStatus): void {
  const text = readFileSync(path, "utf8");
  const next = text.replace(/^(---\n[\s\S]*?)^status:[^\n]*$/m, `$1status: ${status}`);
  if (next === text && !text.includes(`status: ${status}`)) throw new Error(`${path}: no status line to update`);
  writeFileSync(path, next);
}

export interface ToggleRead {
  enabled: boolean;
  /** What was read, for the log: the file text, or why it couldn't be used. */
  read: string;
}

/** Off unless the file exists, is JSON and has `enabled: true`. Read before every iteration. */
export function readToggle(path: string): ToggleRead {
  if (!existsSync(path)) return { enabled: false, read: `${path} is missing` };
  const text = readFileSync(path, "utf8");
  try {
    const parsed = JSON.parse(text) as { enabled?: unknown };
    return { enabled: parsed?.enabled === true, read: text.trim() };
  } catch {
    return { enabled: false, read: `not JSON: ${text.trim().slice(0, 200)}` };
  }
}

/** One attempt, as the escalation summary and the next attempt need it. */
export interface AttemptSummary {
  attempt: number;
  turns: number | null;
  cost_usd: number | null;
  files_changed: string[];
  diff_stat: string;
  check: Record<string, number | null>;
  failing_step: string | null;
  failing_detail: string[];
  fingerprint: string | null;
  outcome: string;
  worker_message: string;
}

export interface Progress {
  done: string[];
  next: string[];
  needs_human: string[];
  attempts: Record<string, number>;
  last_fingerprint: Record<string, string | null>;
  /** The verifier's evidence from the last failed attempt, given to the next one. */
  feedback: Record<string, string>;
  history: Record<string, AttemptSummary[]>;
}

export const emptyProgress = (): Progress => ({
  done: [], next: [], needs_human: [], attempts: {}, last_fingerprint: {}, feedback: {}, history: {},
});

export function loadProgress(path: string): Progress {
  if (!existsSync(path)) return emptyProgress();
  return { ...emptyProgress(), ...(JSON.parse(readFileSync(path, "utf8")) as Partial<Progress>) };
}

export function saveProgress(path: string, progress: Progress): void {
  writeFileSync(path, `${JSON.stringify(progress, null, 2)}\n`);
}

/** Section 2's pick condition: labelled, and open or a resumable in-progress. */
export function isPickable(issue: Issue, progress: Progress, maxAttempts: number): boolean {
  if (!issue.autoFix) return false;
  if (issue.status === "open") return true;
  return issue.status === "in-progress" && (progress.attempts[issue.id] ?? 0) < maxAttempts;
}

/** Lowest id first. */
export function pickNextIssue(issues: Issue[], progress: Progress, maxAttempts: number): Issue | null {
  return [...issues].sort((a, b) => a.id.localeCompare(b.id)).find((i) => isPickable(i, progress, maxAttempts)) ?? null;
}
