---
name: refactor
description: Use when performing a mechanical code refactor in skymap. Rename a symbol repo-wide, extract a symbol into its own file, inline or delete a passthrough wrapper, find who uses a symbol, or move/reorganize files of any kind (TS, CSS, assets). Triggers like "/refactor", "rename this function everywhere", "extract X into its own file", "inline this wrapper", "delete this unused helper", "who uses this symbol", "move X to Y", "rename this file", "update all the imports", "reorganize the utils folder", "shift these renderers into a subfolder", "folder reorg".
---

# `/refactor`: ts-morph Refactoring CLI

`npm run refactor -- <subcommand>` drives ts-morph over one `Project` spanning
`src/ + tests/ + tools/` (no single tsconfig covers all three). Every import in
skymap is deep + relative with no barrels, so a mechanical rename or move re-derives
every `../../foo` per importer, a job for the AST rather than a hand-edit.

```bash
npm run refactor -- rename  <file>#<symbol> <newName> [--no-file-rename]
npm run refactor -- extract <file>#<symbol> <dest.ts>
npm run refactor -- inline  <file>#<symbol>
npm run refactor -- delete  <file>#<symbol>
npm run refactor -- refs    <file>#<symbol>
npm run move-files -- <from> <to>   # the only move command
```

Global flags on every subcommand: `--dry` (report the blast radius, save nothing) and
`--manifest <ops.json>` (batch: validate every entry against the one Project, then a
single save; a throw on any entry aborts the whole batch before disk is touched).
`--json` (machine-readable) applies to the symbol subcommands
(`rename`/`extract`/`inline`/`delete`/`refs`).

## When to reach for each subcommand

- **`rename`**: the symbol's name is wrong, or a concept got renamed and its file
  should track it. Renames every reference project-wide AND renames the file plus its
  `tests/` mirror by default, because the house rule is filename = export name
  (`utils/`, `@types/`). Pass `--no-file-rename` for the files that rule does not
  cover: a multi-export `tools/` helper, or a PascalCase component whose basename is a
  concept not the exact export. When the basename does not already track the old
  symbol name, the file is left alone even without the flag.

- **`extract`**: a file has grown a second exported symbol and you want it in its own
  file (the one-symbol-per-file rule). Moves the target plus its exclusive file-local
  helpers (deps reached only through the moving cohort) into `dest.ts` and repoints
  every importer. See the shared-dep refusal below. Note: a plain `//` line comment
  sitting directly above a dragged helper is dropped in the move (JSDoc `/** */`
  blocks survive); re-check the moved file and restore any lost comment by hand.

- **`inline`**: a passthrough wrapper earns its deletion, meaning an alias, a
  same-signature single-call wrapper, or an aliased re-export that adds nothing.
  Repoints every call site at the underlying symbol, imported from its real file, then
  removes the wrapper (and its file plus mirror when it was the file's only export).
  This is the delete-proxy-surfaces convention as one command. It refuses anything
  with real logic; see below.

- **`delete`**: remove a dead one-symbol file (and its `tests/` mirror). Refuses if
  ANY reference exists; see below.

- **`refs`**: "who uses this symbol, and how?" Read-only. Prints every reference
  classified as `import` / `call` / `type-position` / `re-export` / `test`, each with
  its nearest named enclosing declaration, plus summary counts (total refs, distinct
  files, tests). This is the worklist for the manual paths the CLI deliberately does
  not automate (change-signature, non-passthrough inlining). `--json` emits
  `{ target, summary: { refs, files, tests }, refs: [...] }`.

- **Moving files** is `npm run move-files -- <from> <to>` (or `--manifest <moves.json>` with
  `[{from,to}, ...]`), not a `refactor` subcommand. See [`move-files`](#move-files) below.

## Refusals are the workflow, not errors to fight

Two subcommands stop and hand you a worklist instead of guessing. Hand-fix, then
re-run.

- **`extract` refuses on a shared file-local dep.** If the target reaches a local
  helper that code left behind ALSO uses, extraction refuses and names each shared
  helper, leaving the tree byte-for-byte unchanged. Moving that helper would orphan
  the stayers; copying it would fork one definition into two that drift. The honest
  fix: `extract` that helper into its own file first, then re-run so the closure is
  all-exclusive. The refusal is a design signal telling you which helpers need their
  own file.
- **`extract` refuses an existing destination.** It only creates a new file, so it
  can't place a second symbol in a file it has already made.

- **`inline` refuses on a non-passthrough.** Folding a body with real logic into each
  call site is a per-site judgement. It throws with the classified reference list (the
  same report `refs` prints) so you edit the interesting sites by hand.

- **`delete` refuses when any reference exists**, re-exports and tests included. A
  delete has no safe partial form. It throws with the full reference list; remove the
  references first, then re-run.

## Blind spots of the `refactor` subcommands

Only TypeScript import/export specifiers and value references are AST-tracked. These
are NOT rewritten by `rename`, `extract`, `inline` or `delete`. `move-files` has its own
list, below; it does handle `import()`, `vi.mock()` and `?worker` specifiers.

- **`.wesl` shader imports** (`import package::...`): a separate module graph.
- **String-literal paths**: `rawDataPath()` keys, shader/asset URLs, dynamic
  `import()` strings, `vi.mock()` path literals, anything referenced as text rather
  than as a symbol.

- **`?worker` / `?url` / `?raw` import specifiers**: they are ambient-typed, so a
  stale path passes tsc AND `vite build` and breaks only at runtime.
- **`.mts` files**: outside the ts-morph project (only `.ts`/`.tsx` are globbed);
  `npm run typecheck` (the `tsconfig.tools.json` pass) catches their stale imports.
- **Type properties and loose fixtures**: `rename` handles exported declarations
  only, not type properties, and fixtures full of `as unknown as` / `Partial<…>`
  accept a stale key silently. Grep them separately.
- **Ratchet allow-lists** (e.g. `tests/helpers/conventions/inlineTypeFiles.ts`)
  hold paths as strings and are not updated.
- **Ad-hoc ts-morph importer rewrites**: never repoint importers with a one-off
  ts-morph script. A module move is `npm run move-files -- <from> <to>` (it rewrites
  every importer project-wide) and a symbol rename is `refactor rename`. In any
  ts-morph code, `ImportDeclaration.remove()` on a file's first import drops the
  module header comment and the blank line after it; use `removeImportKeepingTrivia`
  (`tools/utils/refactor/`) instead.

After any rename/extract/inline/move, `grep` for the old name and old basename to
catch those by hand.

### Per-subcommand gaps

- **`rename`**: its file move skips CSS.
- **`extract`** needs an exported symbol, can write `../../node_modules/<pkg>/index`
  specifiers (rewrite them to the bare package name), and re-quotes to double
  quotes, so run `npx prettier --write` on the touched files.

## `move-files`

Run it from the repo root. It rewrites JS, TS and CSS references project-wide: imports,
`import()`, `require()`, `vi.mock()`/`jest.mock()` paths, `?worker` suffixes, aliases,
`composes … from`, `@import` and `url()`. It drags the `tests/` mirror and a `.tsx`'s
`.module.css`. Full reference: `packages/move-files/README.md`.

| Exit | What it means                                   | What to do                                                                                                    |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 0    | Clean                                           | Commit the move                                                                                               |
| 1    | **The moves are written** (unless `--dry`), and `file:line` findings list what they newly broke | Fix each finding by hand. Don't re-run: the sources are gone, so it would be refused                          |
| 2    | Refused, nothing written, every reason listed   | Fix the batch and re-run                                                                                      |
| 3    | A write failed partway; stderr names the path and every file finished | Finish by hand. A moved file not yet home sits beside its destination as `<name>.move-files-tmp` |

Reported as findings when they break, not rewritten: `.astro`, `.mdx`, `.vue` and `.svelte`
imports, Sass and Less, and non-import path strings.

Not seen at all, so grep for these by hand: `.wesl` (`package::` imports),
`/// <reference path>`, JSDoc `import()` and `import.meta.glob`.

It doesn't mirror faceted tests (`foo.facet.test.ts`; add manifest entries), and it leaves
the emptied source directory behind.

## Always

- **`--dry` first.** It prints the expanded operation set and the blast radius (the
  classified references for symbol ops, the rewritten-file set for `move-files`) and saves
  nothing. Read it before committing to the real run.
- **`npm run build` after import-graph surgery.** ts-morph keeps the tree compiling
  for the cases it tracks; the string-literal blind spots above surface only at build
  or runtime. `npm run typecheck` catches the TS-level breakage.
- **One mechanical op per commit, no content edits mixed in.** A pure rename/move
  commit keeps git's rename detection working (old→new link, surviving `git blame`)
  and keeps the diff reviewable. Content changes go in a follow-up commit.

## For orchestrators

Subagents do NOT see project skills. Any plan task or subagent dispatch that renames,
extracts, inlines, deletes, moves, or reorganizes files MUST name the command in the
dispatch prompt (`npm run move-files` for a move, the `npm run refactor` subcommand for
the rest) so the implementer uses it instead of hand-editing import paths.
