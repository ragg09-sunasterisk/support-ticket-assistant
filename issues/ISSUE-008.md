---
id: ISSUE-008
status: in-progress
auto-fix: true
---
# A heading without Latin letters gets an empty chunk ID

Reported by: Andrea (docs)

We are adding a Japanese section to a draft page (`## 返金について`) and a section called `## ???` as a
placeholder. Both come out of the chunker with broken IDs: `hb-21#` and `hb-21#-2`. Citations like
`[hb-21#]` are useless, and `hb-21#` doesn't match the chunk ID pattern the acceptance tests use.

## How to reproduce

```ts
import { chunkPage, parseHandbookPage } from "./src/handbook-chunker.ts";
const md = "---\nid: hb-21\ntitle: Draft\naccess: public\nallowed_roles: [support_agent]\n---\n# Draft\n\n## 返金について\n\nText.\n\n## ???\n\nMore.\n";
console.log(chunkPage(parseHandbookPage(md, "data/handbook/21-draft.md")).map((c) => c.chunkId));
// [ 'hb-21#', 'hb-21#-2' ]
```

## What I expected

Every chunk gets a non-empty ID after the `#` that matches `^hb-\d{2}#[a-z0-9-]+$`, different for each
section, and the same every time the page is loaded. The IDs of the existing 20 pages must not change
(the evals and logs refer to them).
