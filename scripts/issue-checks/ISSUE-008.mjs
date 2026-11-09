// Hidden check, ISSUE-008: headings without Latin letters get non-empty, distinct, stable chunk IDs, and the
// 92 IDs of the real handbook are the same as on the base commit.
import { createHash } from "node:crypto";
import { expectThat, finish, importSrc } from "./check-helpers.mjs";

// sha256 of the sorted chunk IDs of the 20 real pages on the base commit (92 IDs).
const BASE_IDS_SHA256 = "f5809ad9e17412247ae725244365368ab2055b66e994c153ca29daa563f1e2f9";
const { chunkPage, parseHandbookPage, loadHandbookChunks } = await importSrc("src/handbook-chunker.ts");
const md = "---\nid: hb-21\ntitle: Draft\naccess: public\nallowed_roles: [support_agent]\n---\n# Draft\n\nIntro.\n\n" +
  "## 返金について\n\nText.\n\n## ???\n\nMore.\n\n## 日本語\n\nEven more.\n\n## Refunds\n\nLast.\n";
const ids = () => chunkPage(parseHandbookPage(md, "data/handbook/21-draft.md")).map((c) => c.chunkId);
const first = ids();
expectThat(first.length === 5, `5 chunks (got ${first.length})`);
expectThat(first.every((id) => /^hb-\d{2}#[a-z0-9-]+$/.test(id)), `every ID matches the pattern (${first.join(", ")})`);
expectThat(new Set(first).size === first.length, "the IDs are all different");
expectThat(JSON.stringify(ids()) === JSON.stringify(first), "the same IDs on a second load");
expectThat(first.includes("hb-21#refunds"), "a Latin heading keeps its usual slug");
const real = loadHandbookChunks().map((c) => c.chunkId).sort();
const sha = createHash("sha256").update(real.join("\n")).digest("hex");
expectThat(sha === BASE_IDS_SHA256, `the 92 real chunk IDs are unchanged (${real.length} IDs)`);
finish();
