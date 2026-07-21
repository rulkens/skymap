---
name: refactor
description: Use when performing a mechanical code refactor in skymap. Rename a symbol repo-wide, extract a symbol into its own file, inline or delete a passthrough wrapper, find who uses a symbol, or move/reorganize `.ts`/`.tsx` files. Triggers like "/refactor", "rename this function everywhere", "extract X into its own file", "inline this wrapper", "delete this unused helper", "who uses this symbol", "move X to Y", "reorganize the utils folder".
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
npm run refactor -- move    <from> <to>
```

Global flags on every subcommand: `--dry` (report the blast radius, save nothing) and
`--manifest <ops.json>` (batch: validate every entry against the one Project, then a
single save; a throw on any entry aborts the whole batch before disk is touched).
`--json` (machine-readable) applies to the symbol subcommands
(`rename`/`extract`/`inline`/`delete`/`refs`); `move`'s report stays text-only.

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

- **`move`**: relocate or reorganize files. Same machinery as `npm run move-files`
  (which stays a byte-identical alias); rewrites both the moved file's own imports and
  every importer's relative path, and drags the `tests/` mirror. `move` manifests keep
  the `[{from,to}, ...]` object shape; the five symbol subcommands take a bare array of
  that subcommand's positional args per entry (a `rename` entry is
  `["src/utils/math/foo.ts#foo", "bar"]`).

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

- **`inline` refuses on a non-passthrough.** Folding a body with real logic into each
  call site is a per-site judgement. It throws with the classified reference list (the
  same report `refs` prints) so you edit the interesting sites by hand.

- **`delete` refuses when any reference exists**, re-exports and tests included. A
  delete has no safe partial form. It throws with the full reference list; remove the
  references first, then re-run.

## Blind spots that apply to EVERY subcommand

Only TypeScript import/export specifiers and value references are AST-tracked. These
are NOT rewritten by any subcommand:

- **`.wesl` shader imports** (`import package::...`): a separate module graph.
- **String-literal paths**: `rawDataPath()` keys, shader/asset URLs, dynamic
  `import()` strings, `vi.mock()` path literals, anything referenced as text rather
  than as a symbol.

After any rename/extract/inline/move, `grep` for the old name and old basename to
catch those by hand.

## Always

- **`--dry` first.** It prints the expanded operation set and the blast radius (the
  classified references for symbol ops, the rewritten-file set for `move`) and saves
  nothing. Read it before committing to the real run.
- **`npm run build` after import-graph surgery.** ts-morph keeps the tree compiling
  for the cases it tracks; the string-literal blind spots above surface only at build
  or runtime. `npm run typecheck` catches the TS-level breakage.
- **One mechanical op per commit, no content edits mixed in.** A pure rename/move
  commit keeps git's rename detection working (old→new link, surviving `git blame`)
  and keeps the diff reviewable. Content changes go in a follow-up commit.

## For orchestrators

Subagents do NOT see project skills. Any plan task or subagent dispatch that renames,
extracts, inlines, deletes, moves, or reorganizes TS files MUST name the relevant
`npm run refactor` subcommand in the dispatch prompt so the implementer uses it
instead of hand-editing import paths.
