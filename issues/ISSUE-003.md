---
id: ISSUE-003
status: open
auto-fix: false
---
# A handbook page title that starts with "[" loses its bracket

Reported by: Andrea (docs)

We are drafting a page titled `[Beta] Storefront themes` for the handbook. In my local copy the search
results show its title as `Beta] Storefront themes`: the opening bracket is gone, and if the title has a
comma (`[Beta] Themes, fonts`) the comma's space goes too (`Beta] Themes,fonts`).

## How to reproduce

```ts
import { parseHandbookPage } from "./src/handbook-chunker.ts";
const page = parseHandbookPage(
  "---\nid: hb-21\ntitle: [Beta] Storefront themes\naccess: public\nallowed_roles: [support_agent, engineer, security]\nupdated: 2026-10-20\n---\n# [Beta] Storefront themes\n\nIntro.\n",
  "data/handbook/21-storefront-themes.md",
);
console.log(page.title); // Beta] Storefront themes
```

## What I expected

The title (and any other plain text field) comes through exactly as written: `[Beta] Storefront themes`.
`allowed_roles: [support_agent, engineer, security]` must still be read as a list of three roles.
