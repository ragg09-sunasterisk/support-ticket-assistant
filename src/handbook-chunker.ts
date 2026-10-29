// Part 4: splits the handbook pages in `data/handbook/` into one chunk per `##` section. Text before
// the first `##` goes with the page's `#` title. Chunk IDs are `<page id>#<heading slug>`, e.g.
// `hb-09#refunds`, so they stay the same as long as the heading does.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const HANDBOOK_DIR = join(REPO_ROOT, "data", "handbook");

export interface HandbookPage {
  id: string;
  title: string;
  access: string;
  allowedRoles: string[];
  updated: string;
  sourcePath: string;
  body: string;
}

export interface HandbookChunk {
  chunkId: string;
  sourcePath: string;
  pageId: string;
  title: string;
  heading: string;
  text: string;
  // The role filter (handbook-search.ts) uses allowedRoles; access is shown to the reader.
  access: string;
  allowedRoles: string[];
}

// "Troubleshooting 401 \"signature mismatch\"" → "troubleshooting-401-signature-mismatch"
export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The front matter is flat `key: value` lines; `[a, b]` is a list. Small enough not to need a YAML library.
function parseFrontMatter(block: string, file: string): Record<string, string | string[]> {
  const fields: Record<string, string | string[]> = {};
  for (const line of block.split("\n")) {
    const match = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, raw] = match as unknown as [string, string, string];
    fields[key] = key === "allowed_roles" || raw.startsWith("[")
      ? raw.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim()).filter(Boolean)
      : raw;
  }
  for (const key of ["id", "title", "access", "allowed_roles"]) {
    if (!(key in fields)) throw new Error(`${file}: front matter has no "${key}"`);
  }
  // The id becomes part of every chunk ID and of `<document id="...">`, so keep it simple.
  if (!/^hb-\d{2}$/.test(String(fields.id))) throw new Error(`${file}: id must look like hb-01, got "${fields.id}"`);
  return fields;
}

export function parseHandbookPage(markdown: string, sourcePath: string): HandbookPage {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(markdown.replace(/\r\n/g, "\n"));
  if (!match) throw new Error(`${sourcePath}: no YAML front matter`);
  const fields = parseFrontMatter(match[1] ?? "", sourcePath);
  const roles = fields.allowed_roles;
  return {
    id: String(fields.id),
    title: String(fields.title),
    access: String(fields.access),
    allowedRoles: Array.isArray(roles) ? roles : [String(roles)],
    updated: String(fields.updated ?? ""),
    sourcePath,
    body: match[2] ?? "",
  };
}

export function chunkPage(page: HandbookPage): HandbookChunk[] {
  const sections: { heading: string; lines: string[] }[] = [{ heading: page.title, lines: [] }];
  let inFence = false;
  for (const line of page.body.split("\n")) {
    // Inside a ``` code block, `#` lines are code (e.g. shell comments), not headings.
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const h2 = inFence ? null : /^##\s+(.+?)\s*$/.exec(line);
    if (h2) sections.push({ heading: h2[1] ?? "", lines: [] });
    // The `#` title line itself is not repeated in the text; the chunk carries the title as a field.
    else if (inFence || !/^#\s/.test(line)) sections.at(-1)?.lines.push(line);
  }

  const used = new Set<string>();
  const chunks: HandbookChunk[] = [];
  for (const section of sections) {
    const text = section.lines.join("\n").trim();
    if (text === "") continue; // A page with no intro text gets no title chunk.
    // A repeated heading gets -2, -3, ...; skip any suffix a real heading already took ("Refunds 2").
    const base = slugify(section.heading);
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    chunks.push({
      chunkId: `${page.id}#${slug}`,
      sourcePath: page.sourcePath,
      pageId: page.id,
      title: page.title,
      heading: section.heading,
      text,
      access: page.access,
      allowedRoles: page.allowedRoles,
    });
  }
  return chunks;
}

// Source paths are relative to the repo root with forward slashes, e.g. `data/handbook/09-....md`.
export function loadHandbookChunks(dir = HANDBOOK_DIR): HandbookChunk[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .flatMap((file) => {
      const fullPath = join(dir, file);
      const sourcePath = relative(REPO_ROOT, fullPath).split("\\").join("/");
      return chunkPage(parseHandbookPage(readFileSync(fullPath, "utf8"), sourcePath));
    });
}
