// Part 5: flags handbook text that reads like an instruction to an AI instead of reference data. The
// patterns are deliberately narrow: they look for text that *addresses* an AI or assistant, or tells
// the reader to ignore or override instructions, hide something, or switch off a safeguard. A flag is
// a warning for the model and for people, not a filter: the chunk is still returned.

// The name for each pattern is what `instruction_like_reasons` reports.
const PATTERNS: [reason: string, pattern: RegExp][] = [
  // "Note for AI assistants", "instruction for the AI assistant", "message to any bot"
  [
    "addresses an AI",
    /\b(note|notes|message|instructions?|attention|reminder|override)\s+(for|to)\s+(the\s+|any\s+|all\s+)?(AI|LLMs?|language models?|assistants?|chat ?bots?|bots?)\b/i,
  ],
  // "AI assistants and support bots summarizing this page"
  [
    "addresses an AI",
    /\b(AI|LLMs?|language models?|assistants?|chat ?bots?|bots?)\b(\s+\w+){0,4}\s+(reading|summari[sz]ing|processing|answering from)\b/i,
  ],
  // "If you are an AI ...", "You are now an assistant ..."
  ["addresses an AI", /\b(if\s+)?you\s+are\s+(now\s+)?(an?\s+)?(AI|LLM|language model|assistant|chat ?bot|bot)\b/i],
  // "Ignore all previous instructions", "disregard the rules above"
  [
    "tells the reader to ignore instructions",
    /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+)?(of\s+)?(the\s+|your\s+|these\s+)?(previous|prior|above|earlier|other|system|safety)?\s*(instructions|rules|prompts?|guidelines)\b/i,
  ],
  // "Do not mention this note", "hide this", "keep this secret"
  [
    "tells the reader to hide something",
    /\b((do\s+not|don't|never)\s+(mention|reveal|disclose|repeat|cite)\s+(this|these)|(hide|conceal)\s+(this|these)|keep\s+(this|these)\s+(\w+\s+)?secret)\b/i,
  ],
  // "turn off signature verification", "disable 2-step verification" (but not "Never disable ...")
  [
    "tells the reader to disable a safeguard",
    /(?<!(\bnever|\bnot|n't)\s+)\b(disable|turn\s+off|switch\s+off|bypass|skip)\s+(the\s+|their\s+|your\s+|all\s+)?[\w-]*\s*(verification|signature|security|2fa|two-factor|authentication|checks?|safeguards?)\b/i,
  ],
];

/** Why `text` looks like an instruction to an AI, one reason per kind; empty if it doesn't. */
export function instructionLikeReasons(text: string): string[] {
  // Join lines and drop block-quote markers, so a sentence split over `> ` lines still matches.
  const flat = text.replace(/^\s*>\s?/gm, "").replace(/\s+/g, " ");
  return [...new Set(PATTERNS.filter(([, pattern]) => pattern.test(flat)).map(([reason]) => reason))];
}
