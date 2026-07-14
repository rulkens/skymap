---
name: move-files
description: Use when moving or renaming a `.ts`/`.tsx` file, doing a folder reorg that relocates modules, relocating a module to a new directory, or when a task says "update all the imports" after a move. Triggers like "/move-files", "move X to Y", "rename this file", "reorganize the utils folder", "shift these renderers into a subfolder".
---

# `/move-files` — Move TS Files, Auto-Rewrite Imports

## Why this skill exists

Every import in skymap is deep + relative with no barrels, so moving one
file means re-deriving every `../../foo` that resolves to it — the `../`
depth differs per importer. `tools/dev/moveFiles.ts` drives ts-morph over a
single `Project` spanning `src/ + tests/ + tools/` (neither tsconfig covers
all three) and rewrites imports in both directions: the moved file's own
imports and every importer of it.

## Usage

```bash
npm run move-files -- src/old/foo.ts src/new/foo.ts      # single file
npm run move-files -- --manifest moves.json              # [{from,to}, ...]
npm run move-files -- src/old/foo.ts src/new/foo.ts --dry # preview only
```

Always run `--dry` first — it prints the expanded move list and the set of
files whose imports would change, saving nothing.

## Test mirrors move automatically

Moving `src/X.ts` or `tools/X.ts` also moves its `tests/` mirror
(`tests/X.test.ts` / `tests/tools/X.test.ts`, `.test.tsx` when that's what
exists), so the parallel test tree keeps mirroring. You don't list the test
move yourself.

## What it does NOT update

Only TypeScript import/export specifiers are AST-tracked. It will NOT touch:

- `.wesl` shader imports (`import package::...`) — a separate module graph.
- String-literal paths: `rawDataPath()` keys, shader/asset URLs, dynamic
  `import()` strings, anything referenced as text.

After a move, `grep` for the old path and basename to catch those by hand.

## Commit hygiene

Do the pure move in its own commit with no content edits mixed in, so git's
rename detection links old→new and `git blame`/history survive. Content
changes go in a follow-up commit.

## For orchestrators

Subagents do NOT see project skills. Any plan task or subagent dispatch that
moves or renames TS files MUST name `npm run move-files` in the dispatch
prompt so the implementer uses it instead of hand-editing import paths.
