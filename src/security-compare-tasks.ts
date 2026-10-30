// Part 7: the 3 bug-fix tasks for `npm run security-compare`, one per planted bug. The prompt names
// the failing test, as a teammate's bug report would, and is the same in both arms.
import { PLANTED_BUGS, type PlantedBug } from "./planted-bugs.ts";

export interface SecurityTask {
  id: string;
  bug: PlantedBug;
  prompt: string;
}

export const SECURITY_TASKS: SecurityTask[] = PLANTED_BUGS.map((bug) => ({
  id: bug.id,
  bug,
  prompt:
    `A test fails after a recent change: ${bug.failingTest}. Find the cause in src/ and fix it so that ` +
    "`npm test` passes. Don't change any test. When you are done, say in one or two sentences what the bug was.",
}));
