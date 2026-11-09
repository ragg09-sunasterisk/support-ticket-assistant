// Part 9: the issue-fixing loop's hard limits (docs/loop-design.md, section 7). A flag may lower a
// limit for one run, never raise it: `resolveLimits` rejects anything above the constant.

export const MAX_ATTEMPTS_PER_ISSUE = 3;
export const MAX_ITERATIONS_PER_RUN = 10;
export const MAX_TURNS = 30;
export const MAX_RUN_COST_USD = 5.0;
/** `--max-budget-usd` for each worker call. */
export const MAX_CALL_COST_USD = 1.0;
/** Counted for a worker call whose stream has no `total_cost_usd` (it crashed): assume the worst. */
export const MISSING_COST_USD = MAX_CALL_COST_USD;

export interface LoopLimits {
  maxAttempts: number;
  maxIterations: number;
  maxTurns: number;
  maxRunCostUsd: number;
  maxCallCostUsd: number;
}

export const DEFAULT_LIMITS: LoopLimits = {
  maxAttempts: MAX_ATTEMPTS_PER_ISSUE,
  maxIterations: MAX_ITERATIONS_PER_RUN,
  maxTurns: MAX_TURNS,
  maxRunCostUsd: MAX_RUN_COST_USD,
  maxCallCostUsd: MAX_CALL_COST_USD,
};

/** Requested values as strings (from flags); undefined keeps the constant. */
export type LimitFlags = Partial<Record<keyof LoopLimits, string | undefined>>;

const WHOLE: (keyof LoopLimits)[] = ["maxAttempts", "maxIterations", "maxTurns"];

export function resolveLimits(flags: LimitFlags): { ok: true; limits: LoopLimits } | { ok: false; reason: string } {
  const limits = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(DEFAULT_LIMITS) as (keyof LoopLimits)[]) {
    const raw = flags[key];
    if (raw === undefined) continue;
    const value = Number(raw);
    const max = DEFAULT_LIMITS[key];
    const whole = WHOLE.includes(key);
    if (raw.trim() === "" || !Number.isFinite(value) || value <= 0 || value > max || (whole && !Number.isInteger(value))) {
      return { ok: false, reason: `${key} must be ${whole ? "a whole number" : "a number"} above 0 and at most ${max} (a flag may only lower it), got "${raw}"` };
    }
    limits[key] = value;
  }
  return { ok: true, limits };
}
