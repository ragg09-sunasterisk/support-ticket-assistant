---
id: ISSUE-001
status: in-progress
auto-fix: true
---
# Retrieval check prints a Node stack trace when the set file doesn't exist

Reported by: Liza (support tooling)

I mistyped the path to my own retrieval set and got a wall of Node internals instead of an error message.

## How to reproduce

```bash
npm run retrieval-check -- --set evals/retrieval-typo.jsonl
```

## What happens

```
node:fs:539
    return binding.readFileUtf8(path, stringToFlags(options.flag));
                   ^

Error: ENOENT: no such file or directory, open 'evals/retrieval-typo.jsonl'
    at readFileSync (node:fs:539:20)
    at loadRetrievalSet (file:///…/src/retrieval-set.ts:17:10)
    …
Node.js v26.7.0
```

## What I expected

One short line that says the set file can't be read and names the path I gave, and a non-zero exit
code, like the script already does for a bad `--k` or `--role`. No stack trace. A normal run with the
default set should work as before.
