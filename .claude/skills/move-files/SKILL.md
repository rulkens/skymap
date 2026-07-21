---
name: move-files
description: Use when moving or renaming a `.ts`/`.tsx` file, doing a folder reorg that relocates modules, relocating a module to a new directory, or when a task says "update all the imports" after a move. Triggers like "/move-files", "move X to Y", "rename this file", "reorganize the utils folder", "shift these renderers into a subfolder".
---

# `/move-files`: Move TS Files, Auto-Rewrite Imports

Moving files is the `move` subcommand of the refactoring CLI:

```bash
npm run refactor -- move src/old/foo.ts src/new/foo.ts       # single file
npm run refactor -- move --manifest moves.json               # [{from,to}, ...]
npm run refactor -- move src/old/foo.ts src/new/foo.ts --dry # preview only
```

`npm run move-files -- <from> <to>` stays a byte-identical alias, so existing
memories, plan tasks, and CLAUDE.md references that name it keep working. Both drive
ts-morph over one `Project` spanning `src/ + tests/ + tools/`, rewrite the moved
file's own imports and every importer's relative path, and drag the `tests/` mirror
(`.test.ts` / `.test.tsx`) along automatically.

Full guidance lives in the refactor skill: the shared blind spots (`.wesl`
`package::` imports and string-literal paths are NOT rewritten, so grep after),
`--dry`-first, and commit hygiene. That skill also covers renaming symbols,
extracting a symbol into its own file, inlining or deleting a wrapper, and finding a
symbol's references: [`.claude/skills/refactor/SKILL.md`](../refactor/SKILL.md).

## For orchestrators

Subagents do NOT see project skills. Any plan task or subagent dispatch that moves or
renames TS files MUST name `npm run refactor -- move` (or the `npm run move-files`
alias) in the dispatch prompt so the implementer uses it instead of hand-editing
import paths.
