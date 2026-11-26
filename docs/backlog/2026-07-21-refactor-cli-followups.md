# refactor CLI — deferred follow-ups

Surfaced during the final whole-branch review of the refactor CLI
(`tools/refactor/` + `tools/utils/refactor/`). None blocks the branch; each is
a scoped tidy or a gap in the extract closure worth capturing before it is lost.

## extract closure gaps

- **Leading `//` line comments are dropped.** `getText(true)` keeps only JSDoc,
  so a `//` comment directly above a dragged declaration is lost in the move.
  Switch to a full-range move that includes leading trivia, with a test pinning
  a `//`-commented helper. `tools/utils/refactor/planExtract.ts`.
- **`export { target }` declaration form.** A separate `export { target }`
  statement moves the declaration without its `export` keyword and orphans the
  export statement. Add a refusal or handle the form, with a test.
- **default / namespace import carry.** The default-import and namespace-import
  carry, plus the re-import / prune combination, are untested. Add fixtures.
- **TYPE import carry is broken, not just untested** (confirmed 2026-09-18).
  `extract tools/parsers/desiFits.ts#parseFitsBinTable` emitted a file
  referencing `FitsBinTable` and `FitsColumn` with no import for either, so the
  extracted file did not compile — `tsc` caught it as `TS2304: Cannot find
name`. The types were exported from the source file and used only in the
  target's signature; nothing carried them or refused. A type-only reference in
  the moved symbol's signature is the reproduction.

## Consolidation candidates

- **Alias-follow idiom** (`resolvesToSameFile` / `declaringFileOf`) repeats in the
  ts-morph planners; consolidate. Separately,
  `retargetSpecifier`'s `bringsInOnlyThis` lacks dedupe against an existing
  underlying import.

## Error-context polish

- **Manifest entry errors** should name the offending row / index
  (`tools/refactor/refactor.ts` + `parseMovePairEntry.ts`).
- **`readManifest`** catch should preserve the original error.
- **`renderRefReport`** human summary `(N in tests/)` reads as a file count but
  actually counts refs.
