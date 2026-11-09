// Part 9: the seat-only guard for scripts that start `claude -p` workers. Besides ANTHROPIC_API_KEY (the
// other lab scripts' check), any variable that makes Claude Code use something other than the Team seat
// sign-in stops the run: a bearer token, a long-lived OAuth token or a cloud provider switch.
export const NOT_SEAT_VARS = [
  "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY",
];

/** A message naming the variables that are set, or null when the run would use the seat. */
export function seatOnlyProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  const set = NOT_SEAT_VARS.filter((name) => env[name] !== undefined);
  if (set.length === 0) return null;
  return `${set.join(", ")} ${set.length === 1 ? "is" : "are"} set: unset ${set.length === 1 ? "it" : "them"} so claude -p runs on your Team seat, not a key or another provider.`;
}
