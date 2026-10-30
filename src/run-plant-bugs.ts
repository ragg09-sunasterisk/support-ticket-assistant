// Part 7 lab: plant the 3 bugs from src/planted-bugs.ts in a checkout, so every learner starts from the
// same failing tests. It changes files in src/, so it needs a checkout you can throw away (a worktree or a
// second clone), never this one: the lab scripts copy this checkout's src/ and plant the bugs themselves.
//
//   git worktree add --detach ../sta-bugs && npm run plant-bugs -- --dir ../sta-bugs [--bugs id1,id2]
// Undo with `git restore src/` in that checkout.
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "./handbook-chunker.ts";
import { PLANTED_BUGS, plantBug } from "./planted-bugs.ts";

const { values } = parseArgs({ options: { dir: { type: "string" }, bugs: { type: "string" } } });
if (!values.dir || resolve(values.dir) === resolve(REPO_ROOT)) {
  console.error("Pass --dir <another checkout>, e.g. one made with `git worktree add --detach ../sta-bugs`. Not this one.");
  process.exit(1);
}
const root = resolve(values.dir);
const chosen = values.bugs ? PLANTED_BUGS.filter((b) => values.bugs?.split(",").includes(b.id)) : PLANTED_BUGS;

let failed = 0;
for (const bug of chosen) {
  const problem = plantBug(root, bug);
  if (problem) failed++;
  console.log(problem ? `could not plant ${bug.id}: ${problem}` : `planted ${bug.id} in ${bug.file}; now failing: ${bug.failingTest}`);
}
console.log(failed === 0 ? `\n${chosen.length} bugs planted in ${root}. Run \`npm test\` to see them fail.` : "");
process.exit(failed === 0 ? 0 : 1);
