// Hidden check, ISSUE-003: front matter text that starts with "[" stays as written; allowed_roles is still
// a list; the real handbook still loads the same 92 chunks.
import { expectThat, finish, importSrc } from "./check-helpers.mjs";

const { parseHandbookPage, loadHandbookChunks } = await importSrc("src/handbook-chunker.ts");
const page = (title) =>
  parseHandbookPage(`---\nid: hb-21\ntitle: ${title}\naccess: public\nallowed_roles: [support_agent, engineer, security]\nupdated: 2026-10-20\n---\n# ${title}\n\nIntro.\n`, "data/handbook/21-x.md");

const a = page("[Beta] Storefront themes");
expectThat(a.title === "[Beta] Storefront themes", `title kept as written (got ${JSON.stringify(a.title)})`);
const b = page("[Beta] Themes, fonts");
expectThat(b.title === "[Beta] Themes, fonts", `title with a comma kept (got ${JSON.stringify(b.title)})`);
expectThat(JSON.stringify(a.allowedRoles) === '["support_agent","engineer","security"]', "allowed_roles is still a list of three");
expectThat(loadHandbookChunks().length === 92, "the real handbook still has 92 chunks");
finish();
